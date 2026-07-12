import { Pool, PoolClient } from 'pg';

// ─────────────────────────────────────────────────────────────────────────
// Capacity-based sharding — NOT primary/replica.
//
// Each SHARD_N is an independent Postgres database (e.g. separate free-tier
// instances). There is no "primary": every shard is a peer that can hold
// any row.
//
//   • WRITES (new rows): go to the first shard that still has room
//     (checked via `pg_database_size`). Once a shard crosses
//     MAX_SHARD_BYTES, new rows start landing on the next shard. Existing
//     rows are never moved between shards.
//   • READS / UPDATES / DELETES on existing rows: since we don't track
//     which shard holds which row, every shard is queried in parallel and
//     the results are merged in application code (`fanOut`). For
//     UPDATE/DELETE by id this is safe — only the shard actually holding
//     the row is affected; the rest are harmless no-ops.
//   • Multi-statement writes that must stay on ONE shard (e.g. inserting a
//     game plus its genres/downloads, or editing an existing game's
//     genre/download child rows) use `withNewRowTransaction` /
//     `withRowTransaction`, which pin every statement in the transaction
//     to a single shard's connection.
// ─────────────────────────────────────────────────────────────────────────

interface Shard {
  index: number;
  pool: Pool;
}

/** Thrown by withRowTransaction when no shard contains a row with the given id. */
export class RowNotFoundError extends Error {
  constructor(table: string, idColumn: string, idValue: string) {
    super(`No shard contains ${table}.${idColumn} = ${idValue}`);
    this.name = 'RowNotFoundError';
  }
}

/**
 * Strip SSL-related search params from a Postgres connection URL.
 *
 * pg-connection-string ≥ 3.x treats `sslmode=require` / `prefer` / `verify-ca`
 * as aliases for `sslmode=verify-full`, which enables cert verification and
 * overrides the explicit `ssl: { rejectUnauthorized: false }` we pass to Pool.
 * Removing these params lets our Pool-level `ssl` object be the sole authority.
 */
function sanitizeDbUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    u.searchParams.delete('sslmode');
    u.searchParams.delete('ssl');
    u.searchParams.delete('uselibpqcompat');
    return u.toString();
  } catch {
    return rawUrl; // not a standard URL (e.g. host=… key=value format) — leave as-is
  }
}

// Default ceiling per shard, in bytes. Override with MAX_SHARD_BYTES env var.
// 450 MB leaves headroom under common 512 MB free-tier Postgres limits.
const DEFAULT_MAX_SHARD_BYTES = 450 * 1024 * 1024;

// How long to trust a previously-picked write shard before re-checking its
// size. Avoids hitting pg_database_size() on every single write.
const WRITE_SHARD_CACHE_MS = 30_000;

// Random spread added on top of WRITE_SHARD_CACHE_MS so that many warm
// Vercel containers (which all got their cache filled around the same
// moment, e.g. right after a deploy) don't expire in lockstep and all
// re-check pg_database_size() on the same millisecond. Small per-container
// jitter turns a synchronized stampede into a smear over a few seconds.
const WRITE_SHARD_CACHE_JITTER_MS = 5_000;

// Delay before a single retry after a failed pool.connect(). On Aiven's
// free tier, "connect failed" almost always means max_connections is
// currently exhausted — retrying instantly just re-attacks a database
// that's already overloaded. This gives other serverless instances a
// chance to hit idleTimeoutMillis and free up a slot first.
const CONNECT_RETRY_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class ShardedDb {
  private shards: Shard[] = [];
  private initialized = false;
  private maxShardBytes = DEFAULT_MAX_SHARD_BYTES;

  private cachedWriteIndex: number | null = null;
  private cachedWriteIndexExpiresAt = 0;

  // Singleflight lock: while a size-check sweep is already in flight for
  // this container, concurrent callers await that SAME promise instead of
  // each starting their own loop over `pickWriteShardIndex`. Without this,
  // N requests arriving in the same container within the same tick (before
  // any of them has populated the cache) would each independently call
  // pg_database_size() on shard 0, shard 1, etc. — the in-container half of
  // the stampede described in the Vercel review. This does not fix the
  // cross-container half (each container still has its own cache/lock) —
  // that needs a shared store (Redis / Vercel KV) fed by a cron job, see
  // README follow-up.
  private pickWriteShardIndexInFlight: Promise<number> | null = null;

  // withRowTransaction builds its probe SQL with template-literal table/
  // column names rather than parameter placeholders (Postgres doesn't
  // support binding identifiers as query params). Every current call site
  // passes a hardcoded literal, never user input, but the method takes
  // plain strings — a future call site that accidentally threads a request
  // value through would be a SQL injection. This whitelist is a guardrail
  // against that, not a defense against an already-compromised call site.
  private static readonly ALLOWED_TABLES: Record<string, string[]> = {
    games: ['id', 'slug'],
    game_requests: ['id'],
    game_downloads: ['id'],
    link_reports: ['id'],
  };

  private init() {
    if (this.initialized) return;
    this.initialized = true;

    const urls: string[] = [];
    for (let i = 0; i <= 9; i++) {
      const url = process.env[`SHARD_${i}`];
      if (url) urls.push(url);
    }
    if (urls.length === 0 && process.env.DATABASE_URL) {
      urls.push(process.env.DATABASE_URL);
    }
    if (urls.length === 0) {
      console.error('[ShardedDb] No database URLs found. Set SHARD_0 or DATABASE_URL.');
      return;
    }

    if (process.env.MAX_SHARD_BYTES) {
      const parsed = parseInt(process.env.MAX_SHARD_BYTES, 10);
      if (!isNaN(parsed) && parsed > 0) this.maxShardBytes = parsed;
    }

    this.shards = urls.map((url, index) => {
      const rawCa = process.env[`PGCA_${index}`];
      // Vercel (and many CI systems) store multiline env vars with literal \n
      // instead of real newlines. PEM format requires actual newlines.
      const ca = rawCa?.includes('\\n') ? rawCa.replace(/\\n/g, '\n') : rawCa;

      return {
        index,
        pool: new Pool({
          connectionString: sanitizeDbUrl(url),
          // ★ rejectUnauthorized MUST be false when no CA cert is configured
          //   for this shard. Aiven's certs are signed by a private/project
          //   CA that is NOT in Node's default trust store — `true` here
          //   makes EVERY connection attempt to this shard fail the TLS
          //   handshake, deterministically, forever (not "sometimes"). Since
          //   fanOut() swallows per-shard errors and just returns [] for a
          //   failed shard, this doesn't surface as a visible crash — it
          //   silently makes every row that happens to live on this shard
          //   undiscoverable (failed logins, "game vanished", etc.).
          ssl: ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: false },
          // Vercel serverless: each function instance is short-lived and
          // isolated — a large pool wastes connections. Crucially, pools
          // do NOT share connections ACROSS instances: when traffic scales
          // horizontally, Vercel spins up multiple concurrent function
          // instances, each importing this module fresh and creating its
          // OWN pool. `max` only caps connections *within one instance* —
          // aggregate usage across N concurrently-running instances is
          // N × max × shards, which is how a `max` that looks conservative
          // here can still blow past Aiven's max_connections (typically 20
          // on hobby plans) under real concurrent traffic. Kept at 2 (down
          // from 3) as a tighter ceiling on that multiplier; the queries
          // that used to need 3 connections to one shard at once
          // (getGameBySlug's genres/downloads/bookmark-count) now run
          // sequentially over a single pinned connection instead (see
          // withRowTransaction usage in queries.ts), so 2 is enough
          // headroom for the remaining genuinely-concurrent fanOut call
          // sites (e.g. the homepage's two Promise.all'd queries) without
          // raising the per-instance ceiling further.
          max: 2,
          idleTimeoutMillis: 10_000,
          // Raised from 5s to 8s: with `max` lower, a request needing 2+
          // connections from the same shard's pool at once (still happens
          // in a few multi-query call sites) queues for a free connection
          // instead of opening a new one. 8s gives that queue more room to
          // clear under brief bursts before erroring out, at the cost of
          // slightly slower failure detection on a genuinely dead shard.
          connectionTimeoutMillis: 8_000,
        }),
      };
    });

    this.shards.forEach((s, i) => {
      const hasCa = Boolean(process.env[`PGCA_${i}`]);
      console.log(`[ShardedDb] shard ${i}: TLS verify-full=${hasCa ? 'ON (PGCA_' + i + ' set)' : 'OFF (no PGCA_' + i + ' — encrypted, unverified)'}`);
    });

    console.log(
      `[ShardedDb] Connected to ${this.shards.length} shard(s), ` +
      `max ${(this.maxShardBytes / 1024 / 1024).toFixed(0)} MB each.`
    );
  }

  private allPools(): Pool[] {
    this.init();
    return this.shards.map(s => s.pool);
  }

  /** Current size, in bytes, of a shard's database. */
  private async shardSize(pool: Pool): Promise<number> {
    const res = await pool.query<{ size: string }>('SELECT pg_database_size(current_database()) AS size');
    return Number(res.rows[0]?.size ?? 0);
  }

  /**
   * Pick the shard that new rows should be written to: the first one (in
   * SHARD_0, SHARD_1, … order) that's still under the size ceiling. Result
   * is cached briefly so normal write traffic doesn't pay a size-check
   * round trip every time.
   */
  private async pickWriteShardIndex(): Promise<number> {
    this.init();
    if (this.shards.length === 0) throw new Error('No shards available');

    const now = Date.now();
    if (this.cachedWriteIndex !== null && now < this.cachedWriteIndexExpiresAt) {
      return this.cachedWriteIndex;
    }

    // Cache is cold/stale. If a sweep is already running (kicked off by an
    // earlier concurrent call in this same container), piggyback on it
    // instead of starting a second, third, fourth... simultaneous sweep.
    if (this.pickWriteShardIndexInFlight) {
      return this.pickWriteShardIndexInFlight;
    }

    const sweep = this.sweepForWritableShard();
    this.pickWriteShardIndexInFlight = sweep;
    try {
      return await sweep;
    } finally {
      // Only clear if we're still the sweep that set it — a fresh sweep
      // started via pickWriteShardIndexFresh() while this one was pending
      // would otherwise get its in-flight marker wiped out from under it.
      if (this.pickWriteShardIndexInFlight === sweep) {
        this.pickWriteShardIndexInFlight = null;
      }
    }
  }

  /** The actual "walk the shards and find one with room" sweep, run at most once at a time per container. */
  private async sweepForWritableShard(): Promise<number> {
    for (const shard of this.shards) {
      try {
        const size = await this.shardSize(shard.pool);
        if (size < this.maxShardBytes) {
          this.cachedWriteIndex = shard.index;
          this.cachedWriteIndexExpiresAt =
            Date.now() + WRITE_SHARD_CACHE_MS + Math.floor(Math.random() * WRITE_SHARD_CACHE_JITTER_MS);
          return shard.index;
        }
      } catch (e) {
        // This shard is unreachable right now — skip it and try the next
        // one instead of aborting every write because ONE shard hiccuped.
        console.error(`[ShardedDb] size check failed for shard ${shard.index}, skipping:`, e);
      }
    }

    // Every shard is either past the ceiling or unreachable. Fail loudly
    // rather than silently overfilling/guessing — the caller should
    // surface a 500, and the admin needs to investigate or add a new
    // SHARD_N.
    throw new Error(
      `No writable shard available — all ${this.shards.length} are at/above the ` +
      `${this.maxShardBytes} byte ceiling or unreachable.`
    );
  }

  /**
   * Like pickWriteShardIndex, but forces a fresh check instead of trusting
   * the cache — used as a one-shot fallback when a write/connect using the
   * cached shard just failed (e.g. it went down after we cached it).
   */
  private async pickWriteShardIndexFresh(): Promise<number> {
    this.cachedWriteIndex = null;
    this.cachedWriteIndexExpiresAt = 0;
    this.pickWriteShardIndexInFlight = null;
    return this.pickWriteShardIndex();
  }

  /** Insert (or any single-statement write) a brand-new row — lands on the current fill-target shard. */
  async write<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<T[]> {
    const index = await this.pickWriteShardIndex();
    try {
      const res = await this.shards[index].pool.query(sql, values);
      return res.rows as T[];
    } catch (e) {
      // The cached pick can be up to 30s stale — if that specific shard
      // just went down, re-pick fresh (skipping it) and retry once before
      // giving up.
      console.error(`[ShardedDb.write] shard ${index} failed, waiting ${CONNECT_RETRY_DELAY_MS}ms before a fresh pick:`, e);
      await sleep(CONNECT_RETRY_DELAY_MS);
      const freshIndex = await this.pickWriteShardIndexFresh();
      const res = await this.shards[freshIndex].pool.query(sql, values);
      return res.rows as T[];
    }
  }

  /**
   * Run a statement against every shard in parallel and merge the rows.
   * Use for: reads spanning the whole logical table, unique-key lookups
   * (slug/email/username — we don't know which shard holds it), and
   * UPDATE/DELETE by id (only the shard holding that row is affected; the
   * rest are harmless no-ops).
   *
   * A shard that errors is logged and excluded rather than failing the
   * whole request — there's no replication, so one unreachable shard
   * should degrade gracefully, not take down every read.
   */
  async fanOut<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<T[]> {
    const pools = this.allPools();
    if (pools.length === 0) {
      throw new Error('[ShardedDb.fanOut] No shards configured — set SHARD_0 or DATABASE_URL.');
    }

    let allFailed = true;
    const results = await Promise.all(
      pools.map(pool =>
        pool.query(sql, values)
          .then(res => { allFailed = false; return res.rows as T[]; })
          .catch(e => {
            console.error('[ShardedDb.fanOut] shard query failed:', e);
            return [] as T[];
          })
      )
    );

    // Distinguish "every shard is genuinely empty for this query" (fine —
    // return []) from "every shard is unreachable" (NOT fine — a 500 is
    // far better than silently rendering as an empty catalog/dashboard).
    if (allFailed && pools.length > 0) {
      throw new Error('[ShardedDb.fanOut] All shards failed — database may be unreachable.');
    }

    return results.flat();
  }

  /**
   * fanOut + sum a numeric column across the merged rows. Each shard is
   * expected to return exactly one row (e.g. `SELECT COUNT(*) AS count …`
   * or `SELECT SUM(x) AS sum …`); the values for `key` are summed.
   */
  async aggregate(sql: string, values: unknown[] | undefined, key: string): Promise<number> {
    const rows = await this.fanOut<Record<string, unknown>>(sql, values);
    return rows.reduce((total, row) => {
      const n = Number(row[key]);
      return total + (isNaN(n) ? 0 : n);
    }, 0);
  }

  /**
   * Run a multi-statement transaction for a BRAND-NEW row and its children
   * (e.g. insert a game, then its genres/downloads) — everything is pinned
   * to the same fill-target shard so child rows always co-locate with
   * their new parent.
   */
  async withNewRowTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    let index = await this.pickWriteShardIndex();
    let client: PoolClient;
    try {
      client = await this.shards[index].pool.connect();
    } catch (e) {
      console.error(`[ShardedDb.withNewRowTransaction] connect failed on shard ${index}, waiting ${CONNECT_RETRY_DELAY_MS}ms before retrying with a fresh pick:`, e);
      await sleep(CONNECT_RETRY_DELAY_MS);
      index = await this.pickWriteShardIndexFresh();
      client = await this.shards[index].pool.connect();
    }
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Run a multi-statement transaction against an EXISTING row, pinned to
   * whichever shard actually holds it. Locates the shard with a cheap
   * existence probe, then runs `fn` with a client bound to that one shard.
   *
   * Throws RowNotFoundError if no shard has a matching row — callers
   * should catch this and return a 404.
   */
  async withRowTransaction<T>(
    table: string,
    idColumn: string,
    idValue: string,
    fn: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    this.init();
    if (this.shards.length === 0) {
      throw new Error('[ShardedDb.withRowTransaction] No shards configured — set SHARD_0 or DATABASE_URL.');
    }

    const allowedColumns = ShardedDb.ALLOWED_TABLES[table];
    if (!allowedColumns || !allowedColumns.includes(idColumn)) {
      throw new Error(`[ShardedDb.withRowTransaction] table "${table}" / column "${idColumn}" not in whitelist.`);
    }

    const probeSql = `SELECT 1 FROM ${table} WHERE ${idColumn}=$1 LIMIT 1`;

    const probes = await Promise.all(
      this.shards.map(async shard => {
        try {
          const res = await shard.pool.query(probeSql, [idValue]);
          return { index: shard.index, found: res.rows.length > 0, errored: false };
        } catch (e) {
          console.error(`[ShardedDb.withRowTransaction] probe failed on shard ${shard.index}:`, e);
          return { index: shard.index, found: false, errored: true };
        }
      })
    );

    const hit = probes.find(p => p.found);
    if (!hit) {
      // Every shard responded (none errored) and genuinely has no matching
      // row → real 404. If every shard ERRORED instead, we have no idea
      // whether the row exists — that's an outage, not a 404.
      const allErrored = probes.every(p => p.errored);
      if (allErrored) {
        throw new Error(
          `[ShardedDb.withRowTransaction] Could not reach any shard while looking up ${table}.${idColumn}=${idValue}.`
        );
      }
      throw new RowNotFoundError(table, idColumn, idValue);
    }

    let client: PoolClient;
    try {
      client = await this.shards[hit.index].pool.connect();
    } catch (e) {
      // The shard answered the probe a moment ago but the pool just failed
      // to hand out a connection (e.g. it dropped right after) — one retry
      // against the SAME shard (we already know the row lives there; there
      // is nowhere else to look) before giving up.
      console.error(`[ShardedDb.withRowTransaction] connect failed on shard ${hit.index}, waiting ${CONNECT_RETRY_DELAY_MS}ms before retrying once:`, e);
      await sleep(CONNECT_RETRY_DELAY_MS);
      try {
        client = await this.shards[hit.index].pool.connect();
      } catch (retryError) {
        console.error(`[ShardedDb.withRowTransaction] retry failed on shard ${hit.index}:`, retryError);
        throw new Error(`Shard ${hit.index} is overloaded or unreachable. Please try again shortly.`);
      }
    }

    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

export const db = new ShardedDb();

import { Redis } from '@upstash/redis';

// ─────────────────────────────────────────────────────────────────────────
// Upstash Redis, provisioned via the Vercel Marketplace integration (NOT a
// standalone Upstash account). That integration injects KV_URL,
// KV_REST_API_URL, KV_REST_API_TOKEN, REDIS_URL, and
// KV_REST_API_READ_ONLY_TOKEN — deliberately different names from
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN, which is what
// `Redis.fromEnv()` looks for. So the client is built explicitly from
// KV_REST_API_URL / KV_REST_API_TOKEN below instead of using fromEnv().
//
// Two consumers:
//  1. The write-shard pointer described in db/index.ts: an external
//     scheduler (cron-job.org — see README's Write-Shard Pointer section
//     for the exact job config) hits `/api/internal/shard-check` every 15
//     minutes; that route is the ONE place that still calls
//     pg_database_size() on each shard, and it writes the result here.
//     `pickWriteShardIndex()` then does a single cheap GET instead of
//     sweeping every shard's size on the request's critical path.
//  2. The `cached()` read-through helper below, backing short-TTL response
//     caching for the hottest read routes (currently /api/games and game
//     detail lookups) — these have no per-user data, so one Redis entry
//     serves every visitor hitting the same query/slug within the TTL.
// If Redis is unset, slow, or errors, every caller here falls back to
// doing the real work directly — this module never throws, it returns
// null (or, for `cached()`, just calls through) and lets the caller
// decide.
//
// Why an external scheduler instead of Vercel's own `crons` in
// vercel.json: this project runs on Vercel's Hobby plan, which hard-fails
// *deployment* for any cron expression firing more than once a day — a
// 5-minute native Vercel Cron is Pro-only. cron-job.org just calls the
// route as a normal authenticated HTTP request (same `Authorization:
// Bearer $CRON_SECRET` check either way), so it isn't subject to that
// limit and isn't tied to Vercel's own — in 2026 reportedly not perfectly
// punctual — cron scheduler either. If CRON_SECRET is compromised, the
// only thing it unlocks is triggering this one sweep-and-write-an-index
// route; no user data is reachable through it.
// ─────────────────────────────────────────────────────────────────────────

/** Key holding the index (as a string) of the shard new rows should land on. */
export const SHARD_WRITE_TARGET_KEY = 'shard:write-target';

// Must comfortably outlive the gap between two consecutive cron-job.org
// runs, or the key expires and requests fall back to the direct sweep
// until the next run — safe, just slower, and defeats the point of having
// Redis. At a 15-minute cadence, 45 minutes tolerates 2 consecutive missed
// runs (e.g. a transient cron-job.org or Vercel hiccup) before falling
// back, while still self-healing within 45 min if the scheduler stops
// firing entirely — expiry just means pickWriteShardIndex() falls back to
// the direct pg_database_size() sweep, not that writes break.
//
// ★ If you change the cron-job.org schedule to a different interval,
//   update this to match (roughly 2-3x the interval) — this constant and
//   the schedule configured in the cron-job.org dashboard are a pair that
//   have to be kept in sync manually; nothing enforces it in code.
//   ⚠ Changing this file alone does nothing — the cron-job.org dashboard
//   job still fires every 5 minutes until you edit its schedule there too.
export const SHARD_WRITE_TARGET_TTL_SECONDS = 45 * 60;

/** Shared short TTL for the `cached()` read-through helper below — long
 * enough to meaningfully cut repeated fan-out cost on hot routes, short
 * enough that an admin edit (new game, toggled announcement, etc.) shows
 * up for every visitor within a minute without needing manual invalidation. */
export const SHORT_CACHE_TTL_SECONDS = 60;

/**
 * Key holding the pre-computed homepage bundle (hot/featured/new games +
 * site stats) as one JSON blob — the app-level stand-in for a cross-shard
 * "materialized view". Postgres MATERIALIZED VIEW can't span the 3
 * independent Supabase projects this app shards across (no shared
 * connection, no postgres_fdw/dblink between separate hosts on the free
 * tier), so instead of a real DB-side MV, `/api/internal/reindex`
 * periodically does the fan-out + JOIN + sort ONCE and writes the finished
 * result here. `getHomepageIndex()` in queries.ts just GETs this key —
 * same "sweep once externally, read a pointer on the request path" shape
 * as SHARD_WRITE_TARGET_KEY above, applied to read traffic instead of the
 * write-shard decision.
 */
export const HOMEPAGE_INDEX_KEY = 'idx:homepage';

// ~4x the reindex cadence (see the cron-job.org schedule note in
// /api/internal/reindex) — tolerates a few missed runs before
// getHomepageIndex() falls back to a live (but now LIMIT-bounded, see
// getHotGames/getNewGames/getFeaturedGames) query. Keep in sync with
// whatever interval the cron-job.org job is actually set to, same caveat
// as SHARD_WRITE_TARGET_TTL_SECONDS above.
export const HOMEPAGE_INDEX_TTL_SECONDS = 20 * 60;

let client: Redis | null | undefined;

/**
 * Lazily builds a singleton Upstash Redis REST client. Returns null (not a
 * throw) when KV_REST_API_URL/KV_REST_API_TOKEN aren't set — e.g. local
 * dev without the integration attached — so every caller treats "no
 * Redis" as a normal, expected fallback path rather than an error.
 */
export function getRedis(): Redis | null {
  if (client !== undefined) return client;

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    console.warn('[redis] KV_REST_API_URL/KV_REST_API_TOKEN not set — Redis-backed features (shard pointer) disabled, falling back to direct checks.');
    client = null;
    return client;
  }

  client = new Redis({ url, token });
  return client;
}

/**
 * Read-through cache: return the cached value for `key` if present,
 * otherwise call `fn`, store its result for `ttlSeconds`, and return it.
 *
 * Only meant for responses with no per-user variance — every visitor
 * within the TTL window gets byte-for-byte the same thing back, so this
 * is safe for public listings/lookups (games list, game-by-slug) and NOT
 * safe for anything gated by session, role, or request-specific state.
 *
 * Fails soft like every other Redis path in this module: a down/missing
 * Redis, or any read/write error against it, falls through to calling
 * `fn` directly rather than throwing — a Redis outage degrades this back
 * to "slower, correct", never to a 500.
 */
export async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  if (!redis) return fn();

  try {
    const hit = await redis.get<T>(key);
    if (hit !== null && hit !== undefined) return hit;
  } catch (e) {
    console.error(`[redis] cache GET failed for "${key}", falling back to source:`, e);
  }

  const value = await fn();

  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch (e) {
    console.error(`[redis] cache SET failed for "${key}" (value computed fresh, just not cached):`, e);
  }

  return value;
}

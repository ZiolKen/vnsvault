#!/usr/bin/env node
/**
 * VNSVault — Fix Genre Shard IDs
 *
 * Root-cause fix for the bug surfaced by check-genre-shards.mjs (and visible
 * as duplicate tags in GameForm's genre picker on /admin/games/new):
 *
 *   SHARD_0's `genres` table was seeded BEFORE ids were pinned explicitly in
 *   schema.sql, so its SERIAL sequence assigned different ids to the same
 *   genres than SHARD_1/2/3 got (currently a flat +42 offset for every
 *   genre from "3D Game" onward — id=57 on SHARD_0 is id=15 everywhere
 *   else, id=134 is 92, etc).
 *
 *   The read-path dedupe-by-slug in /api/genres/route.ts only hides the
 *   *display* symptom (same tag shown twice). It does not — and cannot —
 *   fix the real danger: a game saved on SHARD_0 with genre_id=62 is
 *   tagged "Animated" there, but id=62 means "Religion" on every other
 *   shard. That's a silent data-integrity bug, not a UI bug, and has to be
 *   fixed by renumbering the actual rows.
 *
 * What this script does, per shard:
 *   1. Loads the canonical (id, name, slug) list straight out of
 *      schema.sql — never hand-duplicated here, since a second copy of
 *      this list drifting out of sync is exactly how the bug happened.
 *   2. For every genres row whose id doesn't match its slug's canonical
 *      id, renumbers it AND every game_genres row that referenced the old
 *      id, so no existing tag is silently lost or swapped to a different
 *      genre.
 *   3. Inserts any canonical genre that's missing entirely on this shard.
 *
 * ID changes go through a temporary quarantine range (+1,000,000) first,
 * so the migration is safe for ANY permutation of mismatched ids, not just
 * the current +42 offset — an id can never collide with a slot another row
 * is mid-move into. This is provably collision-free because genres.slug is
 * UNIQUE: at most one row per shard ever targets a given canonical id.
 *
 * The game_genres.genre_id foreign key isn't DEFERRABLE and there's no ON
 * UPDATE CASCADE, so it's dropped and re-added inside the same transaction
 * as the renumbering.
 *
 * Dry-run by default — prints every planned change without touching the
 * DB. Pass --apply to actually execute.
 *
 * Usage:
 *   SHARD_0="postgresql://..." [SHARD_1=...] node scripts/fix-genre-shard-ids.mjs            # dry run
 *   SHARD_0="postgresql://..." [SHARD_1=...] node scripts/fix-genre-shard-ids.mjs --apply     # apply
 *
 * Always run check-genre-shards.mjs again afterward to confirm every shard
 * agrees.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUARANTINE_OFFSET = 1_000_000;

/**
 * Parse the pinned (id, name, slug) triples straight out of the
 * `INSERT INTO genres (...) VALUES ... ON CONFLICT DO NOTHING;` block in
 * schema.sql. This is the single source of truth for "correct" — the fix
 * script must never carry its own hand-copied list of genres, since a
 * second copy drifting out of sync with schema.sql is exactly the failure
 * mode that caused this bug in the first place.
 */
function loadCanonicalGenres() {
  const schemaSql = readFileSync(join(__dirname, '../src/lib/db/schema.sql'), 'utf-8');
  const insertMatch = schemaSql.match(/INSERT INTO genres[\s\S]*?VALUES([\s\S]*?)ON CONFLICT DO NOTHING;/);
  if (!insertMatch) {
    throw new Error('Could not find the `INSERT INTO genres ... VALUES ...` block in schema.sql — did it move or get renamed?');
  }
  const rowRe = /\(\s*(\d+)\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*\)/g;
  const bySlug = new Map(); // slug -> { id, name }
  let m;
  while ((m = rowRe.exec(insertMatch[1]))) {
    const [, idStr, name, slug] = m;
    bySlug.set(slug, { id: Number(idStr), name: name.replace(/''/g, "'") });
  }
  if (bySlug.size === 0) {
    throw new Error('Parsed zero genre rows out of schema.sql — the INSERT format changed and the regex needs updating.');
  }
  return bySlug;
}

/**
 * Strip SSL-related search params from a Postgres connection URL.
 *
 * pg-connection-string ≥ 3.x treats `sslmode=require` / `prefer` / `verify-ca`
 * as aliases for `sslmode=verify-full`, which enables cert verification and
 * overrides the explicit `ssl: { rejectUnauthorized: false }` we pass to
 * Pool below. Removing these params lets our Pool-level `ssl` option be the
 * sole authority — no cert verification, accepting Aiven's managed cert.
 */
function sanitizeDbUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    u.searchParams.delete('sslmode');
    u.searchParams.delete('ssl');
    u.searchParams.delete('uselibpqcompat');
    return u.toString();
  } catch {
    return rawUrl; // not a standard URL — leave as-is
  }
}

function collectShardUrls() {
  const urls = [];
  for (let i = 0; i <= 9; i++) {
    const u = process.env[`SHARD_${i}`];
    if (u) urls.push({ index: i, url: u });
  }
  if (urls.length === 0 && process.env.DATABASE_URL) {
    urls.push({ index: 0, url: process.env.DATABASE_URL });
  }
  return urls;
}

async function fixShard(pool, index, canonical, apply) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT id, name, slug FROM genres ORDER BY id ASC');

    // Plan every id change up front (id => target canonical id), keyed by
    // slug since that's the one thing guaranteed to identify "the same
    // genre" across shards.
    const changes = []; // { slug, name, fromId, toId }
    for (const r of rows) {
      const target = canonical.get(r.slug);
      if (!target) {
        console.log(`    ⚠️  slug="${r.slug}" (id=${r.id}) has no match in schema.sql — leaving untouched (stale/manual row?).`);
        continue;
      }
      if (target.id !== r.id) {
        changes.push({ slug: r.slug, name: r.name, fromId: r.id, toId: target.id });
      }
    }

    const haveSlugs = new Set(rows.map(r => r.slug));
    const missingSlugs = [...canonical.keys()].filter(s => !haveSlugs.has(s));

    if (changes.length === 0 && missingSlugs.length === 0) {
      console.log(`  ✅  SHARD_${index}: already matches schema.sql. Nothing to do.`);
      return { changed: 0, inserted: 0 };
    }

    console.log(`  🔧  SHARD_${index}: ${changes.length} id(s) to renumber, ${missingSlugs.length} missing genre(s).`);
    for (const c of changes) {
      console.log(`      id ${c.fromId} → ${c.toId}   ("${c.name}", slug="${c.slug}")`);
    }
    if (missingSlugs.length > 0) {
      console.log(`      will insert: ${missingSlugs.join(', ')}`);
    }

    if (!apply) return { changed: changes.length, inserted: missingSlugs.length };

    await client.query('BEGIN');
    try {
      // The FK isn't DEFERRABLE and there's no ON UPDATE CASCADE, so it
      // has to come off before we shuffle parent ids around.
      const { rows: fkRows } = await client.query(`
        SELECT tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.table_name = 'game_genres'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'genre_id'
      `);
      for (const { constraint_name } of fkRows) {
        await client.query(`ALTER TABLE game_genres DROP CONSTRAINT "${constraint_name}"`);
      }

      // Phase 1: move every changing id into a quarantine range. Provably
      // collision-free (see file header) — no two rows ever share a
      // fromId or a toId, and quarantine ids are all >= 1,000,000 above
      // any real id.
      for (const c of changes) {
        const q = c.fromId + QUARANTINE_OFFSET;
        await client.query('UPDATE genres SET id = $1 WHERE id = $2', [q, c.fromId]);
        await client.query('UPDATE game_genres SET genre_id = $1 WHERE genre_id = $2', [q, c.fromId]);
      }
      // Phase 2: quarantine -> real canonical id. Every target slot is
      // guaranteed free by now (see file header).
      for (const c of changes) {
        const q = c.fromId + QUARANTINE_OFFSET;
        await client.query('UPDATE genres SET id = $1 WHERE id = $2', [c.toId, q]);
        await client.query('UPDATE game_genres SET genre_id = $1 WHERE genre_id = $2', [c.toId, q]);
      }

      // Insert any canonical genre that's missing entirely on this shard.
      for (const slug of missingSlugs) {
        const target = canonical.get(slug);
        await client.query(
          'INSERT INTO genres (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [target.id, target.name, slug]
        );
      }

      await client.query(`
        ALTER TABLE game_genres
        ADD CONSTRAINT game_genres_genre_id_fkey
        FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
      `);

      // Keep the SERIAL sequence ahead of the highest pinned id, same as
      // schema.sql's own setval() call.
      await client.query(`SELECT setval('genres_id_seq', (SELECT MAX(id) FROM genres))`);

      await client.query('COMMIT');
      console.log(`  ✅  SHARD_${index}: fixed.`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }

    return { changed: changes.length, inserted: missingSlugs.length };
  } finally {
    client.release();
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const shards = collectShardUrls();
  if (shards.length === 0) {
    console.error('❌  Set SHARD_0 (or DATABASE_URL) before running this script.');
    process.exit(1);
  }

  const canonical = loadCanonicalGenres();
  const { default: pg } = await import('pg');

  console.log(`\n🔧  ${apply ? 'Applying' : 'Planning (dry run — pass --apply to execute)'} genre id fix across ${shards.length} shard(s)...`);
  console.log(`    Canonical source: schema.sql (${canonical.size} genres pinned)\n`);

  let failed = false;
  let totalChanged = 0;
  for (const { index, url } of shards) {
    const pool = new pg.Pool({ connectionString: sanitizeDbUrl(url), ssl: { rejectUnauthorized: false } });
    try {
      const result = await fixShard(pool, index, canonical, apply);
      totalChanged += result.changed + result.inserted;
    } catch (e) {
      failed = true;
      console.error(`  ❌  SHARD_${index}: ${e.message}`);
    } finally {
      await pool.end();
    }
  }

  if (failed) {
    console.error('\n❌  Fix failed on one or more shards — see errors above.');
    console.error('    Each shard runs its own BEGIN/COMMIT, so a failure on one shard does not leave that shard half-migrated — it rolls back clean. Other shards already committed are unaffected.\n');
    process.exit(1);
  }

  if (!apply) {
    console.log(`\n👉  Dry run only — ${totalChanged} total change(s) planned across all shards. Re-run with --apply to execute.\n`);
  } else {
    console.log(`\n✅  Done — ${totalChanged} total change(s) applied.`);
    console.log('👉  Next step: run "npm run db:check-genres" again to confirm every shard now agrees.\n');
  }
}

main().catch(e => { console.error(e); process.exit(1); });

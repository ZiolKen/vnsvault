#!/usr/bin/env node
/**
 * VNSVault — Check Genre Shard Consistency
 *
 * Every shard is supposed to hold an identical copy of the `genres`
 * reference table, seeded with the explicit (id, name, slug) triples in
 * schema.sql. If a shard was provisioned/seeded *before* those ids were
 * pinned (or a manual INSERT ever slipped past ON CONFLICT DO NOTHING with
 * a different id for the same name/slug), that shard ends up with the same
 * genre under a different id than the others.
 *
 * That's exactly the bug behind the duplicate-tag issue fixed in
 * /api/genres/route.ts (GameForm's tag list is a fanOut across all shards,
 * deduplicated by slug) — but a slug-level dedupe on the *read* path can't
 * fix rows that were actually saved with a mismatched id on a specific
 * shard: a game landing on that shard would silently drop or mis-tag a
 * genre on write (see the "residual risk" note this script exists for).
 *
 * This script surfaces the underlying data problem directly so it can be
 * fixed at the source (a corrective UPDATE/migration on the offending
 * shard) rather than papered over on every read.
 *
 * Checks performed, per shard and across all shards:
 *   1. Row count per shard (a shard missing rows entirely is the most
 *      common case — e.g. schema.sql was updated with new genres after
 *      that shard was already provisioned).
 *   2. Slug → id mismatches: the same slug resolving to different ids on
 *      different shards (THE bug this script is really looking for).
 *   3. Id → slug collisions: the same id meaning a different genre on
 *      different shards (rarer, but worse — a saved game_genres row would
 *      silently point at the wrong tag on shards other than the one it
 *      was written on).
 *   4. Missing slugs: a genre present on some shard(s) but absent on
 *      others — flags incomplete seeding even where no id conflict exists
 *      yet (it will as soon as that shard's SERIAL sequence assigns that
 *      slug a different id later).
 *
 * Read-only — never writes anything. Exits non-zero if any inconsistency
 * is found, so it can gate a deploy/CI step if desired.
 *
 * Usage: SHARD_0="postgresql://..." [SHARD_1="postgresql://..." ...] node scripts/check-genre-shards.mjs
 *        (or DATABASE_URL="postgresql://..." for a single-shard setup)
 */

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

async function main() {
  const shards = collectShardUrls();
  if (shards.length === 0) {
    console.error('❌  Set SHARD_0 (or DATABASE_URL) before running this script.');
    process.exit(1);
  }

  const { default: pg } = await import('pg');
  console.log(`\n🔍  Checking genres consistency across ${shards.length} shard(s)...\n`);

  // shardIndex -> rows[] | null (null = shard unreachable)
  const perShardRows = new Map();

  for (const { index, url } of shards) {
    const pool = new pg.Pool({ connectionString: sanitizeDbUrl(url), ssl: { rejectUnauthorized: false } });
    try {
      const { rows } = await pool.query('SELECT id, name, slug FROM genres ORDER BY id ASC');
      perShardRows.set(index, rows);
      console.log(`✅  SHARD_${index}: ${rows.length} genre row(s).`);
    } catch (e) {
      perShardRows.set(index, null);
      console.error(`❌  SHARD_${index}: unreachable — ${e.message}`);
    } finally {
      await pool.end();
    }
  }

  const reachableShards = [...perShardRows.entries()].filter(([, rows]) => rows !== null);
  if (reachableShards.length === 0) {
    console.error('\n❌  No shard was reachable — cannot compare anything.\n');
    process.exit(1);
  }

  // slug -> shardIndex -> { id, name }
  const bySlug = new Map();
  // id -> shardIndex -> { name, slug }
  const byId = new Map();
  // shardIndex -> Set(slug), for the "missing on this shard" check
  const slugsPerShard = new Map();

  for (const [index, rows] of reachableShards) {
    const slugSet = new Set();
    slugsPerShard.set(index, slugSet);
    for (const r of rows) {
      slugSet.add(r.slug);

      if (!bySlug.has(r.slug)) bySlug.set(r.slug, new Map());
      bySlug.get(r.slug).set(index, { id: r.id, name: r.name });

      if (!byId.has(r.id)) byId.set(r.id, new Map());
      byId.get(r.id).set(index, { name: r.name, slug: r.slug });
    }
  }

  let problems = 0;

  // 1. Row count mismatch across reachable shards
  const counts = reachableShards.map(([index, rows]) => [index, rows.length]);
  const distinctCounts = new Set(counts.map(([, c]) => c));
  if (distinctCounts.size > 1) {
    problems++;
    console.log('\n⚠️   Row count differs across shards:');
    for (const [index, c] of counts) console.log(`     SHARD_${index}: ${c} row(s)`);
  }

  // 2. Slug → id mismatches (THE bug: same genre, different id per shard)
  const slugMismatches = [...bySlug.entries()].filter(([, byShard]) => {
    const ids = new Set([...byShard.values()].map(v => v.id));
    return ids.size > 1;
  });
  if (slugMismatches.length > 0) {
    problems += slugMismatches.length;
    console.log(`\n🚨  ${slugMismatches.length} genre(s) have a MISMATCHED id across shards`);
    console.log('    (this is the duplicate-tag bug — GameForm will show the same tag');
    console.log('     name twice, and a game saved on the "wrong" shard for one of these');
    console.log('     ids will silently lose that tag):\n');
    for (const [slug, byShard] of slugMismatches) {
      console.log(`    slug="${slug}"`);
      for (const [index, { id, name }] of byShard) {
        console.log(`      SHARD_${index}: id=${id} name="${name}"`);
      }
    }
  }

  // 3. Id → slug collisions (same id, different genre meaning per shard)
  const idCollisions = [...byId.entries()].filter(([, byShard]) => {
    const slugs = new Set([...byShard.values()].map(v => v.slug));
    return slugs.size > 1;
  });
  if (idCollisions.length > 0) {
    problems += idCollisions.length;
    console.log(`\n🚨  ${idCollisions.length} id(s) refer to a DIFFERENT genre depending on the shard`);
    console.log('    (worse than a mismatch: a saved game_genres row is ambiguous —');
    console.log('     it means one tag on the shard it lives on and another tag if you');
    console.log('     ever compare against a different shard\'s genres table):\n');
    for (const [id, byShard] of idCollisions) {
      console.log(`    id=${id}`);
      for (const [index, { name, slug }] of byShard) {
        console.log(`      SHARD_${index}: name="${name}" slug="${slug}"`);
      }
    }
  }

  // 4. Missing slugs — present on some shard(s), absent on others
  const allSlugs = new Set(bySlug.keys());
  const missingReport = [];
  for (const [index] of reachableShards) {
    const have = slugsPerShard.get(index);
    const missing = [...allSlugs].filter(s => !have.has(s));
    if (missing.length > 0) missingReport.push([index, missing]);
  }
  if (missingReport.length > 0) {
    problems += missingReport.length;
    console.log('\n⚠️   Some shards are missing genres that exist on others:');
    for (const [index, missing] of missingReport) {
      console.log(`    SHARD_${index} is missing ${missing.length}: ${missing.join(', ')}`);
    }
  }

  const unreachable = [...perShardRows.entries()].filter(([, rows]) => rows === null);
  if (unreachable.length > 0) {
    console.log(`\n⚠️   ${unreachable.length} shard(s) were unreachable and could not be checked: ` +
      unreachable.map(([i]) => `SHARD_${i}`).join(', '));
  }

  if (problems === 0 && unreachable.length === 0) {
    console.log('\n✅  All reachable shards agree on every genre id/name/slug. Nothing to fix.\n');
  } else if (problems === 0) {
    console.log('\n✅  No inconsistency found on the shards that responded (some were unreachable — see above).\n');
  } else {
    console.log(`\n❌  ${problems} inconsistenc${problems === 1 ? 'y' : 'ies'} found — fix these on the affected`);
    console.log('    shard(s) before relying on genre ids being interchangeable across shards.\n');
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });

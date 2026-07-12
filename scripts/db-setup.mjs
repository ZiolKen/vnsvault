#!/usr/bin/env node
/**
 * VNSVault — DB Setup
 *
 * Applies schema.sql to EVERY configured shard (SHARD_0..SHARD_9, falling
 * back to DATABASE_URL). This is no longer a single-primary setup — each
 * shard is an independent peer database and needs its own copy of every
 * table (including the seeded `genres` reference rows) before the app can
 * write to it.
 *
 * Usage: SHARD_0="postgresql://..." [SHARD_1="postgresql://..." ...] node scripts/db-setup.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaSql = readFileSync(join(__dirname, '../src/lib/db/schema.sql'), 'utf-8');

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
  console.log(`\n🛠   Applying schema to ${shards.length} shard(s)...\n`);

  let failed = false;
  for (const { index, url } of shards) {
    const pool = new pg.Pool({ connectionString: sanitizeDbUrl(url), ssl: { rejectUnauthorized: false } });
    try {
      await pool.query(schemaSql);
      console.log(`✅  SHARD_${index}: schema applied.`);
    } catch (e) {
      failed = true;
      console.error(`❌  SHARD_${index}: ${e.message}`);
    } finally {
      await pool.end();
    }
  }

  if (failed) process.exit(1);
  console.log('\nDone.\n');
}

main().catch(e => { console.error(e); process.exit(1); });

#!/usr/bin/env node
/**
 * VNSVault — Create First Admin User
 *
 * Reads every configured SHARD_0..SHARD_9 (falls back to DATABASE_URL),
 * mirroring the app's no-primary, capacity-based sharding:
 *   - Checks ALL shards first — if the email already exists on ANY shard,
 *     that row is promoted to admin in place (never creates a duplicate
 *     on a different shard).
 *   - Otherwise picks the first shard still under MAX_SHARD_BYTES and
 *     inserts the new admin there.
 *
 * Usage: SHARD_0="postgresql://..." [SHARD_1="postgresql://..." ...] node scripts/create-admin.mjs
 */

import { createInterface } from 'readline';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

const MAX_SHARD_BYTES = process.env.MAX_SHARD_BYTES
  ? parseInt(process.env.MAX_SHARD_BYTES, 10)
  : 450 * 1024 * 1024;

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
    return rawUrl;
  }
}

function collectShardUrls() {
  const urls = [];
  for (let i = 0; i <= 9; i++) {
    const u = process.env[`SHARD_${i}`];
    if (u) urls.push(u);
  }
  if (urls.length === 0 && process.env.DATABASE_URL) urls.push(process.env.DATABASE_URL);
  return urls;
}

async function main() {
  const urls = collectShardUrls();
  if (urls.length === 0) {
    console.error('❌  Set SHARD_0 (or DATABASE_URL) before running this script.');
    process.exit(1);
  }

  const { default: pg } = await import('pg');
  const pools = urls.map(u => new pg.Pool({ connectionString: sanitizeDbUrl(u), ssl: { rejectUnauthorized: false } }));

  console.log(`\n🔑  VNSVault — Create Admin  (${pools.length} shard${pools.length > 1 ? 's' : ''} configured)\n`);
  const username = await ask('Username: ');
  const email    = await ask('Email: ');
  const password = await ask('Password (min 6 chars): ');
  rl.close();

  if (!username || !email || password.length < 6) {
    console.error('❌  Invalid input.');
    for (const p of pools) await p.end();
    process.exit(1);
  }

  const { default: bcrypt } = await import('bcryptjs');
  const hash = await bcrypt.hash(password, 12);

  try {
    // Check every shard first — promote an existing account in place rather
    // than risking a duplicate row on a different shard.
    for (const pool of pools) {
      const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
      if (existing.rows[0]) {
        await pool.query(
          `UPDATE users SET role='admin', password_hash=$2 WHERE email=$1`,
          [email, hash]
        );
        console.log(`\n✅  Existing account promoted to admin: ${username} <${email}>`);
        console.log('   You can now log in at /login\n');
        return;
      }
    }

    // No existing account — insert on the first shard still under capacity.
    for (const pool of pools) {
      const sizeRes = await pool.query('SELECT pg_database_size(current_database()) AS size');
      if (Number(sizeRes.rows[0].size) < MAX_SHARD_BYTES) {
        await pool.query(
          `INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, 'admin')`,
          [username, email, hash]
        );
        console.log(`\n✅  Admin created: ${username} <${email}>`);
        console.log('   You can now log in at /login\n');
        return;
      }
    }

    console.error(`❌  All ${pools.length} shard(s) are at capacity. Add a new SHARD_${pools.length} and retry.`);
    process.exit(1);
  } finally {
    for (const p of pools) await p.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });

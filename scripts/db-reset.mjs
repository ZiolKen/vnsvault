#!/usr/bin/env node
/**
 * VNSVault — DB Reset (DANGER)
 *
 * Wipes EVERYTHING in the database (Tables, Views, Types, Sequences, Data)
 * by dropping and recreating the public schema for EVERY configured shard.
 *
 * Usage: SHARD_0="postgresql://..." node scripts/db-reset.mjs
 */

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
  console.log(`\n⚠️   WARNING: WIPING ALL DATA AND TABLES ON ${shards.length} SHARD(S)...\n`);

  // Lệnh SQL để xóa trắng DB: Xóa schema public và tạo lại như mới
  const wipeSql = `
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO public;
  `;

  let failed = false;
  for (const { index, url } of shards) {
    const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
    try {
      await pool.query(wipeSql);
      console.log(`✅  SHARD_${index}: Wiped clean (like new).`);
    } catch (e) {
      failed = true;
      console.error(`❌  SHARD_${index} failed to wipe: ${e.message}`);
    } finally {
      await pool.end();
    }
  }

  if (failed) {
    console.log('\n❌ Reset failed on some shards.\n');
    process.exit(1);
  }
  
  console.log('\n🗑️  Database reset complete. It is now completely empty.\n');
  console.log('👉 Next step: Run "npm run db:setup" to re-apply the schema.\n');
}

main().catch(e => { console.error(e); process.exit(1); });

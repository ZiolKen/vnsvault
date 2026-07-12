#!/usr/bin/env node
/**
 * VNSVault — Remove Admin Role
 *
 * Demotes one or more admin accounts to regular 'user' role.
 * Supports bulk operation via comma-separated values.
 *
 * The UPDATE is fanned out across ALL shards: each user row lives on
 * exactly one shard, so all other shards return rowCount = 0 (safe no-op).
 *
 * Usage:
 *   node scripts/remove-admin.mjs --username=<name>[,<name>...]
 *   node scripts/remove-admin.mjs --email=<email>[,<email>...]
 *   node scripts/remove-admin.mjs --id=<uuid>[,<uuid>...]
 *
 * Options:
 *   --username=a,b,c   Target by username (comma-separated)
 *   --email=a,b,c      Target by email (comma-separated)
 *   --id=a,b,c         Target by UUID (comma-separated)
 *   --dry-run          Show who would be demoted without making changes
 *   --yes              Skip confirmation prompt
 *
 * Examples:
 *   node scripts/remove-admin.mjs --username=oldadmin
 *   node scripts/remove-admin.mjs --email=a@x.com,b@x.com --yes
 *   node scripts/remove-admin.mjs --id=uuid1,uuid2 --dry-run
 */

import { createInterface } from 'readline';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(res => rl.question(q, res));

// ─── DB helpers ──────────────────────────────────────────────────────────────

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

function collectShards() {
  const shards = [];
  for (let i = 0; i <= 9; i++) {
    const u = process.env[`SHARD_${i}`];
    if (u) shards.push({ index: i, url: u });
  }
  if (shards.length === 0 && process.env.DATABASE_URL) {
    shards.push({ index: 0, url: process.env.DATABASE_URL });
  }
  return shards;
}

/**
 * Run a query on every shard in parallel, merge rows + sum rowCounts.
 * Per-shard errors are logged but don't abort.
 */
async function fanOut(pools, shards, sql, params = []) {
  const results = await Promise.allSettled(pools.map(p => p.query(sql, params)));
  const rows = [];
  let affected = 0;
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'fulfilled') {
      rows.push(...(results[i].value.rows ?? []));
      affected += results[i].value.rowCount ?? 0;
    } else {
      console.error(`  ⚠️  SHARD_${shards[i].index}: ${results[i].reason?.message}`);
    }
  }
  return { rows, affected };
}

// ─── CLI arg parsing ─────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    usernames: [],
    emails:    [],
    ids:       [],
    dryRun:    false,
    yes:       false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') { opts.dryRun = true; continue; }
    if (arg === '--yes')     { opts.yes    = true; continue; }
    const m = arg.match(/^--(\w[\w-]*)(?:=(.+))?$/);
    if (!m) { console.error(`Unknown argument: ${arg}`); process.exit(1); }
    const [, key, val] = m;
    const list = val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (key === 'username') opts.usernames.push(...list);
    else if (key === 'email') opts.emails.push(...list);
    else if (key === 'id')    opts.ids.push(...list);
    else { console.error(`Unknown flag: --${key}`); process.exit(1); }
  }

  return opts;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  if (!opts.usernames.length && !opts.emails.length && !opts.ids.length) {
    console.error('❌  Provide at least one of: --username, --email, --id');
    console.error('   Example: node scripts/remove-admin.mjs --username=oldadmin');
    process.exit(1);
  }

  const shards = collectShards();
  if (shards.length === 0) {
    console.error('❌  Set SHARD_0 (or DATABASE_URL) before running this script.');
    process.exit(1);
  }

  const { default: pg } = await import('pg');
  const pools = shards.map(s => new pg.Pool({
    connectionString: sanitizeDbUrl(s.url),
    ssl: { rejectUnauthorized: false },
    max: 2,
  }));

  try {
    const tag = opts.dryRun ? '🔍 [DRY RUN]' : '🔑';
    console.log(`\n${tag}  VNSVault — Remove Admin Role  (${shards.length} shard(s))\n`);

    // ── 1. Resolve target users ──────────────────────────────────────────────
    const conditions = [];
    const params = [];

    if (opts.usernames.length) {
      params.push(opts.usernames);
      conditions.push(`username = ANY($${params.length})`);
    }
    if (opts.emails.length) {
      params.push(opts.emails);
      conditions.push(`email = ANY($${params.length})`);
    }
    if (opts.ids.length) {
      params.push(opts.ids);
      conditions.push(`id = ANY($${params.length})`);
    }

    const { rows: found } = await fanOut(pools, shards,
      `SELECT id, username, email, role, created_at
       FROM users
       WHERE ${conditions.join(' OR ')}`,
      params
    );

    // De-duplicate (same user could theoretically appear from multiple shards
    // if something went wrong; guard against it)
    const seen = new Set();
    const targets = found.filter(u => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });

    if (targets.length === 0) {
      console.log('  No matching users found.\n');
      return;
    }

    // ── 2. Categorise: already-users are skipped, admins will be demoted ─────
    const toSkip  = targets.filter(u => u.role !== 'admin');
    const toDemote = targets.filter(u => u.role === 'admin');

    if (toSkip.length > 0) {
      console.log('  The following users already have role "user" and will be skipped:\n');
      for (const u of toSkip) {
        console.log(`  · ${u.username} <${u.email}>  (id: ${u.id})`);
      }
      console.log();
    }

    if (toDemote.length === 0) {
      console.log('  Nothing to do — no admins found among the targets.\n');
      return;
    }

    // ── 3. Print plan ────────────────────────────────────────────────────────
    console.log('  The following admin(s) will be demoted to "user":\n');
    for (const u of toDemote) {
      console.log(`  · ★ ${u.username} <${u.email}>`);
      console.log(`    id: ${u.id}  |  joined: ${new Date(u.created_at).toISOString().slice(0, 10)}`);
    }
    console.log();

    if (opts.dryRun) {
      console.log('  ℹ️  Dry run — no changes made.\n');
      return;
    }

    // ── 4. Confirm ───────────────────────────────────────────────────────────
    if (!opts.yes) {
      const answer = await ask(
        `  Type "yes" to demote ${toDemote.length} admin(s) to regular user: `
      );
      rl.close();
      if (answer.trim().toLowerCase() !== 'yes') {
        console.log('\n  Aborted.\n');
        return;
      }
    } else {
      rl.close();
    }

    // ── 5. Update role across all shards ─────────────────────────────────────
    // Each user lives on exactly ONE shard; the UPDATE is a no-op on the
    // others. Safe to fanOut — no duplication risk.
    const ids = toDemote.map(u => u.id);

    console.log('\n  Updating...');

    const { affected } = await fanOut(pools, shards,
      `UPDATE users SET role = 'user', updated_at = NOW() WHERE id = ANY($1) AND role = 'admin'`,
      [ids]
    );

    if (affected !== toDemote.length) {
      console.warn(
        `\n  ⚠️  Expected to update ${toDemote.length} row(s) but got ${affected}.` +
        `\n     Some accounts may have already been demoted or migrated between shards.`
      );
    } else {
      console.log(`  ✓  ${affected} admin(s) demoted to "user".`);
    }

    // ── 6. Summary ───────────────────────────────────────────────────────────
    console.log('\n  Result:\n');
    for (const u of toDemote) {
      console.log(`  · ${u.username} <${u.email}>  ★ admin  →  user`);
    }
    if (toSkip.length > 0) {
      console.log(`\n  (${toSkip.length} already-user account(s) skipped)`);
    }

    console.log('\n  ✅  Done.\n');
  } finally {
    try { rl.close(); } catch { /* already closed */ }
    for (const p of pools) await p.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });

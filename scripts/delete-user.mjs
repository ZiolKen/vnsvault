#!/usr/bin/env node
/**
 * VNSVault — Delete User(s)
 *
 * Finds and permanently deletes one or more users across all shards,
 * including their cross-shard associated data:
 *
 *   · users           — the user row (on whichever shard holds it)
 *   · bookmarks       — may live on ANY shard (co-located with game, not user)
 *   · request_votes   — may live on ANY shard (co-located with request, not user)
 *
 * Supports bulk deletion via comma-separated values or repeated flags.
 *
 * Usage:
 *   node scripts/delete-user.mjs --username=<name>[,<name>...]
 *   node scripts/delete-user.mjs --email=<email>[,<email>...]
 *   node scripts/delete-user.mjs --id=<uuid>[,<uuid>...]
 *
 * Options:
 *   --username=a,b,c   Target by username (comma-separated)
 *   --email=a,b,c      Target by email (comma-separated)
 *   --id=a,b,c         Target by UUID (comma-separated)
 *   --dry-run          Show what would be deleted without making changes
 *   --yes              Skip confirmation prompt
 *
 * Examples:
 *   node scripts/delete-user.mjs --username=spammer
 *   node scripts/delete-user.mjs --email=a@x.com,b@x.com --yes
 *   node scripts/delete-user.mjs --id=uuid1,uuid2 --dry-run
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
 * Run a query on every pool in parallel, merge rows.
 * Per-shard errors are logged but don't abort.
 * @returns {{ rows: any[], affected: number }}
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
    console.error('   Example: node scripts/delete-user.mjs --username=john,jane');
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
    const tag = opts.dryRun ? '🔍 [DRY RUN]' : '🗑️ ';
    console.log(`\n${tag}  VNSVault — Delete User(s)  (${shards.length} shard(s))\n`);

    // ── 1. Resolve all target users across shards ────────────────────────────
    // Build a WHERE clause that matches any of the given identifiers.
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

    const findSql = `
      SELECT id, username, email, role, created_at
      FROM users
      WHERE ${conditions.join(' OR ')}
    `;

    const found = [];
    for (let i = 0; i < pools.length; i++) {
      try {
        const res = await pools[i].query(findSql, params);
        for (const row of res.rows) found.push({ ...row, _shard: shards[i].index });
      } catch (e) {
        console.error(`  ⚠️  SHARD_${shards[i].index} lookup failed: ${e.message}`);
      }
    }

    // De-duplicate
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

    // ── 2. Count related data (for the summary) ──────────────────────────────
    const ids = targets.map(u => u.id);

    const { rows: bkRows } = await fanOut(pools, shards,
      `SELECT user_id, COUNT(*) AS cnt FROM bookmarks WHERE user_id = ANY($1) GROUP BY user_id`,
      [ids]
    );
    const { rows: voteRows } = await fanOut(pools, shards,
      `SELECT user_id, COUNT(*) AS cnt FROM request_votes WHERE user_id = ANY($1) GROUP BY user_id`,
      [ids]
    );

    const bkMap   = new Map(bkRows.map(r => [r.user_id, Number(r.cnt)]));
    const voteMap = new Map(voteRows.map(r => [r.user_id, Number(r.cnt)]));
    // Accumulate across shards (multiple rows per user_id possible)
    for (const r of bkRows)   bkMap.set(r.user_id,   (bkMap.get(r.user_id)   ?? 0) + Number(r.cnt));
    for (const r of voteRows) voteMap.set(r.user_id, (voteMap.get(r.user_id) ?? 0) + Number(r.cnt));

    // ── 3. Print what will be deleted ────────────────────────────────────────
    console.log('  The following user(s) will be permanently deleted:\n');
    for (const u of targets) {
      const bk   = bkMap.get(u.id)   ?? 0;
      const vote = voteMap.get(u.id) ?? 0;
      const roleTag = u.role === 'admin' ? ' ★ ADMIN' : '';
      console.log(`  · ${u.username} <${u.email}>${roleTag}`);
      console.log(`    id: ${u.id}  |  shard: SHARD_${u._shard}  |  bookmarks: ${bk}  |  votes: ${vote}`);
    }
    console.log();

    if (opts.dryRun) {
      console.log('  ℹ️  Dry run — no changes made.\n');
      return;
    }

    // ── 4. Confirm ───────────────────────────────────────────────────────────
    if (!opts.yes) {
      const answer = await ask(
        `  ⚠️  This will permanently delete ${targets.length} user(s) and all their data.\n` +
        `  Type "yes" to confirm: `
      );
      rl.close();
      if (answer.trim().toLowerCase() !== 'yes') {
        console.log('\n  Aborted.\n');
        return;
      }
    } else {
      rl.close();
    }

    // ── 5. Delete across all shards ──────────────────────────────────────────
    // Order matters: delete dependent data first, then the user row.
    // All three tables are fanned out because rows may live on any shard.

    console.log('\n  Deleting...');

    const { affected: bkDel } = await fanOut(pools, shards,
      `DELETE FROM bookmarks WHERE user_id = ANY($1)`, [ids]
    );
    console.log(`  ✓  bookmarks deleted     : ${bkDel}`);

    const { affected: voteDel } = await fanOut(pools, shards,
      `DELETE FROM request_votes WHERE user_id = ANY($1)`, [ids]
    );
    console.log(`  ✓  request_votes deleted : ${voteDel}`);

    // User rows — only ONE shard holds each user, but fanOut is safe
    // (the other shards return rowCount = 0 for missing ids).
    const { affected: userDel } = await fanOut(pools, shards,
      `DELETE FROM users WHERE id = ANY($1)`, [ids]
    );
    console.log(`  ✓  users deleted         : ${userDel}`);

    if (userDel !== targets.length) {
      console.warn(
        `\n  ⚠️  Expected to delete ${targets.length} user row(s) but got ${userDel}.` +
        `\n     Some rows may have already been deleted or moved between shards.`
      );
    }

    console.log(`\n  ✅  Done — ${targets.length} user(s) removed.\n`);
  } finally {
    // Ensure pools are closed even if rl.close() was called early
    try { rl.close(); } catch { /* already closed */ }
    for (const p of pools) await p.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });

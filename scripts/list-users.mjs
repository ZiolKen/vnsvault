#!/usr/bin/env node
/**
 * VNSVault — List Users
 *
 * Queries ALL shards and displays user accounts, including live VIP status
 * (vip_permanent / vip_expires_at — mirrors the logic in src/lib/vip.ts).
 * With --full: also fetches bookmark count, vote count, and bookmarked
 * game titles from every shard (those rows may live on any shard
 * independently of the user row itself).
 *
 * Usage:
 *   node scripts/list-users.mjs [options]
 *
 * Options:
 *   --role=admin|user        Filter by role
 *   --vip=yes|no             Filter by current VIP status (permanent or unexpired)
 *   --search=<term>          Partial match on username OR email (case-insensitive)
 *   --full                   Show bookmark count, vote count, bookmarked game list
 *   --limit=<n>              Max rows shown (default: 50 / 0 = unlimited)
 *   --sort=<field>           username | email | role | created_at (default: created_at)
 *   --asc                    Sort ascending (default: descending)
 *
 * Examples:
 *   node scripts/list-users.mjs
 *   node scripts/list-users.mjs --role=admin --full
 *   node scripts/list-users.mjs --vip=yes
 *   node scripts/list-users.mjs --search=john --limit=10 --sort=username --asc
 */

// ─── DB helpers (mirrors the pattern in create-admin.mjs) ────────────────────

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
 * Run a query on every shard in parallel and merge all rows.
 * Shard errors are logged but do not abort — remaining shards still run.
 */
async function fanOut(pools, sql, params = []) {
  const results = await Promise.allSettled(
    pools.map(p => p.query(sql, params))
  );
  const rows = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'fulfilled') {
      rows.push(...results[i].value.rows);
    } else {
      console.error(`  ⚠️  SHARD_${i} query failed: ${results[i].reason?.message}`);
    }
  }
  return rows;
}

/**
 * Mirrors computeVipStatus() in src/lib/vip.ts — kept as a plain function
 * here since this script has no access to the app's TS module resolution.
 * Keep in sync if the VIP rules in that file ever change.
 */
function computeVipStatus(row) {
  const permanent = Boolean(row.vip_permanent);
  const expiresAt = row.vip_expires_at ?? null;
  const timedActive = expiresAt !== null && new Date(expiresAt).getTime() > Date.now();
  return {
    isVip: permanent || timedActive,
    permanent,
    expiresAt: permanent ? null : expiresAt,
  };
}

// ─── CLI arg parsing ─────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    role:   null,   // 'admin' | 'user' | null
    vip:    null,   // 'yes' | 'no' | null
    search: null,   // string | null
    full:   false,
    limit:  50,
    sort:   'created_at',
    asc:    false,
  };
  const validSorts = new Set(['username', 'email', 'role', 'created_at']);

  for (const arg of args) {
    if (arg === '--full')          { opts.full = true; continue; }
    if (arg === '--asc')           { opts.asc  = true; continue; }
    const [k, v] = arg.replace(/^--/, '').split('=');
    if (!v) { console.error(`Unknown flag: ${arg}`); process.exit(1); }
    if (k === 'role')   { opts.role   = v; }
    if (k === 'vip')    { opts.vip    = v; }
    if (k === 'search') { opts.search = v; }
    if (k === 'limit')  { opts.limit  = parseInt(v, 10) || 0; }
    if (k === 'sort')   {
      if (!validSorts.has(v)) {
        console.error(`--sort must be one of: ${[...validSorts].join(', ')}`);
        process.exit(1);
      }
      opts.sort = v;
    }
  }

  if (opts.role && !['admin', 'user'].includes(opts.role)) {
    console.error('--role must be "admin" or "user"');
    process.exit(1);
  }
  if (opts.vip && !['yes', 'no'].includes(opts.vip)) {
    console.error('--vip must be "yes" or "no"');
    process.exit(1);
  }

  return opts;
}

// ─── Display helpers ─────────────────────────────────────────────────────────

function truncate(str, len) {
  if (!str) return '—';
  return str.length <= len ? str : str.slice(0, len - 1) + '…';
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 16);
}

function fmtVip(vip) {
  if (!vip.isVip) return '—';
  if (vip.permanent) return '👑 vĩnh viễn';
  return `👑 ${fmtDate(vip.expiresAt).slice(0, 10)}`;
}

function printTable(users, opts) {
  if (users.length === 0) {
    console.log('  (no users found)');
    return;
  }

  const colW = opts.full
    ? { shard: 5, username: 18, email: 30, role: 7, vip: 12, bookmarks: 10, votes: 6, joined: 16 }
    : { shard: 5, username: 18, email: 30, role: 7, vip: 12, avatar: 8, joined: 16 };

  const cols = opts.full
    ? ['shard', 'username', 'email', 'role', 'vip', 'bookmarks', 'votes', 'joined']
    : ['shard', 'username', 'email', 'role', 'vip', 'avatar', 'joined'];

  const header = cols.map(c => c.toUpperCase().padEnd(colW[c])).join('  ');
  const divider = cols.map(c => '─'.repeat(colW[c])).join('  ');

  console.log('\n  ' + header);
  console.log('  ' + divider);

  for (const u of users) {
    const row = opts.full
      ? [
          String(u._shard).padEnd(colW.shard),
          truncate(u.username, colW.username).padEnd(colW.username),
          truncate(u.email,    colW.email).padEnd(colW.email),
          (u.role === 'admin' ? '★ admin' : 'user').padEnd(colW.role),
          fmtVip(u._vip).padEnd(colW.vip),
          String(u._bookmarks ?? 0).padEnd(colW.bookmarks),
          String(u._votes    ?? 0).padEnd(colW.votes),
          fmtDate(u.created_at).padEnd(colW.joined),
        ]
      : [
          String(u._shard).padEnd(colW.shard),
          truncate(u.username, colW.username).padEnd(colW.username),
          truncate(u.email,    colW.email).padEnd(colW.email),
          (u.role === 'admin' ? '★ admin' : 'user').padEnd(colW.role),
          fmtVip(u._vip).padEnd(colW.vip),
          (u.avatar_url ? 'yes' : 'no').padEnd(colW.avatar),
          fmtDate(u.created_at).padEnd(colW.joined),
        ];
    console.log('  ' + row.join('  '));
  }

  console.log('  ' + divider);
  console.log(`  ${users.length} user(s) shown\n`);
}

function printFullDetail(users) {
  for (const u of users) {
    console.log(`\n  ┌─ ${u.username} <${u.email}>`);
    console.log(`  │  id         : ${u.id}`);
    console.log(`  │  role       : ${u.role}`);
    console.log(`  │  vip        : ${fmtVip(u._vip)}`);
    console.log(`  │  shard      : SHARD_${u._shard}`);
    console.log(`  │  avatar     : ${u.avatar_url || '—'}`);
    console.log(`  │  joined     : ${fmtDate(u.created_at)}`);
    console.log(`  │  updated    : ${fmtDate(u.updated_at)}`);
    console.log(`  │  bookmarks  : ${u._bookmarks ?? 0}`);
    console.log(`  │  votes      : ${u._votes ?? 0}`);
    if (u._bookmarked_games?.length) {
      console.log(`  │  bookmarked games:`);
      for (const g of u._bookmarked_games) {
        console.log(`  │    · ${g.title} (${fmtDate(g.bookmarked_at)})`);
      }
    }
    console.log('  └─');
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
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
    console.log(`\n👥  VNSVault — List Users  (${shards.length} shard(s))\n`);

    // ── 1. Fetch users from all shards ───────────────────────────────────────
    // password_hash deliberately excluded.
    let sql = `
      SELECT id, username, email, role, avatar_url, created_at, updated_at,
             vip_permanent, vip_expires_at
      FROM users
      WHERE TRUE
    `;
    const params = [];

    if (opts.role) {
      params.push(opts.role);
      sql += ` AND role = $${params.length}`;
    }
    if (opts.search) {
      params.push(`%${opts.search.toLowerCase()}%`);
      sql += ` AND (LOWER(username) LIKE $${params.length} OR LOWER(email) LIKE $${params.length})`;
    }
    if (opts.vip === 'yes') {
      sql += ` AND (vip_permanent = TRUE OR (vip_expires_at IS NOT NULL AND vip_expires_at > NOW()))`;
    } else if (opts.vip === 'no') {
      sql += ` AND NOT (vip_permanent = TRUE OR (vip_expires_at IS NOT NULL AND vip_expires_at > NOW()))`;
    }

    const rawUsers = [];
    for (let i = 0; i < pools.length; i++) {
      try {
        const res = await pools[i].query(sql, params);
        for (const row of res.rows) rawUsers.push({ ...row, _shard: shards[i].index });
      } catch (e) {
        console.error(`  ⚠️  SHARD_${shards[i].index}: ${e.message}`);
      }
    }

    // De-duplicate by id (should not happen with healthy sharding, but be safe)
    const seen = new Set();
    const users = rawUsers.filter(u => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });

    for (const u of users) u._vip = computeVipStatus(u);

    // ── 2. Sort ──────────────────────────────────────────────────────────────
    users.sort((a, b) => {
      const va = a[opts.sort] ?? '';
      const vb = b[opts.sort] ?? '';
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return opts.asc ? cmp : -cmp;
    });

    const displayUsers = opts.limit > 0 ? users.slice(0, opts.limit) : users;

    if (displayUsers.length === 0) {
      console.log('  No users match the given filters.\n');
      return;
    }

    // ── 3. Fetch related counts if --full ────────────────────────────────────
    if (opts.full && displayUsers.length > 0) {
      const ids = displayUsers.map(u => u.id);

      // Bookmarks and request_votes can live on ANY shard → fanOut
      const [bookmarkRows, voteRows] = await Promise.all([
        fanOut(pools, `
          SELECT b.user_id, COUNT(*) AS cnt, 
                 json_agg(json_build_object('title', g.title, 'bookmarked_at', b.created_at)
                          ORDER BY b.created_at DESC) AS games
          FROM bookmarks b
          JOIN games g ON g.id = b.game_id
          WHERE b.user_id = ANY($1)
          GROUP BY b.user_id
        `, [ids]),
        fanOut(pools, `
          SELECT user_id, COUNT(*) AS cnt
          FROM request_votes
          WHERE user_id = ANY($1)
          GROUP BY user_id
        `, [ids]),
      ]);

      // Aggregate counts per user_id across shards
      const bookmarkMap = new Map(); // user_id → { count, games[] }
      for (const row of bookmarkRows) {
        const prev = bookmarkMap.get(row.user_id) ?? { count: 0, games: [] };
        bookmarkMap.set(row.user_id, {
          count: prev.count + Number(row.cnt),
          games: [...prev.games, ...(row.games ?? [])],
        });
      }

      const voteMap = new Map(); // user_id → count
      for (const row of voteRows) {
        voteMap.set(row.user_id, (voteMap.get(row.user_id) ?? 0) + Number(row.cnt));
      }

      for (const u of displayUsers) {
        const bk = bookmarkMap.get(u.id);
        u._bookmarks      = bk?.count ?? 0;
        u._bookmarked_games = bk?.games ?? [];
        u._votes          = voteMap.get(u.id) ?? 0;
      }

      // Print detailed view instead of table
      printFullDetail(displayUsers);
      console.log(`  ${displayUsers.length} / ${users.length} user(s) shown\n`);
    } else {
      // ── 4. Print summary table ───────────────────────────────────────────
      printTable(displayUsers, opts);
      if (opts.limit > 0 && users.length > opts.limit) {
        console.log(`  ℹ️  ${users.length - opts.limit} more result(s) hidden. Use --limit=0 to show all.\n`);
      }
    }
  } finally {
    for (const p of pools) await p.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });

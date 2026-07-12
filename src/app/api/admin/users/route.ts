export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireFreshAdmin } from '@/lib/adminGuard';
import { computeVipStatus } from '@/lib/vip';

async function requireAdmin(req: NextRequest) {
  return requireFreshAdmin(req);
}

interface UserRow {
  id: string;
  username: string;
  email: string;
  role: string;
  vip_permanent: boolean;
  vip_expires_at: string | null;
  created_at: string;
}

const LIST_LIMIT = 30;

/**
 * GET /api/admin/users?q=<username or email>&filter=<all|vip|novip|admin>
 *
 * Users can land on any shard — fan out and merge, same pattern as every
 * other unique-key user lookup (auth routes). Without a query, returns the
 * most recently registered users; with one, matches username/email by
 * substring (case-insensitive) so the admin can find an account by either
 * — VIP transfers are matched by username + email in the transfer note,
 * per the /donate instructions.
 *
 * `filter` narrows the result set for the VIP management view:
 *   - vip    → currently VIP (permanent OR not-yet-expired timed VIP) —
 *              same "is VIP right now" condition as computeVipStatus().
 *   - novip  → NOT currently VIP (regardless of role)
 *   - admin  → role = 'admin' (regardless of VIP status)
 *   - all / anything else → no extra restriction (default, current behavior)
 */
export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ success: false, error: 'Không có quyền truy cập' }, { status: 403 });
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const filter = req.nextUrl.searchParams.get('filter')?.trim() ?? 'all';

  const VIP_NOW_SQL = `(vip_permanent = TRUE OR (vip_expires_at IS NOT NULL AND vip_expires_at > NOW()))`;

  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (q) { conditions.push(`(username ILIKE $${idx} OR email ILIKE $${idx})`); values.push(`%${q}%`); idx++; }
  if (filter === 'vip')   conditions.push(VIP_NOW_SQL);
  if (filter === 'novip') conditions.push(`NOT ${VIP_NOW_SQL}`);
  if (filter === 'admin') conditions.push(`role = 'admin'`);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const rows = await db.fanOut<UserRow>(
      `SELECT id, username, email, role, vip_permanent, vip_expires_at, created_at
       FROM users
       ${where}
       ORDER BY created_at DESC
       LIMIT ${LIST_LIMIT}`,
      values
    );

    // fanOut merges every shard's own top-LIMIT — re-sort + re-slice in
    // app code to get the true global top-LIMIT (mirrors getRecentGames).
    rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const items = rows.slice(0, LIST_LIMIT).map(r => ({
      id: r.id,
      username: r.username,
      email: r.email,
      role: r.role,
      created_at: r.created_at,
      vip: computeVipStatus(r),
    }));

    return NextResponse.json({ success: true, data: items });
  } catch (e) {
    console.error('[GET /api/admin/users]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

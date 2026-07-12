export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireFreshAdmin } from '@/lib/adminGuard';
import { computeVipStatus } from '@/lib/vip';
import { isValidUUID } from '@/lib/utils';

async function requireAdmin(req: NextRequest) {
  return requireFreshAdmin(req);
}

const MAX_MONTHS = 60;

interface Body {
  /** Grant/extend by this many months. Mutually exclusive with `permanent`/`revoke`. */
  months?: number;
  /** Grant VIP forever (vip_expires_at cleared, never checked again). */
  permanent?: boolean;
  /** Remove VIP entirely. */
  revoke?: boolean;
}

interface UserVipRow {
  id: string;
  username: string;
  vip_permanent: boolean;
  vip_expires_at: string | null;
}

/**
 * PATCH /api/admin/users/[id]/vip
 * Body: one of { months }, { permanent: true }, or { revoke: true }.
 *
 * `months` EXTENDS from the user's current expiry when they're already an
 * active timed VIP (so re-upping before expiry doesn't waste the
 * remaining time), otherwise starts counting from now — computed and
 * written in ONE atomic `UPDATE ... RETURNING`, not a separate read then
 * write. A read-then-write here would race: two near-simultaneous
 * requests (e.g. an admin double-clicking "Gia hạn") could both read the
 * same starting expiry and both compute +N months from it, silently
 * dropping one of the two extensions. `make_interval(months => …)` also
 * gets calendar-accurate month arithmetic straight from Postgres (handles
 * month-length/leap-year edges the same way `Date.setMonth` would, just
 * without the read-then-write gap in between).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ success: false, error: 'Không có quyền truy cập' }, { status: 403 });
  }

  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ success: false, error: 'ID người dùng không hợp lệ' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({})) as Body;

  const RETURNING = 'RETURNING id, username, vip_permanent, vip_expires_at';
  let sql: string;
  let values: unknown[];

  if (body.revoke) {
    sql = `UPDATE users SET vip_permanent=FALSE, vip_expires_at=NULL WHERE id=$1 ${RETURNING}`;
    values = [id];
  } else if (body.permanent) {
    sql = `UPDATE users SET vip_permanent=TRUE, vip_expires_at=NULL WHERE id=$1 ${RETURNING}`;
    values = [id];
  } else if (typeof body.months === 'number' && Number.isFinite(body.months)) {
    const months = Math.trunc(body.months);
    if (months < 1 || months > MAX_MONTHS) {
      return NextResponse.json({ success: false, error: `Số tháng phải từ 1 đến ${MAX_MONTHS}` }, { status: 400 });
    }
    sql = `UPDATE users SET
             vip_permanent = FALSE,
             vip_expires_at = (
               CASE
                 WHEN vip_permanent = FALSE AND vip_expires_at IS NOT NULL AND vip_expires_at > NOW()
                 THEN vip_expires_at
                 ELSE NOW()
               END
             ) + make_interval(months => $1::int)
           WHERE id = $2
           ${RETURNING}`;
    values = [months, id];
  } else {
    return NextResponse.json(
      { success: false, error: 'Cần cung cấp months, permanent hoặc revoke' },
      { status: 400 }
    );
  }

  try {
    // fanOut runs this on every shard, but the WHERE id=$… only ever
    // matches on the one shard actually holding the row — everywhere
    // else RETURNING yields zero rows, so `rows` ends up with exactly
    // 0 or 1 entries. Same "write-by-id via fanOut is safe" pattern the
    // download-count bump uses.
    const rows = await db.fanOut<UserVipRow>(sql, values);
    const updated = rows[0];
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy người dùng' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        username: updated.username,
        vip: computeVipStatus(updated),
      },
    });
  } catch (e) {
    console.error('[PATCH /api/admin/users/[id]/vip]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

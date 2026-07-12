export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireFreshAdmin } from '@/lib/adminGuard';
import { isValidUUID } from '@/lib/utils';

const VALID_STATUSES = ['pending', 'approved', 'in_progress', 'rejected'];

async function requireAdmin(req: NextRequest) {
  return requireFreshAdmin(req);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ success: false, error: 'Không có quyền truy cập' }, { status: 403 });
  }
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ success: false, error: 'Không tìm thấy' }, { status: 404 });
  }

  try {
    const body = await req.json() as { status?: string };
    if (!body.status || !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ success: false, error: 'Trạng thái không hợp lệ' }, { status: 400 });
    }

    // The request row could be on any shard — fan out. Only the shard
    // actually holding it is affected; the rest are harmless no-ops.
    const rows = await db.fanOut(
      'UPDATE game_requests SET status=$1 WHERE id=$2 RETURNING id',
      [body.status, id]
    );
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[PATCH /api/admin/requests/[id]]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ success: false, error: 'Không có quyền truy cập' }, { status: 403 });
  }
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ success: false, error: 'Không tìm thấy' }, { status: 404 });
  }

  try {
    // Only the shard holding this request is affected. request_votes rows
    // are always co-located with their game_requests parent (see
    // vote/route.ts), so ON DELETE CASCADE cleans them up locally and
    // correctly on that same shard.
    await db.fanOut('DELETE FROM game_requests WHERE id=$1', [id]);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[DELETE /api/admin/requests/[id]]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireFreshAdmin } from '@/lib/adminGuard';
import { isValidUUID } from '@/lib/utils';

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
    if (body.status !== 'open' && body.status !== 'resolved') {
      return NextResponse.json({ success: false, error: 'Trạng thái không hợp lệ' }, { status: 400 });
    }

    // The report row could be on any shard — fan out. Only the shard
    // actually holding it is affected; the rest are harmless no-ops.
    const rows = await db.fanOut(
      'UPDATE link_reports SET status=$1 WHERE id=$2 RETURNING id',
      [body.status, id]
    );
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[PATCH /api/admin/reports/[id]]', e);
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
    // Previously had no RETURNING/no rows-check — always answered
    // { success: true } even when the id matched nothing on any shard
    // (stale row already deleted by another admin tab, or a UUID that
    // simply doesn't exist). The client already removes the row from its
    // local list optimistically, so a delete that silently affected zero
    // rows still LOOKED like it worked in the UI right up until the next
    // page load brought the "deleted" report back — which is exactly what
    // "xoá không được" looks like from the outside. Checking the returned
    // rows turns that into a real 404 the toast can show.
    const rows = await db.fanOut<{ id: string }>(
      'DELETE FROM link_reports WHERE id=$1 RETURNING id',
      [id]
    );
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy báo cáo (có thể đã bị xoá).' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[DELETE /api/admin/reports/[id]]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

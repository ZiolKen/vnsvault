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
    await db.fanOut('DELETE FROM link_reports WHERE id=$1', [id]);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[DELETE /api/admin/reports/[id]]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

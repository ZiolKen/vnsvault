export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/jwt';
import { db } from '@/lib/db';
import { isValidUUID } from '@/lib/utils';

/**
 * POST /api/account/orders/[id]/cancel
 * Cancel a pending VIP order.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  }

  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json(
      { success: false, error: 'Đơn hàng không tồn tại hoặc đã xử lý' },
      { status: 404 }
    );
  }

  try {
    const rows = await db.fanOut<{ id: string }>(
      `UPDATE vip_orders
       SET status = 'cancelled'
       WHERE id = $1 AND user_id = $2 AND status = 'pending'
       RETURNING id`,
      [id, session.userId]
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Đơn hàng không tồn tại hoặc đã xử lý' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[POST /api/account/orders/[id]/cancel]', e);
    return NextResponse.json({ success: false, error: 'Lỗi hủy đơn hàng' }, { status: 500 });
  }
}

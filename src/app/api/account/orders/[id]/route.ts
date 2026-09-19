export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/jwt';
import { db } from '@/lib/db';
import { buildQrUrl } from '@/lib/vipOrders';
import type { VipOrder } from '@/types';

/**
 * GET /api/account/orders/[id]
 * Get the current status of a specific order (used for polling during checkout).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  }

  const { id } = await params;

  const rows = await db.fanOut<VipOrder>(
    `SELECT id, user_id, order_code, expected_amount, months, status,
            bank_transaction_id, paid_amount, created_at, expires_at
     FROM vip_orders
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [id, session.userId]
  );

  const order = rows[0];
  if (!order) {
    return NextResponse.json({ success: false, error: 'Không tìm thấy đơn hàng' }, { status: 404 });
  }

  // Auto-expire if past the deadline and still pending
  if (order.status === 'pending' && new Date(order.expires_at).getTime() < Date.now()) {
    await db.fanOut(
      `UPDATE vip_orders SET status = 'expired' WHERE id = $1 AND status = 'pending'`,
      [order.id]
    );
    order.status = 'expired';
  }

  const res = NextResponse.json({
    success: true,
    data: {
      ...order,
      qrUrl: order.status === 'pending' ? buildQrUrl(order.order_code, order.expected_amount) : null,
    },
  });
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
}

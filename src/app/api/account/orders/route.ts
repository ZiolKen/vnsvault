export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/jwt';
import { db } from '@/lib/db';
import { generateOrderCode, getPlanById, ORDER_EXPIRY_MS, buildQrUrl, VIP_PLANS } from '@/lib/vipOrders';
import type { VipOrder } from '@/types';

/**
 * GET /api/account/orders
 * Returns the current user's VIP order history (all statuses), most recent first.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  }

  const rows = await db.fanOut<VipOrder>(
    `SELECT id, user_id, order_code, expected_amount, months, status,
            bank_transaction_id, paid_amount, created_at, expires_at
     FROM vip_orders
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [session.userId]
  );

  return NextResponse.json({ success: true, data: rows });
}

/**
 * POST /api/account/orders
 * Create a new VIP purchase order.
 * Body: { planId: '1m' | '12m' }
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { planId?: string };
  const plan = body.planId ? getPlanById(body.planId) : undefined;
  if (!plan) {
    return NextResponse.json(
      { success: false, error: 'Gói VIP không hợp lệ', plans: VIP_PLANS },
      { status: 400 }
    );
  }

  const orderCode = generateOrderCode();
  const expiresAt = new Date(Date.now() + ORDER_EXPIRY_MS).toISOString();

  try {
    // Pin to the user's shard — keeps the FK valid and allows atomic
    // VIP extension later when the webhook fires.
    const order = await db.withRowTransaction<VipOrder>(
      'users', 'id', session.userId,
      async (client) => {
        // Cancel any existing pending orders for this user (only one
        // active checkout at a time).
        await client.query(
          `UPDATE vip_orders SET status = 'cancelled'
           WHERE user_id = $1 AND status = 'pending'`,
          [session.userId]
        );

        const res = await client.query<VipOrder>(
          `INSERT INTO vip_orders (user_id, order_code, expected_amount, months, expires_at)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, user_id, order_code, expected_amount, months, status,
                     bank_transaction_id, paid_amount, created_at, expires_at`,
          [session.userId, orderCode, plan.price, plan.months, expiresAt]
        );
        return res.rows[0];
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        ...order,
        qrUrl: buildQrUrl(order.order_code, order.expected_amount),
      },
    });
  } catch (e) {
    console.error('[POST /api/account/orders]', e);
    return NextResponse.json({ success: false, error: 'Lỗi tạo đơn hàng' }, { status: 500 });
  }
}

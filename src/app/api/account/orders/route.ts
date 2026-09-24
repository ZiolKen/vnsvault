export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/jwt';
import { db } from '@/lib/db';
import { generateOrderCode, getPlanById, ORDER_EXPIRY_MS, buildQrUrl, VIP_PLANS, computeMonthsFromAmount } from '@/lib/vipOrders';
import type { VipOrder } from '@/types';

/** Sanity caps on a single checkout — generous, but keeps a typo/bad
 *  client payload from creating an absurd order (e.g. qty: 999999). */
const MAX_LINE_QUANTITY = 20;
const MAX_LINE_ITEMS = VIP_PLANS.length;

class OrderRateLimitError extends Error {
  constructor() { super('Order rate limit exceeded'); this.name = 'OrderRateLimitError'; }
}

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
 * Create a new VIP purchase order — cart-style: one or more plans, each
 * with a quantity.
 *
 * Body: { items: { planId: '1m' | '12m'; quantity: number }[] }
 *
 * There's no per-plan/quantity column on `vip_orders` (see migration
 * 004) — a cart just collapses to a single amount + months, exactly like
 * a real bank transfer does. `computeMonthsFromAmount` (already used by
 * the SePay webhook to translate a paid amount into months) is reused
 * here so a cart of, say, 2× "1 tháng" + 1× "1 năm" produces the same
 * `expected_amount` a lone bank transfer of that total would, and the
 * same greedy years-then-months math decides how many months it's worth
 * — one source of truth on both the "expected" and "actually paid" sides.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { items?: { planId?: string; quantity?: number }[] };
  const rawItems = Array.isArray(body.items) ? body.items : [];

  if (rawItems.length === 0 || rawItems.length > MAX_LINE_ITEMS) {
    return NextResponse.json(
      { success: false, error: 'Giỏ hàng không hợp lệ', plans: VIP_PLANS },
      { status: 400 }
    );
  }

  // Validate + resolve every line, merging duplicate planIds so a client
  // that sends the same plan twice doesn't silently double-count instead
  // of erroring.
  const quantityByPlanId = new Map<string, number>();
  for (const item of rawItems) {
    const plan = item.planId ? getPlanById(item.planId) : undefined;
    const quantity = Number(item.quantity);
    if (!plan || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
      return NextResponse.json(
        { success: false, error: 'Giỏ hàng không hợp lệ', plans: VIP_PLANS },
        { status: 400 }
      );
    }
    quantityByPlanId.set(plan.id, (quantityByPlanId.get(plan.id) ?? 0) + quantity);
  }

  let totalAmount = 0;
  for (const [planId, quantity] of quantityByPlanId) {
    const plan = getPlanById(planId)!;
    totalAmount += plan.price * quantity;
  }

  const months = computeMonthsFromAmount(totalAmount);
  if (months <= 0) {
    return NextResponse.json({ success: false, error: 'Tổng đơn hàng không hợp lệ' }, { status: 400 });
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

        // Rate-limit: prevent automated order spam — a stolen session
        // token could otherwise flood the vip_orders table. 5 orders per
        // hour is generous for legitimate use (a user changing their mind
        // a few times) while blocking sustained automated abuse.
        const recentRes = await client.query(
          `SELECT COUNT(*)::int AS cnt FROM vip_orders
           WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
          [session.userId]
        );
        if ((recentRes.rows[0]?.cnt ?? 0) >= 5) {
          throw new OrderRateLimitError();
        }

        const res = await client.query<VipOrder>(
          `INSERT INTO vip_orders (user_id, order_code, expected_amount, months, expires_at)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, user_id, order_code, expected_amount, months, status,
                     bank_transaction_id, paid_amount, created_at, expires_at`,
          [session.userId, orderCode, totalAmount, months, expiresAt]
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
    if (e instanceof OrderRateLimitError) {
      return NextResponse.json(
        { success: false, error: 'Bạn đã tạo quá nhiều đơn hàng gần đây. Vui lòng thử lại sau.' },
        { status: 429 }
      );
    }
    console.error('[POST /api/account/orders]', e);
    return NextResponse.json({ success: false, error: 'Lỗi tạo đơn hàng' }, { status: 500 });
  }
}

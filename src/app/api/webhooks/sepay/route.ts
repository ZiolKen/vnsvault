export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { db, RowNotFoundError } from '@/lib/db';
import { computeMonthsFromAmount } from '@/lib/vipOrders';

/**
 * Constant-time string compare — a plain `!==` on the webhook token leaks
 * timing information proportional to how many leading bytes match, which
 * (in theory, given enough samples) lets an attacker recover the token
 * byte-by-byte instead of needing to guess it whole. `timingSafeEqual`
 * requires equal-length buffers, so unequal lengths are rejected up front
 * without ever touching it (that early return's timing depends only on
 * length, not content, so it leaks nothing about the actual token bytes).
 */
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * POST /api/webhooks/sepay
 *
 * SePay calls this endpoint when a bank transfer is received. The webhook
 * payload contains the transfer amount and content (lời nhắn), which we
 * use to match against a pending VIP order.
 *
 * Authentication: SePay sends an API key in the Authorization header.
 * We validate it against the SEPAY_WEBHOOK_TOKEN env var.
 *
 * Idempotency: The `bank_transaction_id` column has a UNIQUE constraint —
 * if SePay retries the same webhook (e.g. due to network timeout), the
 * second INSERT attempt will fail with a duplicate key error, and we
 * return 200 without double-crediting VIP.
 *
 * Cross-shard safety: The order_code is globally unique. We fan out a
 * SELECT to find it, then pin the fulfillment transaction to the shard
 * that holds both the order and its user (co-located by construction).
 */

// SePay webhook payload shape (subset of fields we care about)
interface SepayPayload {
  /** Unique transaction reference from the bank. */
  id?: number;
  /** Transfer amount in VND. */
  transferAmount?: number;
  /** Transfer content / message (nội dung chuyển khoản). */
  content?: string;
  /** 'in' for incoming transfers. */
  transferType?: string;
  /** Reference number from bank. */
  referenceCode?: string;
  /** Gateway identifier. */
  gateway?: string;
  /** Transaction date. */
  transactionDate?: string;
  /** Account number that received the transfer. */
  accountNumber?: string;
}

// Regex to extract order code from transfer content.
// Matches "VNS" followed by 4-8 alphanumeric characters.
const ORDER_CODE_REGEX = /VNS[A-HJ-NP-Z2-9]{4,8}/i;

function extractOrderCode(content: string): string | null {
  const match = content.match(ORDER_CODE_REGEX);
  return match ? match[0].toUpperCase() : null;
}

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────
  const webhookToken = process.env.SEPAY_WEBHOOK_TOKEN;
  if (webhookToken) {
    const auth = req.headers.get('authorization');
    const provided = auth?.replace(/^Apikey\s+/i, '').trim();
    if (!provided || !safeCompare(provided, webhookToken)) {
      console.warn('[Webhook/SePay] Invalid or missing auth token');
      return NextResponse.json({ success: false }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.error('[Webhook/SePay] SEPAY_WEBHOOK_TOKEN not set — rejecting in production');
    return NextResponse.json({ success: false }, { status: 500 });
  }

  // ── Parse payload ──────────────────────────────────────────────────
  let payload: SepayPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  // Only process incoming transfers
  if (payload.transferType && payload.transferType !== 'in') {
    return NextResponse.json({ success: true, message: 'Ignored: not an incoming transfer' });
  }

  const amount = payload.transferAmount;
  const content = payload.content ?? '';
  const bankTxId = String(payload.id ?? payload.referenceCode ?? '');

  if (!amount || amount <= 0) {
    return NextResponse.json({ success: true, message: 'Ignored: zero or missing amount' });
  }

  if (!bankTxId) {
    console.error('[Webhook/SePay] Missing transaction ID in payload:', payload);
    return NextResponse.json({ success: false, error: 'Missing transaction ID' }, { status: 400 });
  }

  // ── Extract order code from content ────────────────────────────────
  const orderCode = extractOrderCode(content);
  if (!orderCode) {
    // Transfer without a recognizable order code — could be a plain
    // donation or manual transfer. Log it but don't error.
    console.log(`[Webhook/SePay] No order code found in content: "${content}". Amount: ${amount}. TxID: ${bankTxId}`);
    return NextResponse.json({ success: true, message: 'No order code found — ignored' });
  }

  // ── Find the pending order ────────────────────────────────────────
  const orderRows = await db.fanOut<{
    id: string;
    user_id: string;
    expected_amount: number;
    months: number;
    status: string;
    expires_at: string;
  }>(
    `SELECT id, user_id, expected_amount, months, status, expires_at
     FROM vip_orders
     WHERE order_code = $1
     LIMIT 1`,
    [orderCode]
  );

  const order = orderRows[0];
  if (!order) {
    console.warn(`[Webhook/SePay] Order code "${orderCode}" not found. TxID: ${bankTxId}`);
    return NextResponse.json({ success: true, message: 'Order not found — ignored' });
  }

  // Already processed (paid/cancelled/expired) — idempotent response
  if (order.status !== 'pending') {
    console.log(`[Webhook/SePay] Order "${orderCode}" already ${order.status}. TxID: ${bankTxId}`);
    return NextResponse.json({ success: true, message: `Order already ${order.status}` });
  }

  // Check expiry
  const isExpired = new Date(order.expires_at).getTime() < Date.now();
  if (isExpired) {
    // Mark as expired but still log the payment for admin review
    await db.fanOut(
      `UPDATE vip_orders SET status = 'expired', bank_transaction_id = $1, paid_amount = $2
       WHERE id = $3 AND status = 'pending'`,
      [bankTxId, amount, order.id]
    );
    console.warn(`[Webhook/SePay] Order "${orderCode}" expired but payment received. Amount: ${amount}. TxID: ${bankTxId}. Admin should review.`);
    return NextResponse.json({ success: true, message: 'Order expired — logged for admin review' });
  }

  // ── Determine months to credit ────────────────────────────────────
  // If the user paid more than expected, credit bonus months via the
  // stacking algorithm. If less, still credit the order's original
  // months as long as the amount meets the minimum (19K).
  let monthsToAdd = order.months;
  if (amount > order.expected_amount) {
    const computed = computeMonthsFromAmount(amount);
    if (computed > monthsToAdd) monthsToAdd = computed;
  } else if (amount < order.expected_amount) {
    // Under-payment: still try to credit what the amount covers
    const computed = computeMonthsFromAmount(amount);
    if (computed <= 0) {
      // Not enough for even 1 month — mark paid but log warning
      console.warn(`[Webhook/SePay] Under-payment for order "${orderCode}": expected ${order.expected_amount}, got ${amount}. TxID: ${bankTxId}`);
      monthsToAdd = 0;
    } else {
      monthsToAdd = computed;
    }
  }

  // ── Fulfill the order (atomic transaction on user's shard) ────────
  try {
    await db.withRowTransaction('users', 'id', order.user_id, async (client) => {
      // Mark order as paid (idempotent via UNIQUE on bank_transaction_id)
      const updateRes = await client.query(
        `UPDATE vip_orders
         SET status = 'paid', bank_transaction_id = $1, paid_amount = $2, months = $3
         WHERE id = $4 AND status = 'pending'
         RETURNING id`,
        [bankTxId, amount, monthsToAdd, order.id]
      );

      if (updateRes.rows.length === 0) {
        // Another webhook instance already processed this — no-op
        return;
      }

      if (monthsToAdd > 0) {
        // Extend VIP: if user is already an active timed VIP, stack from
        // their current expiry; otherwise start from now. Permanent VIP
        // is left untouched (they already have infinite VIP).
        await client.query(
          `UPDATE users SET
             vip_expires_at = (
               CASE
                 WHEN vip_permanent = FALSE AND vip_expires_at IS NOT NULL AND vip_expires_at > NOW()
                 THEN vip_expires_at
                 ELSE NOW()
               END
             ) + make_interval(months => $1::int)
           WHERE id = $2 AND vip_permanent = FALSE`,
          [monthsToAdd, order.user_id]
        );
      }
    });

    console.log(`[Webhook/SePay] ✅ Order "${orderCode}" fulfilled: +${monthsToAdd} months for user ${order.user_id}. Amount: ${amount}. TxID: ${bankTxId}`);
    return NextResponse.json({ success: true, message: 'Order fulfilled' });
  } catch (e) {
    if (e instanceof RowNotFoundError) {
      console.error(`[Webhook/SePay] User ${order.user_id} not found on any shard. TxID: ${bankTxId}`);
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }
    // Duplicate bank_transaction_id → already processed
    if (e instanceof Error && e.message.includes('duplicate key')) {
      console.log(`[Webhook/SePay] Duplicate webhook for TxID: ${bankTxId} — already processed`);
      return NextResponse.json({ success: true, message: 'Already processed' });
    }
    console.error('[Webhook/SePay] Fulfillment error:', e);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}

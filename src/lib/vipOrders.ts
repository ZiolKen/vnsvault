/**
 * VIP Order helpers — order-based purchase flow.
 *
 * Each purchase session creates a temporary `vip_orders` row with a unique
 * `order_code` that's embedded in the bank transfer message. When SePay's
 * webhook fires with that code, the order is fulfilled and VIP is extended.
 *
 * Orders are co-located with their user on the same shard (inserted via
 * withRowTransaction on users.id), keeping the FK valid and allowing the
 * webhook handler to atomically update both the order and user rows in a
 * single transaction without cross-shard coordination.
 */
import crypto from 'crypto';
import type { VipPlan } from '@/types';

// ─── Plans ──────────────────────────────────────────────────────────────
export const VIP_PLANS: VipPlan[] = [
  { id: '1m',  label: 'Gói 1 Tháng',  months: 1,  price: 19_000 },
  { id: '12m', label: 'Gói 1 Năm',    months: 12, price: 199_000 },
];

export function getPlanById(id: string): VipPlan | undefined {
  return VIP_PLANS.find(p => p.id === id);
}

// ─── Order code generation ──────────────────────────────────────────────
// Produces a short, human-friendly, globally-unique code for the bank
// transfer message.  Format: "VNS" + 6 alphanumeric chars (uppercase +
// digits, excluding ambiguous O/0/I/1).  The alphabet gives 28^6 ≈ 481M
// combinations — collision risk is negligible for the lifetime of any
// pending order (30 min), and the DB UNIQUE constraint is the final
// safety net.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ2345679';
const CODE_PREFIX = 'VNS';
const CODE_RANDOM_LENGTH = 6;

export function generateOrderCode(): string {
  const bytes = crypto.randomBytes(CODE_RANDOM_LENGTH);
  let code = CODE_PREFIX;
  for (let i = 0; i < CODE_RANDOM_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

// ─── Order expiry ───────────────────────────────────────────────────────
/** How long a pending order stays valid before auto-expiring (ms). */
export const ORDER_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

// ─── Stacking algorithm ────────────────────────────────────────────────
/**
 * Given an actual transfer amount, compute the most generous number of
 * VIP months: prioritize yearly bundles (cheaper per-month) first, then
 * fill remaining with monthly blocks.
 *
 * Returns 0 if the amount doesn't cover even one month.
 */
export function computeMonthsFromAmount(amount: number): number {
  const YEAR_PRICE = 199_000;
  const MONTH_PRICE = 19_000;

  const years = Math.floor(amount / YEAR_PRICE);
  const remainder = amount - years * YEAR_PRICE;
  const extraMonths = Math.floor(remainder / MONTH_PRICE);

  return years * 12 + extraMonths;
}

// ─── VietQR URL builder ────────────────────────────────────────────────
const VIETQR_BASE = 'https://vietqr.app/img';
const BANK_ACCOUNT = process.env.SEPAY_BANK_ACCOUNT || 'VQRQAMDFQ6060';
const BANK_ID = process.env.SEPAY_BANK_ID || 'MBBank';

export function buildQrUrl(orderCode: string, amount: number): string {
  const params = new URLSearchParams({
    acc: BANK_ACCOUNT,
    bank: BANK_ID,
    amount: String(amount),
    des: orderCode,
    template: 'compact',
    showinfo: 'false',
  });
  return `${VIETQR_BASE}?${params.toString()}`;
}

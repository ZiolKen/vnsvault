/**
 * VIP status helpers.
 *
 * VIP is intentionally NOT embedded in the session JWT (unlike username/
 * role/avatar_url — see src/lib/jwt.ts). The JWT lives for up to 7 days,
 * and VIP is granted/revoked by an admin outside of any self-service flow
 * the user controls — trusting a 7-day-old claim would mean a revoked or
 * lapsed VIP could keep skipping the link-shortener for up to a week, and
 * a freshly-granted VIP wouldn't see the benefit until their next login.
 * Always check the DB fresh at the point VIP status actually matters
 * (download resolution, /myaccount, admin panel).
 */
import { db } from '@/lib/db';

export interface VipRow {
  vip_permanent: boolean;
  vip_expires_at: string | null;
}

export interface VipStatus {
  isVip: boolean;
  permanent: boolean;
  /** ISO string, or null when not on a timed plan (permanent or never was VIP). */
  expiresAt: string | null;
}

/** Pure function: given a user row's VIP columns, is VIP active right now? */
export function computeVipStatus(row: VipRow | undefined | null): VipStatus {
  if (!row) return { isVip: false, permanent: false, expiresAt: null };
  const permanent = Boolean(row.vip_permanent);
  const expiresAt = row.vip_expires_at ?? null;
  const timedActive = expiresAt !== null && new Date(expiresAt).getTime() > Date.now();
  return {
    isVip: permanent || timedActive,
    permanent,
    expiresAt: permanent ? null : expiresAt,
  };
}

/**
 * Fetch a user's live VIP status straight from the DB. Users can land on
 * any shard, so this fans out and merges (same pattern as every other
 * unique-key user lookup in the app — see auth routes).
 */
export async function getUserVipStatus(userId: string): Promise<VipStatus> {
  const rows = await db.fanOut<VipRow>(
    'SELECT vip_permanent, vip_expires_at FROM users WHERE id=$1 LIMIT 1',
    [userId]
  );
  return computeVipStatus(rows[0]);
}

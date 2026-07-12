/**
 * Admin authorization — verified fresh against the DB on every request.
 *
 * `session.role` inside the JWT is only as current as the moment the
 * token was issued, and sessions live for up to 7 days (see EXPIRES_IN in
 * jwt.ts). Demoting an admin (remove-admin.mjs, or any future admin-panel
 * "revoke admin" action) is a plain DB UPDATE — it does not invalidate
 * tokens already issued. Without a fresh check, a just-demoted admin's
 * existing session would keep passing every `role === 'admin'` gate and
 * be able to keep creating/editing/deleting games, approving requests,
 * granting VIP, etc. for however much of the 7-day window remained.
 *
 * This mirrors the same "don't trust the 7-day-old claim, check the DB
 * at the point it actually matters" reasoning already applied to VIP
 * status in src/lib/vip.ts — role is at least as security-sensitive as
 * VIP, so every admin-gated mutation route should use this instead of
 * reading session.role directly.
 */
import { NextRequest } from 'next/server';
import { getSessionFromRequest } from '@/lib/jwt';
import { db } from '@/lib/db';
import type { SessionPayload } from '@/types';

export async function requireFreshAdmin(req: NextRequest): Promise<SessionPayload | null> {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== 'admin') return null;

  const isAdmin = await isFreshAdminRole(session.userId);
  return isAdmin ? session : null;
}

/**
 * Lower-level building block for routes that are open to any logged-in
 * user but grant *extra* privileges to admins (e.g. letting an admin set
 * a custom avatar URL instead of only presets). Those routes still need
 * `session` for a non-admin user, so they can't reject on `!session` the
 * way requireFreshAdmin does — but any branch that trusts `role === 'admin'`
 * for elevated behavior should confirm it against the DB first, same
 * reasoning as above.
 */
export async function isFreshAdminRole(userId: string): Promise<boolean> {
  const rows = await db.fanOut<{ role: string }>(
    'SELECT role FROM users WHERE id=$1 LIMIT 1',
    [userId]
  );
  return rows[0]?.role === 'admin';
}

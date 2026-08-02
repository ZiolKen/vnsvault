import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/jwt';

export const runtime = 'edge';

/**
 * ★ JWT-only — no DB call ★
 * This used to fanOut a `SELECT ... FROM users WHERE id=$1` to every shard
 * on every call. Navbar calls this once per fresh page load for every
 * signed-in visitor (it lives in the root layout now, so it's not
 * re-fetched on client-side navigations — see layout.tsx), which still
 * made it one of the most frequent DB hits in the app, purely to read
 * fields (`username`, `role`, `avatar_url`) that are already sitting
 * signed and trusted in the session cookie.
 *
 * `username` and `role` were already in the JWT. `avatar_url` is now
 * embedded too (see login/register), and re-signed into a fresh cookie by
 * PATCH /api/account/avatar whenever it changes — so this route can answer
 * straight from the verified token with zero DB round-trips.
 *
 * Trade-off: if an admin ever edits another user's `role` or `avatar_url`
 * directly in the DB (no such admin UI exists today), that user's navbar
 * won't reflect it until their session is re-issued (re-login, or next
 * time /api/account/avatar re-signs it). Given the only mutation path for
 * these fields today is self-service login/register/avatar-change — all of
 * which already re-sign the token — this is a non-issue in practice.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    const res = NextResponse.json({ success: false }, { status: 401 });
    res.headers.set('Cache-Control', 'private, no-store');
    return res;
  }

  const res = NextResponse.json({
    success: true,
    data: { username: session.username, role: session.role, avatar_url: session.avatar_url ?? null },
  });
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
}

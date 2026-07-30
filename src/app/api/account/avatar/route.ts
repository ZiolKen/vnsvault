/**
 * PATCH /api/account/avatar
 * Body: { avatarUrl: string }
 *
 * Regular users may only pick one of the 16 preset SVGs (see lib/avatars.ts).
 * Admins may set any URL (e.g. a custom-hosted image).
 */
export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromRequest, createToken, setSessionCookie } from '@/lib/jwt';
import { isFreshAdminRole } from '@/lib/adminGuard';
import { isPresetAvatar } from '@/lib/avatars';

const MAX_URL_LEN = 2048;

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
    }

    const { avatarUrl } = await req.json() as { avatarUrl?: string };
    if (!avatarUrl || typeof avatarUrl !== 'string') {
      return NextResponse.json({ success: false, error: 'Thiếu avatarUrl' }, { status: 400 });
    }
    if (avatarUrl.length > MAX_URL_LEN) {
      return NextResponse.json({ success: false, error: 'URL quá dài' }, { status: 400 });
    }

    // Don't trust session.role for this — it's a 7-day-old JWT claim, and
    // a just-demoted admin's existing session would otherwise keep the
    // "any URL" privilege until the token naturally expires. Confirm
    // against the DB, same reasoning as requireFreshAdmin() in adminGuard.ts.
    const isAdmin = await isFreshAdminRole(session.userId);
    if (!isAdmin && !isPresetAvatar(avatarUrl)) {
      return NextResponse.json(
        { success: false, error: 'Bạn chỉ được chọn avatar trong bộ có sẵn' },
        { status: 403 }
      );
    }
    // Admins get a custom URL — still require it to look like a real URL
    // (absolute http(s) or a site-relative path) rather than arbitrary text.
    if (isAdmin && !isPresetAvatar(avatarUrl)) {
      const looksValid = /^https?:\/\/.+/i.test(avatarUrl) || (avatarUrl.startsWith('/') && !avatarUrl.startsWith('//'));
      if (!looksValid) {
        return NextResponse.json({ success: false, error: 'URL không hợp lệ' }, { status: 400 });
      }
    }

    // UPDATE by id via fanOut — only the shard actually holding this user's
    // row is affected, the rest are harmless no-ops.
    await db.fanOut('UPDATE users SET avatar_url=$1 WHERE id=$2', [avatarUrl, session.userId]);

    // /api/auth/me now reads avatar_url straight from the JWT (no DB call —
    // see that route's comment) rather than re-querying on every page load.
    // That means the token itself must carry the fresh value, or the navbar
    // would keep showing the old avatar for up to 7 days until the session
    // naturally expired. Re-sign and re-set the cookie here so the change
    // is visible on the very next request.
    const newToken = await createToken({
      userId: session.userId,
      username: session.username,
      role: isAdmin ? 'admin' : 'user',
      avatar_url: avatarUrl,
    });
    const res = NextResponse.json({ success: true, data: { avatar_url: avatarUrl } });
    return setSessionCookie(res, newToken);
  } catch (e) {
    console.error('[PATCH /api/account/avatar]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

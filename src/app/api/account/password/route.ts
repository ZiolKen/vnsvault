/**
 * PATCH /api/account/password
 * Body: { currentPassword, newPassword, tsToken }
 * Requires the correct current password + a solved Turnstile challenge.
 */
export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromRequest, clearSessionCookie } from '@/lib/jwt';
import { comparePassword, hashPassword } from '@/lib/password';
import { verifyTurnstile } from '@/lib/turnstile';

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
    }

    const { currentPassword, newPassword, tsToken } = await req.json() as {
      currentPassword?: string; newPassword?: string; tsToken?: string;
    };

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ success: false, error: 'Thiếu thông tin' }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ success: false, error: 'Mật khẩu mới tối thiểu 6 ký tự' }, { status: 400 });
    }
    // bcrypt silently truncates at 72 bytes — cap here to avoid silent
    // collision/confusion, same as /api/auth/register.
    if (newPassword.length > 128) {
      return NextResponse.json({ success: false, error: 'Mật khẩu mới tối đa 128 ký tự' }, { status: 400 });
    }

    const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? undefined;
    const tsOk = await verifyTurnstile(tsToken, ip);
    if (!tsOk) {
      return NextResponse.json({ success: false, error: 'Xác minh bảo mật thất bại. Vui lòng thử lại.' }, { status: 403 });
    }

    // The user row could be on any shard.
    const rows = await db.fanOut<{ id: string; password_hash: string }>(
      'SELECT id, password_hash FROM users WHERE id=$1 LIMIT 1',
      [session.userId]
    );
    const user = rows[0];
    if (!user) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy tài khoản' }, { status: 404 });
    }

    const ok = await comparePassword(currentPassword, user.password_hash);
    if (!ok) {
      return NextResponse.json({ success: false, error: 'Mật khẩu hiện tại không đúng' }, { status: 400 });
    }

    const newHash = await hashPassword(newPassword);
    await db.fanOut('UPDATE users SET password_hash=$1 WHERE id=$2', [newHash, session.userId]);

    // The JWT itself has no server-side revocation list, and the rest of
    // the app (middleware, every API route) trusts it for up to 7 days. If
    // it was stolen (XSS, MitM, lost device), changing the password alone
    // wouldn't kick that token out. Clear the cookie so this device — and
    // anyone else holding a copy of the old token — has to log in again
    // with the new password.
    const res = NextResponse.json({
      success: true,
      message: 'Mật khẩu đã được thay đổi. Vui lòng đăng nhập lại.',
    });
    return clearSessionCookie(res);
  } catch (e) {
    console.error('[PATCH /api/account/password]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

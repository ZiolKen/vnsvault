/**
 * POST /api/auth/reset-password
 * Body: { token, password, tsToken }
 *
 * Consumes a token issued by /api/auth/forgot-password. The link is
 * single-use and time-limited: the token is matched by its SHA-256 hash
 * AND `reset_token_expires_at > NOW()`, then cleared in the same write
 * that sets the new password so a second click can't reset again.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { verifyTurnstile } from '@/lib/turnstile';
import { hashResetToken } from '@/lib/passwordReset';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { token, password, tsToken } = (await req.json()) as {
      token?: string;
      password?: string;
      tsToken?: string;
    };

    if (!token?.trim() || !password) {
      return NextResponse.json({ success: false, error: 'Thiếu thông tin' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ success: false, error: 'Mật khẩu mới tối thiểu 6 ký tự' }, { status: 400 });
    }
    // bcrypt silently truncates at 72 bytes — cap here, same as register /
    // change-password.
    if (password.length > 128) {
      return NextResponse.json({ success: false, error: 'Mật khẩu mới tối đa 128 ký tự' }, { status: 400 });
    }

    const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? undefined;
    const tsOk = await verifyTurnstile(tsToken, ip);
    if (!tsOk) {
      return NextResponse.json(
        { success: false, error: 'Xác minh bảo mật thất bại. Vui lòng thử lại.' },
        { status: 403 }
      );
    }

    const tokenHash = hashResetToken(token.trim());

    // Token owner could be on any shard. Match hash AND unexpired in one
    // query so an expired token is indistinguishable from a bogus one.
    const rows = await db.fanOut<{ id: string }>(
      `SELECT id FROM users
       WHERE reset_token_hash=$1 AND reset_token_expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    const user = rows[0];
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu liên kết mới.',
        },
        { status: 400 }
      );
    }

    const newHash = await hashPassword(password);
    // Set the new password AND invalidate the token atomically so the link
    // is strictly single-use.
    await db.fanOut(
      'UPDATE users SET password_hash=$1, reset_token_hash=NULL, reset_token_expires_at=NULL WHERE id=$2',
      [newHash, user.id]
    );

    return NextResponse.json({
      success: true,
      message: 'Mật khẩu đã được đặt lại. Vui lòng đăng nhập bằng mật khẩu mới.',
    });
  } catch (e) {
    console.error('[POST /api/auth/reset-password]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

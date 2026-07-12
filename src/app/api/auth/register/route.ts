import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createToken, setSessionCookie } from '@/lib/jwt';
import { hashPassword } from '@/lib/password';
import { verifyTurnstile } from '@/lib/turnstile';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    const { username, email, password, tsToken } = await req.json() as {
      username: string; email: string; password: string; tsToken?: string;
    };

    if (!username?.trim() || !email?.trim() || !password) {
      return NextResponse.json({ success: false, error: 'Vui lòng điền đầy đủ thông tin' }, { status: 400 });
    }
    if (username.trim().length < 3 || username.trim().length > 50) {
      return NextResponse.json({ success: false, error: 'Tên hiển thị từ 3–50 ký tự' }, { status: 400 });
    }
    if (!EMAIL_RE.test(email.trim())) {
      return NextResponse.json({ success: false, error: 'Email không hợp lệ' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ success: false, error: 'Mật khẩu tối thiểu 6 ký tự' }, { status: 400 });
    }
    // bcrypt silently truncates at 72 bytes — cap here to avoid silent collision
    if (password.length > 128) {
      return NextResponse.json({ success: false, error: 'Mật khẩu tối đa 128 ký tự' }, { status: 400 });
    }

    const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? undefined;
    const tsOk = await verifyTurnstile(tsToken, ip);
    if (!tsOk) {
      return NextResponse.json({ success: false, error: 'Xác minh bảo mật thất bại. Vui lòng thử lại.' }, { status: 403 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim();

    // Each shard's UNIQUE constraint on email/username only guards against
    // duplicates within that ONE shard — a new user always lands on the
    // current fill-target shard, which could be a different shard than
    // where an existing account with the same email/username lives. An
    // explicit fan-out check is the only way to catch that across shards.
    const existing = await db.fanOut<{ id: string }>(
      'SELECT id FROM users WHERE email=$1 OR username=$2',
      [normalizedEmail, normalizedUsername]
    );
    if (existing.length > 0) {
      return NextResponse.json({ success: false, error: 'Email hoặc tên tài khoản đã tồn tại' }, { status: 409 });
    }

    const hash = await hashPassword(password);

    let user: { id: string; username: string; role: string };
    try {
      const rows = await db.write<{ id: string; username: string; role: string }>(
        `INSERT INTO users (username, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, username, role`,
        [normalizedUsername, normalizedEmail, hash]
      );
      user = rows[0];
    } catch (e: unknown) {
      // PostgreSQL unique_violation — last-resort guard for the rare race
      // where two requests pass the fan-out check above and land on the
      // SAME shard at nearly the same time.
      if ((e as { code?: string }).code === '23505') {
        return NextResponse.json({ success: false, error: 'Email hoặc tên tài khoản đã tồn tại' }, { status: 409 });
      }
      throw e;
    }

    const token = await createToken({ userId: user.id, username: user.username, role: user.role as 'user' | 'admin', avatar_url: null });
    const res = NextResponse.json({ success: true, data: { id: user.id, username: user.username, role: user.role } });
    return setSessionCookie(res, token);
  } catch (e) {
    console.error('[POST /api/auth/register]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

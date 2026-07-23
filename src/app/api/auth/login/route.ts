import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createToken, setSessionCookie } from '@/lib/jwt';
import { comparePassword } from '@/lib/password';
import { verifyTurnstile } from '@/lib/turnstile';
import type { User } from '@/types';

export const runtime = 'nodejs';

// Valid bcrypt hash with no matching plaintext — compared against when the
// identifier doesn't match any user, so a non-existent account takes the
// same code path (and roughly the same time) as a wrong-password attempt.
// Without this, "no such user" responses would return measurably faster
// than "wrong password" ones, letting an attacker enumerate every
// registered email/username via response timing.
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeuPlf0RWREU8AAm4d.dOpV6.lhpJ4hQO6';

export async function POST(req: NextRequest) {
  try {
    const { identifier, password, tsToken } = await req.json() as {
      identifier: string; password: string; tsToken?: string;
    };

    if (!identifier?.trim() || !password) {
      return NextResponse.json({ success: false, error: 'Thiếu thông tin đăng nhập' }, { status: 400 });
    }

    const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? undefined;
    const tsOk = await verifyTurnstile(tsToken, ip);
    if (!tsOk) {
      return NextResponse.json({ success: false, error: 'Xác minh bảo mật thất bại. Vui lòng thử lại.' }, { status: 403 });
    }

    // The user account could live on any shard — fan out and merge. In the
    // (very rare) case of a cross-shard duplicate email/username slipping
    // through, this returns whichever shard responds with a match; expected
    // to be unique in practice since registration checks all shards first.
    //
    // Email side is lowercased before comparing: registration always stores
    // `email` normalized to lowercase (see /api/auth/register), but this
    // query used to compare the identifier as typed — so an account
    // registered as "User@Example.com" (stored as "user@example.com") could
    // never log back in with any different casing of the email, even
    // though it's the same address. Username is intentionally left
    // case-sensitive (as-is) since register() never lowercases it either.
    const trimmed = identifier.trim();
    const rows = await db.fanOut<User & { password_hash: string }>(
      `SELECT id, username, email, role, avatar_url, password_hash
       FROM users WHERE email = $1 OR username = $2 LIMIT 1`,
      [trimmed.toLowerCase(), trimmed]
    );

    const user = rows[0];
    // Always run a bcrypt compare, even with no matching user, so the
    // response time doesn't leak whether the account exists.
    const ok = await comparePassword(password, user?.password_hash ?? DUMMY_HASH);

    if (!user || !ok) {
      return NextResponse.json(
        { success: false, error: 'Email/tên tài khoản hoặc mật khẩu không đúng' },
        { status: 401 }
      );
    }

    const token = await createToken({ userId: user.id, username: user.username, role: user.role, avatar_url: user.avatar_url ?? null });
    const res = NextResponse.json({
      success: true,
      data: { id: user.id, username: user.username, role: user.role },
    });
    return setSessionCookie(res, token);
  } catch (e) {
    console.error('[POST /api/auth/login]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

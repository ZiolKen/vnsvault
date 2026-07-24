/**
 * POST /api/auth/forgot-password
 * Body: { email, tsToken }
 *
 * Enumeration-safe: returns the SAME generic success response whether or
 * not the email belongs to a real account, so this endpoint can't be used
 * to discover which addresses are registered. A token is only actually
 * generated + emailed when the account exists.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyTurnstile } from '@/lib/turnstile';
import { sendEmail } from '@/lib/email';
import { passwordResetEmail } from '@/lib/emails/passwordResetEmail';
import { generateResetToken, RESET_TOKEN_TTL_MINUTES } from '@/lib/passwordReset';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Returned in EVERY case (found/not found, mail sent/failed) — see the
// file header for why. Never branch the response on whether the user
// exists.
const GENERIC_OK = {
  success: true,
  message:
    'Nếu email tồn tại trong hệ thống, chúng tôi đã gửi liên kết đặt lại mật khẩu. Vui lòng kiểm tra hộp thư (kể cả mục Spam).',
};

function resolveBaseUrl(req: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '');
  return fromEnv || req.nextUrl.origin;
}

export async function POST(req: NextRequest) {
  try {
    const { email, tsToken } = (await req.json()) as { email?: string; tsToken?: string };

    if (!email?.trim() || !EMAIL_RE.test(email.trim())) {
      return NextResponse.json({ success: false, error: 'Email không hợp lệ' }, { status: 400 });
    }

    const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? undefined;
    const tsOk = await verifyTurnstile(tsToken, ip);
    if (!tsOk) {
      return NextResponse.json(
        { success: false, error: 'Xác minh bảo mật thất bại. Vui lòng thử lại.' },
        { status: 403 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // The account could live on any shard — fan out and merge.
    const rows = await db.fanOut<{ id: string; username: string; email: string }>(
      'SELECT id, username, email FROM users WHERE email=$1 LIMIT 1',
      [normalizedEmail]
    );
    const user = rows[0];

    if (user) {
      const { rawToken, tokenHash } = generateResetToken();
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000);

      // UPDATE by id fans out to every shard; only the one holding this
      // user does real work (the rest are harmless no-ops), matching the
      // documented fanOut UPDATE-by-id pattern in db/index.ts.
      await db.fanOut(
        'UPDATE users SET reset_token_hash=$1, reset_token_expires_at=$2 WHERE id=$3',
        [tokenHash, expiresAt.toISOString(), user.id]
      );

      const site = resolveBaseUrl(req);
      const resetUrl = `${site}/reset-password?token=${rawToken}`;
      const { subject, html, text } = passwordResetEmail({
        resetUrl,
        username: user.username,
        baseUrl: site,
        expiresMinutes: RESET_TOKEN_TTL_MINUTES,
      });

      const sent = await sendEmail({ to: user.email, subject, html, text });
      if (!sent) {
        // Log for ops visibility, but STILL return the generic success so
        // the response can't distinguish "no such user" from "mail
        // provider hiccup".
        console.error(`[forgot-password] Reset email failed to send for user ${user.id}`);
      }
    }

    return NextResponse.json(GENERIC_OK);
  } catch (e) {
    console.error('[POST /api/auth/forgot-password]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

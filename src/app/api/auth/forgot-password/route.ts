/**
 * POST /api/auth/forgot-password
 * Body: { email, tsToken }
 *
 * Enumeration-safe: returns the SAME generic success response whether or
 * not the email belongs to a real account, so this endpoint can't be used
 * to discover which addresses are registered. A token is only actually
 * generated + emailed when the account exists.
 */
import { NextRequest, NextResponse, after } from 'next/server';
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

// SECURITY: this MUST be a fixed, operator-configured value — never derived
// from the incoming request (Host / X-Forwarded-Host headers are
// client-controlled). Every other place in this codebase that needs the
// site's own origin falls back to a hardcoded literal
// (https://vnsvault.vercel.app) when the env var is missing; this route
// used to be the one exception, falling back to `req.nextUrl.origin` —
// which let an attacker who can influence the Host header (missing env var
// + no strict host-pinning at the edge/proxy) get a valid password-reset
// link emailed to a real victim but pointing at an attacker-controlled
// domain ("password reset poisoning"). Since this value is embedded in a
// security-sensitive, single-use link, we refuse to send rather than ever
// guess it — same "fail rather than silently degrade" contract as
// JWT_SECRET in lib/jwt.ts.
function resolveBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (!base) {
    throw new Error(
      '[FATAL] NEXT_PUBLIC_BASE_URL is not set — refusing to build a password-reset link from request headers.'
    );
  }
  return base;
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

      const site = resolveBaseUrl();
      const resetUrl = `${site}/reset-password?token=${rawToken}`;
      const { subject, html, text } = passwordResetEmail({
        resetUrl,
        username: user.username,
        baseUrl: site,
        expiresMinutes: RESET_TOKEN_TTL_MINUTES,
      });

      // Scheduled via after() rather than plain `await`, and rather than a
      // bare un-awaited `.then()`. Two different problems, one fix:
      //  1. Awaiting sendEmail() (a real network call to Resend, easily
      //     200-400ms) would make the "user exists" branch measurably
      //     slower than the "no such user" branch above (single indexed
      //     SELECT, returns immediately) even though both paths return the
      //     identical GENERIC_OK body — that timing gap is itself an
      //     enumeration oracle, no need to even read the response.
      //  2. A bare un-awaited promise is NOT safe on Vercel: the function
      //     can be frozen/torn down the instant the response is returned,
      //     with no guarantee an in-flight fetch gets to finish — the
      //     email could just silently never send. after() (same API this
      //     codebase already uses in games/[slug]/page.tsx for the view-
      //     count bump) is what actually keeps the invocation alive until
      //     the callback settles, without adding its latency to the
      //     response the browser sees.
      after(() =>
        sendEmail({ to: user.email, subject, html, text })
          .then(sent => {
            if (!sent) console.error(`[forgot-password] Reset email failed to send for user ${user.id}`);
          })
          .catch(e => console.error(`[forgot-password] Reset email threw for user ${user.id}`, e))
      );
    }

    return NextResponse.json(GENERIC_OK);
  } catch (e) {
    console.error('[POST /api/auth/forgot-password]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

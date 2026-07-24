/**
 * Transactional email via Resend.
 *
 * Sent from Node.js API routes ONLY. Uses the Resend REST API over `fetch`
 * rather than the `resend` SDK on purpose — it keeps the dependency list
 * unchanged and matches the fetch-based integration pattern already used
 * in this codebase (turnstile.ts hits Cloudflare directly, redis.ts uses
 * the Upstash REST client). If you'd rather use the official SDK, swap
 * `sendEmail` below for `new Resend(process.env.RESEND_API_KEY).emails.send(...)`.
 *
 * Fail-soft contract: if RESEND_API_KEY is unset, or Resend returns a
 * non-2xx / the network errors, this logs and returns `false` instead of
 * throwing — every caller decides what to do (the forgot-password route
 * still returns a generic success so it can't be used to enumerate
 * accounts, see that route for details).
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// Default sender. MUST be overridden in production with RESEND_FROM_EMAIL
// set to an address on a domain you've verified in the Resend dashboard —
// Resend rejects sends from unverified domains.
const DEFAULT_FROM = 'VNSVault <no-reply@vnsvault.qzz.io>';

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback for clients that don't render HTML. Strongly recommended. */
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailArgs): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[email] RESEND_API_KEY not set — email NOT sent. Set it in your environment.');
    return false;
  }

  const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html, ...(text ? { text } : {}) }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[email] Resend responded ${res.status}: ${detail}`);
      return false;
    }

    return true;
  } catch (e) {
    console.error('[email] Network error while sending via Resend:', e);
    return false;
  }
}

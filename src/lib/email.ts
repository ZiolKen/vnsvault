/**
 * Transactional email.
 *
 * Provider order:
 *   1. Gmail SMTP (nodemailer) — used when GMAIL_USER + GMAIL_APP_PASSWORD are set.
 *   2. Resend REST API (fetch)  — used when RESEND_API_KEY is set, either as the
 *      only provider or as a fallback if Gmail SMTP fails.
 *
 * Sent from Node.js API routes ONLY (nodemailer needs Node APIs; do not import
 * this from middleware / edge runtime).
 *
 * Fail-soft contract (unchanged): never throws. Returns `true` if a provider
 * accepted the message, otherwise logs and returns `false`. Callers decide what
 * to do — the forgot-password route still returns a generic success so it can't
 * be used to enumerate accounts.
 */
import nodemailer, { type Transporter } from 'nodemailer';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// Default Resend sender. Override with RESEND_FROM_EMAIL (must be on a domain
// verified in the Resend dashboard).
const DEFAULT_FROM = 'VNSVault <no-reply@vnsvault.qzz.io>';

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback for clients that don't render HTML. Strongly recommended. */
  text?: string;
}

// ── Gmail SMTP ────────────────────────────────────────────────────────────────

let gmailTransporter: Transporter | null = null;

function getGmailTransporter(): Transporter | null {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, ''); // App Passwords are often pasted with spaces
  if (!user || !pass) return null;

  if (!gmailTransporter) {
    gmailTransporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass },
      // Keep serverless invocations from hanging on a bad connection.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return gmailTransporter;
}

async function sendViaGmail({ to, subject, html, text }: SendEmailArgs): Promise<boolean> {
  const transporter = getGmailTransporter();
  if (!transporter) return false;

  const user = process.env.GMAIL_USER!.trim();
  const fromName = process.env.GMAIL_FROM_NAME?.trim() || 'VNSVault';

  try {
    // Gmail rewrites From to the authenticated account, so use it directly.
    await transporter.sendMail({
      from: `${fromName} <${user}>`,
      to,
      subject,
      html,
      ...(text ? { text } : {}),
    });
    return true;
  } catch (e) {
    console.error('[email] Gmail SMTP error:', e);
    return false;
  }
}

// ── Resend ────────────────────────────────────────────────────────────────────

async function sendViaResend({ to, subject, html, text }: SendEmailArgs): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
  const replyTo = process.env.RESEND_REPLY_TO?.trim();

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
        ...(text ? { text } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
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

// ── Public API ────────────────────────────────────────────────────────────────

export async function sendEmail(args: SendEmailArgs): Promise<boolean> {
  const hasGmail = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
  const hasResend = !!process.env.RESEND_API_KEY;

  if (!hasGmail && !hasResend) {
    console.error(
      '[email] No provider configured — email NOT sent. Set GMAIL_USER + GMAIL_APP_PASSWORD, or RESEND_API_KEY.'
    );
    return false;
  }

  if (hasGmail) {
    if (await sendViaGmail(args)) return true;
    if (hasResend) console.error('[email] Gmail failed — falling back to Resend.');
  }

  if (hasResend) return sendViaResend(args);
  return false;
}

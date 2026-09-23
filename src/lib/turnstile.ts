/**
 * Cloudflare Turnstile server-side verification.
 * Set TURNSTILE_SECRET_KEY in env.
 * In dev mode (no secret), verification is skipped.
 */
export async function verifyTurnstile(token: string | undefined | null, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  // Skip in dev if no secret configured
  if (!secret) {
    if (process.env.NODE_ENV !== 'production') return true;
    console.error('[Turnstile] TURNSTILE_SECRET_KEY not set in production');
    return false;
  }

  if (!token) return false;

  try {
    const body: Record<string, string> = { secret, response: token };
    if (ip) body.remoteip = ip;

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5555),
    });

    const data = await res.json() as { success: boolean; 'error-codes'?: string[] };
    if (!data.success) {
      console.warn('[Turnstile] Verification failed:', data['error-codes']);
    }
    return data.success === true;
  } catch (e) {
    console.error('[Turnstile] Network error:', e);
    return false;
  }
}

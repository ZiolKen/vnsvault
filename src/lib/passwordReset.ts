/**
 * Password-reset token helpers — Node.js runtime only (uses node:crypto).
 *
 * The token a user receives by email is high-entropy random (256 bits), so
 * a fast one-way hash (SHA-256) is the correct choice for what we persist:
 * unlike a human-chosen password it isn't guessable/brute-forceable, so
 * bcrypt's deliberate slowness would buy nothing and only slow the lookup.
 *
 * We store ONLY the hash (`reset_token_hash`) — the raw token lives solely
 * inside the emailed link. A read-only leak of the users table therefore
 * can't be used to reset anyone's password.
 */
import { createHash, randomBytes } from 'crypto';

/** How long a reset link stays valid after it's issued. */
export const RESET_TOKEN_TTL_MINUTES = 60;

/** SHA-256 hex hash of a raw reset token — what gets stored / looked up. */
export function hashResetToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** Generate a URL-safe raw token plus its stored hash. */
export function generateResetToken(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(32).toString('hex');
  return { rawToken, tokenHash: hashResetToken(rawToken) };
}

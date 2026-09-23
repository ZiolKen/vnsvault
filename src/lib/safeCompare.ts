/**
 * Constant-time string compare for secret tokens (webhook auth keys, cron
 * secrets, etc). A plain `!==`/`===` on a secret leaks timing information
 * proportional to how many leading bytes match — in theory, given enough
 * samples, that lets an attacker recover the secret byte-by-byte instead
 * of needing to guess it whole. `timingSafeEqual` requires equal-length
 * buffers, so unequal lengths are rejected up front without ever touching
 * it (that early return's timing depends only on length, not content, so
 * it leaks nothing about the actual secret bytes).
 *
 * Originally lived only in the SePay webhook route; extracted here so
 * every place in the app that checks a bearer-token/secret header
 * (webhooks, /api/internal/* cron routes) shares the same timing-safe
 * comparison instead of some routes using this and others falling back to
 * a plain string `!==`.
 */
import { timingSafeEqual } from 'crypto';

export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

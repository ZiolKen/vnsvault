import { timingSafeEqual } from 'crypto';

/**
 * Constant-time string comparison — prevents timing side-channels when
 * comparing secrets (CRON_SECRET, SEPAY_WEBHOOK_TOKEN, etc.).
 *
 * Both inputs are padded to the same length before timingSafeEqual so
 * that even the length check doesn't leak timing information. The actual
 * length equality is verified separately (but still in constant time
 * relative to the string contents) and ANDed with the byte comparison.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  const maxLen = Math.max(bufA.length, bufB.length, 1);
  const paddedA = Buffer.alloc(maxLen);
  const paddedB = Buffer.alloc(maxLen);
  bufA.copy(paddedA);
  bufB.copy(paddedB);
  // timingSafeEqual runs in constant time over the full padded length;
  // the length check is a simple integer comparison that doesn't vary
  // with the byte content of either string.
  return timingSafeEqual(paddedA, paddedB) && bufA.length === bufB.length;
}

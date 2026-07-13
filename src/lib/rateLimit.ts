/**
 * In-memory rate limiter for the Edge middleware.
 *
 * CAVEAT (Vercel serverless/edge): this Map lives inside a single running
 * instance. On Edge it's usually one warm instance per region so this
 * catches real abuse reasonably well; on Node functions, traffic spread
 * across multiple concurrent instances means each instance counts
 * independently — a determined attacker distributed across instances can
 * exceed the nominal limit by roughly (instance count)×. This is a
 * best-effort first line of defense, not a hard guarantee; for a hard
 * guarantee, back this with Vercel KV/Upstash Redis (INCR + EXPIRE) so all
 * instances share one counter.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Prevent unbounded growth from IP-spoofed/rotating keys — evict the
// oldest-expiring entries once the map gets large instead of never
// shrinking.
const MAX_BUCKETS = 5_000;

function evictIfNeeded() {
  if (buckets.size <= MAX_BUCKETS) return;
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
    if (buckets.size <= MAX_BUCKETS) return;
  }
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  retryAfterSeconds?: number;
}

export interface RateLimitOptions {
  /** Rolling window size in ms. */
  windowMs?: number;
  /** Max requests allowed per window. */
  max?: number;
}

/**
 * Fixed-window rate limit keyed by an arbitrary string (typically
 * `${route}:${ip}`). Call once per incoming request.
 */
export function rateLimit(key: string, options: RateLimitOptions = {}): RateLimitResult {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 60;
  const now = Date.now();

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    evictIfNeeded();
    return { success: true, remaining: max - 1 };
  }

  if (bucket.count >= max) {
    return { success: false, remaining: 0, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { success: true, remaining: max - bucket.count };
}

/**
 * Best-effort client IP extraction.
 *
 * Every other IP-consuming route in this codebase (login, register,
 * report-link, vote, password-change) checks `cf-connecting-ip` before
 * `x-forwarded-for` — meaning Cloudflare fronts this deployment. This
 * function used to check `x-forwarded-for` ONLY, which behind Cloudflare
 * is Cloudflare's own edge IP (or an attacker-influenced value), not the
 * visitor's — every visitor would collapse into the SAME rate-limit
 * bucket, so one abusive user exhausting the shared bucket would lock out
 * every other Cloudflare-routed visitor too. Matching the header priority
 * already established elsewhere fixes that.
 *
 * `x-forwarded-for` is still checked as a fallback for the no-Cloudflare
 * case (local dev, direct-to-Vercel preview deploys): Vercel's own edge
 * overwrites this header with the real connecting IP rather than
 * forwarding a client-supplied one, so it's trustworthy in that scenario.
 */
export function getClientIp(headers: Headers): string {
  const cf = headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const real = headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

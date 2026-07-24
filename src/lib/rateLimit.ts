/**
 * Rate limiter for the Edge middleware — Redis-backed (shared across every
 * instance) with an in-memory fallback for when Redis is unset or
 * unreachable.
 *
 * Uses the same Upstash Redis client as the shard-write pointer (see
 * redis.ts) — it's fetch-based, so it works from Edge middleware the same
 * way it works from Node routes. INCR + conditional EXPIRE isn't perfectly
 * atomic (a request could theoretically read the post-INCR count before
 * the EXPIRE lands), but the only failure mode for a rate limiter is a
 * window very occasionally ending up ~1 request wider than configured —
 * a non-issue compared to what it replaces: on Vercel Node functions,
 * traffic spread across concurrent instances each counting independently
 * meant a determined attacker distributed across instances could exceed
 * the nominal limit by roughly (instance count)×. A shared Redis counter
 * closes that gap.
 *
 * Falls back to the original in-memory Map (below) whenever Redis is
 * unset or a call to it fails — same fail-soft contract as every other
 * Redis path in this codebase: degrade to "works, just per-instance"
 * rather than break rate limiting entirely.
 */

import { getRedis } from './redis';

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

/** Original fixed-window in-memory limiter — used directly when Redis is
 * unset, and as the fallback when a Redis call errors. */
function rateLimitInMemory(key: string, windowMs: number, max: number): RateLimitResult {
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
 * Fixed-window rate limit keyed by an arbitrary string (typically
 * `${route}:${ip}`). Call once per incoming request.
 */
export async function rateLimit(key: string, options: RateLimitOptions = {}): Promise<RateLimitResult> {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 60;

  const redis = getRedis();
  if (!redis) return rateLimitInMemory(key, windowMs, max);

  const windowSeconds = Math.ceil(windowMs / 1000);
  const redisKey = `ratelimit:${key}`;

  try {
    const count = await redis.incr(redisKey);
    if (count === 1) {
      // Only the request that just created the key sets its expiry — every
      // later request in the same window just increments.
      await redis.expire(redisKey, windowSeconds);
    }

    if (count > max) {
      const ttl = await redis.ttl(redisKey);
      return { success: false, remaining: 0, retryAfterSeconds: ttl > 0 ? ttl : windowSeconds };
    }

    return { success: true, remaining: max - count };
  } catch (e) {
    console.error(`[rateLimit] Redis error for "${key}", falling back to in-memory for this request:`, e);
    return rateLimitInMemory(key, windowMs, max);
  }
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

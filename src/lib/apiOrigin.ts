/**
 * Global override for which origin every visitor's browser should send
 * `/api/...` calls to — primary, the backup mirror, or 'auto' (the normal
 * automatic failover in lib/apiClient.ts). Stored in Redis, same idea as
 * lib/maintenance.ts's flag, so flipping it from the Admin Dashboard
 * applies to EVERY user's browser, not just the admin's own tab.
 *
 * Unlike maintenance.ts, this is only ever read from Node.js API routes
 * (never Edge middleware — no request needs to be *rewritten* based on
 * this, only the browser's own client-side `apiFetch` needs to know
 * which origin to hit), so it's fine to use the shared `@upstash/redis`
 * SDK client from lib/redis.ts instead of hand-rolling REST calls the
 * way maintenance.ts has to for Edge-safety.
 */
import { getRedis } from '@/lib/redis';

export type ApiOriginMode = 'auto' | 'primary' | 'fallback';

export const API_ORIGIN_MODE_KEY = 'site:api-origin-mode';

/**
 * Current global mode. Fails open to 'auto' on any Redis error/absence —
 * a Redis hiccup must never accidentally strand every visitor's browser
 * pinned to one origin; falling back to the normal automatic failover is
 * always safe.
 */
export async function getApiOriginMode(): Promise<ApiOriginMode> {
  const redis = getRedis();
  if (!redis) return 'auto';

  try {
    const val = await redis.get<string>(API_ORIGIN_MODE_KEY);
    return val === 'primary' || val === 'fallback' ? val : 'auto';
  } catch (e) {
    console.error('[apiOrigin] Redis read failed, failing open to auto:', e);
    return 'auto';
  }
}

/** Admin toggle — used by PUT /api/admin/api-origin only. */
export async function setApiOriginMode(mode: ApiOriginMode): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error('Redis chưa được cấu hình (KV_REST_API_URL/KV_REST_API_TOKEN).');

  if (mode === 'auto') await redis.del(API_ORIGIN_MODE_KEY);
  else await redis.set(API_ORIGIN_MODE_KEY, mode);
}

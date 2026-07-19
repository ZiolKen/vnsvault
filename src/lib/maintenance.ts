/**
 * Site-wide maintenance mode — a single boolean flag in Redis, checked by
 * `middleware.ts` on (almost) every request.
 *
 * Why Redis and not a DB row (like site_announcement uses)? Middleware
 * runs on the Edge runtime, which can't import `pg` (see middleware.ts's
 * top comment: "only imports from jwt.ts, Edge-safe, no bcryptjs" — the
 * ShardedDb pool relies on Node.js TCP sockets, not available on Edge).
 *
 * Deliberately does NOT use `@upstash/redis` (the SDK in lib/redis.ts,
 * used elsewhere for the write-shard pointer) — that SDK's default
 * ("nodejs") build reads `process.version` for telemetry, which Next.js's
 * own Edge Runtime bundler flags at build time: "A Node.js API is used
 * (process.version at line: N) which is not supported in the Edge
 * Runtime." The SDK guards the read (`typeof process === "object" ? ... :
 * undefined`) so it happens not to throw under Vercel's current Edge
 * `process` polyfill — but "happens not to throw today, on a polyfill
 * detail Upstash and Vercel don't jointly document as guaranteed" is not
 * something to depend on for the one code path that gates every request
 * on the site. Talking to Upstash's REST API is just `fetch()` with a
 * Bearer token — trivial to inline directly here and skip the SDK (and
 * its Edge-Runtime warning) entirely for this file.
 *
 * Trade-off worth knowing: this means every non-exempt request pays one
 * Redis round-trip (a few ms via Upstash's global REST edge, plus a short
 * in-memory cache below to blunt repeat calls within the same warm
 * instance). Fine at VNSVault's traffic; if that ever becomes a real cost,
 * the in-memory TTL below can be raised.
 */

export const MAINTENANCE_KEY = 'site:maintenance';

// Module-level cache, scoped to a single warm runtime instance. NOTE: the
// Node.js API route (api/admin/maintenance/route.ts, `runtime = 'nodejs'`)
// and this Edge middleware code are two ENTIRELY SEPARATE isolates/module
// instances — a Node.js function and an Edge Function never share memory,
// so a variable set on one side is invisible to the other. That means
// `setMaintenance()` below CANNOT "push" a fresh value into middleware's
// copy of `cached`; the only thing propagating the toggle to Edge is
// Redis itself, bounded by this TTL. Do not be misled into thinking a
// local cache write in the Node.js route helps the Edge side see the
// change sooner — it doesn't, they're different `cached` variables in
// different processes.
let cached: { value: boolean; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5_000;

function upstashConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

/** Minimal fetch()-based Upstash REST call — GET/SET/DEL only, no SDK. */
async function upstashCommand(path: string): Promise<unknown> {
  const cfg = upstashConfig();
  if (!cfg) throw new Error('Redis chưa được cấu hình (KV_REST_API_URL/KV_REST_API_TOKEN).');

  const res = await fetch(`${cfg.url}/${path}`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`[maintenance] Upstash REST call failed: ${res.status} ${res.statusText}`);
  }
  const body = await res.json() as { result: unknown };
  return body.result;
}

/**
 * Returns true if maintenance mode is currently ON. Fails OPEN (false) on
 * any Redis error/absence — a Redis hiccup must never accidentally lock
 * the whole site out; only an explicit admin toggle should ever do that.
 */
export async function isMaintenanceOn(): Promise<boolean> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (!upstashConfig()) return false;

  try {
    const val = await upstashCommand(`get/${MAINTENANCE_KEY}`);
    const on = val === '1' || val === 1;
    cached = { value: on, expiresAt: Date.now() + CACHE_TTL_MS };
    return on;
  } catch (e) {
    console.error('[maintenance] Redis read failed, failing open:', e);
    return false;
  }
}

/**
 * Admin toggle — used by PUT /api/admin/maintenance only (Node.js
 * runtime). Only writes Redis; does NOT (and can't) update middleware's
 * Edge-side cache — see the `cached` comment above. Propagation to
 * already-warm Edge instances takes up to CACHE_TTL_MS (5s), which the
 * admin UI's copy already tells the admin to expect.
 */
export async function setMaintenance(on: boolean): Promise<void> {
  if (!upstashConfig()) throw new Error('Redis chưa được cấu hình (KV_REST_API_URL/KV_REST_API_TOKEN).');

  if (on) await upstashCommand(`set/${MAINTENANCE_KEY}/1`);
  else await upstashCommand(`del/${MAINTENANCE_KEY}`);
}

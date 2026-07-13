import { Redis } from '@upstash/redis';

// ─────────────────────────────────────────────────────────────────────────
// Upstash Redis, provisioned via the Vercel Marketplace integration (NOT a
// standalone Upstash account). That integration injects KV_URL,
// KV_REST_API_URL, KV_REST_API_TOKEN, REDIS_URL, and
// KV_REST_API_READ_ONLY_TOKEN — deliberately different names from
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN, which is what
// `Redis.fromEnv()` looks for. So the client is built explicitly from
// KV_REST_API_URL / KV_REST_API_TOKEN below instead of using fromEnv().
//
// Currently the only consumer is the write-shard pointer described in
// db/index.ts: an external scheduler (cron-job.org — see README's
// Write-Shard Pointer section for the exact job config) hits
// `/api/internal/shard-check` every 5 minutes; that route is the ONE place
// that still calls pg_database_size() on each shard, and it writes the
// result here. `pickWriteShardIndex()` then does a single cheap GET
// instead of sweeping every shard's size on the request's critical path.
// If Redis is unset, slow, or errors, callers fall back to the old direct
// sweep — this module never throws, it returns null and lets the caller
// decide.
//
// Why an external scheduler instead of Vercel's own `crons` in
// vercel.json: this project runs on Vercel's Hobby plan, which hard-fails
// *deployment* for any cron expression firing more than once a day — a
// 5-minute native Vercel Cron is Pro-only. cron-job.org just calls the
// route as a normal authenticated HTTP request (same `Authorization:
// Bearer $CRON_SECRET` check either way), so it isn't subject to that
// limit and isn't tied to Vercel's own — in 2026 reportedly not perfectly
// punctual — cron scheduler either. If CRON_SECRET is compromised, the
// only thing it unlocks is triggering this one sweep-and-write-an-index
// route; no user data is reachable through it.
// ─────────────────────────────────────────────────────────────────────────

/** Key holding the index (as a string) of the shard new rows should land on. */
export const SHARD_WRITE_TARGET_KEY = 'shard:write-target';

// Must comfortably outlive the gap between two consecutive cron-job.org
// runs, or the key expires and requests fall back to the direct sweep
// until the next run — safe, just slower, and defeats the point of having
// Redis. At a 5-minute cadence, 15 minutes tolerates 2 consecutive missed
// runs (e.g. a transient cron-job.org or Vercel hiccup) before falling
// back, while still self-healing within 15 min if the scheduler stops
// firing entirely — expiry just means pickWriteShardIndex() falls back to
// the direct pg_database_size() sweep, not that writes break.
//
// ★ If you change the cron-job.org schedule to a different interval,
//   update this to match (roughly 2-3x the interval) — this constant and
//   the schedule configured in the cron-job.org dashboard are a pair that
//   have to be kept in sync manually; nothing enforces it in code.
export const SHARD_WRITE_TARGET_TTL_SECONDS = 15 * 60;

let client: Redis | null | undefined;

/**
 * Lazily builds a singleton Upstash Redis REST client. Returns null (not a
 * throw) when KV_REST_API_URL/KV_REST_API_TOKEN aren't set — e.g. local
 * dev without the integration attached — so every caller treats "no
 * Redis" as a normal, expected fallback path rather than an error.
 */
export function getRedis(): Redis | null {
  if (client !== undefined) return client;

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    console.warn('[redis] KV_REST_API_URL/KV_REST_API_TOKEN not set — Redis-backed features (shard pointer) disabled, falling back to direct checks.');
    client = null;
    return client;
  }

  client = new Redis({ url, token });
  return client;
}

/**
 * GET /api/internal/shard-check
 *
 * The ONLY place in the app that still calls `pg_database_size()` on every
 * shard. Triggered every 5 minutes by an external scheduler (cron-job.org
 * — see README's "Write-Shard Pointer" section for the exact job config),
 * NOT by Vercel's own `crons` in vercel.json: this project is on Vercel's
 * Hobby plan, which hard-fails *deployment* for any cron expression firing
 * more than once a day, so a native 5-minute Vercel Cron isn't available
 * without Pro. An external HTTP call authenticates and behaves identically
 * either way — see the CRON_SECRET check below.
 *
 * Writes the resulting write-target shard index to Redis
 * (`shard:write-target`) so `pickWriteShardIndex()` in db/index.ts can
 * just GET it instead of sweeping every shard on the request path. See
 * src/lib/redis.ts for the TTL this cadence is paired with.
 *
 * Protected with CRON_SECRET: cron-job.org is configured with a custom
 * `Authorization: Bearer $CRON_SECRET` header on the job (set this up
 * manually in the cron-job.org dashboard — nothing auto-injects it the way
 * Vercel's own cron would) so this can't be hit by randoms to spam
 * pg_database_size calls at the shards.
 *
 * FAILS CLOSED in production: if CRON_SECRET isn't set, the route refuses
 * every request rather than serving them unauthenticated. An earlier
 * version skipped the check entirely when the var was unset — matching a
 * pattern that's fine for Vercel's OWN cron (which Vercel authenticates
 * out-of-band regardless of CRON_SECRET) but wrong here, since cron-job.org
 * is an arbitrary external caller with no such guarantee. Forgetting to
 * set CRON_SECRET before going live would have left this endpoint openly
 * callable by anyone — who could then freely trigger the exact
 * pg_database_size() stampede this whole Redis-pointer design exists to
 * take off the request path. Same fail-closed idiom already used for
 * JWT_SECRET (jwt.ts) and TURNSTILE_SECRET_KEY (turnstile.ts): unset in
 * dev is a convenience, unset in prod is a hard error. Set CRON_SECRET in
 * Vercel's env vars before pointing cron-job.org at production.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getRedis, SHARD_WRITE_TARGET_KEY, SHARD_WRITE_TARGET_TTL_SECONDS } from '@/lib/redis';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[GET /api/internal/shard-check] CRON_SECRET not set in production — refusing request.');
      return NextResponse.json({ success: false, error: 'Server misconfigured' }, { status: 500 });
    }
    console.warn('[GET /api/internal/shard-check] CRON_SECRET not set — allowing unauthenticated request (dev only).');
  } else {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  const redis = getRedis();
  if (!redis) {
    console.error('[GET /api/internal/shard-check] Redis not configured (KV_REST_API_URL/KV_REST_API_TOKEN missing) — nothing to write to.');
    return NextResponse.json({ success: false, error: 'Redis not configured' }, { status: 500 });
  }

  try {
    const index = await db.sweepWriteShardIndexForCron();
    await redis.set(SHARD_WRITE_TARGET_KEY, index, { ex: SHARD_WRITE_TARGET_TTL_SECONDS });
    console.log(`[shard-check] wrote shard:write-target=${index} (ttl ${SHARD_WRITE_TARGET_TTL_SECONDS}s)`);
    return NextResponse.json({ success: true, writeTarget: index });
  } catch (e) {
    // Deliberately do NOT clear/overwrite the existing Redis key on
    // failure — an unreachable shard mid-sweep shouldn't blank out a
    // still-good pointer from the last successful run. It'll just expire
    // naturally via the TTL if failures keep happening, at which point
    // pickWriteShardIndex()'s direct-sweep fallback takes over anyway.
    console.error('[GET /api/internal/shard-check] sweep failed:', e);
    return NextResponse.json({ success: false, error: 'Shard sweep failed' }, { status: 500 });
  }
}

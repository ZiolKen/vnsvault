/**
 * GET /api/internal/reindex
 *
 * App-level "materialized view" for the homepage. Postgres can't give us a
 * real cross-shard MATERIALIZED VIEW here — SHARD_0/1/2 are independent
 * Supabase projects (possibly different orgs/hosts), so there's no single
 * connection or postgres_fdw/dblink link that could span all of them in
 * one SQL statement. Instead, this route does the fan-out + JOIN + sort
 * ONCE, then writes the finished { hotGames, featuredGames, newGames,
 * siteStats } bundle to Redis (HOMEPAGE_INDEX_KEY). Every real request
 * (getHomepageIndex() in queries.ts) then just does a single Redis GET
 * instead of re-running that fan-out/sort itself — same shape as the
 * write-shard pointer in db/index.ts, applied to the homepage's read path.
 *
 * Triggered externally by cron-job.org (same reasoning as
 * /api/internal/shard-check: Vercel Hobby's native `crons` hard-fails
 * deployment for anything firing more than once/day). Suggested schedule:
 * every 5 minutes, matching src/app/page.tsx's `revalidate = 300` — no
 * point refreshing the index faster than the ISR page that reads it would
 * ever pick up the change. Configure a SEPARATE cron-job.org job pointed
 * at this URL with the same `Authorization: Bearer $CRON_SECRET` header
 * as the shard-check job (reuses the same secret — this route is just as
 * safe to leave key-gated since it can only trigger a read+recompute, no
 * writes to Postgres).
 *
 * FAILS CLOSED in production if CRON_SECRET is unset — same idiom as
 * shard-check.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { getHotGames, getFeaturedGames, getNewGames, getSiteStats } from '@/lib/queries';
import type { HomepageIndex } from '@/lib/queries';
import { getRedis, HOMEPAGE_INDEX_KEY, HOMEPAGE_INDEX_TTL_SECONDS } from '@/lib/redis';
import { safeCompare } from '@/lib/safeCompare';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[GET /api/internal/reindex] CRON_SECRET not set in production — refusing request.');
      return NextResponse.json({ success: false, error: 'Server misconfigured' }, { status: 500 });
    }
    console.warn('[GET /api/internal/reindex] CRON_SECRET not set — allowing unauthenticated request (dev only).');
  } else {
    // safeCompare (constant-time), not a plain `!==` — same reasoning as
    // the SePay webhook's auth check.
    const authHeader = req.headers.get('authorization') ?? '';
    if (!safeCompare(authHeader, `Bearer ${secret}`)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  const redis = getRedis();
  if (!redis) {
    console.error('[GET /api/internal/reindex] Redis not configured (KV_REST_API_URL/KV_REST_API_TOKEN missing) — nothing to write to.');
    return NextResponse.json({ success: false, error: 'Redis not configured' }, { status: 500 });
  }

  try {
    // Same LIMIT-per-shard bounded queries the live fallback path in
    // queries.ts uses — this route is just the one place that actually
    // pays their (now-bounded) cost on a schedule instead of per-visitor.
    const [hotGames, featuredGames, newGames, siteStats] = await Promise.all([
      getHotGames(8),
      getFeaturedGames(4),
      getNewGames(8),
      getSiteStats(),
    ]);

    const index: HomepageIndex = {
      hotGames,
      featuredGames,
      newGames,
      siteStats,
      generatedAt: new Date().toISOString(),
    };

    await redis.set(HOMEPAGE_INDEX_KEY, index, { ex: HOMEPAGE_INDEX_TTL_SECONDS });
    console.log(`[reindex] wrote ${HOMEPAGE_INDEX_KEY} (hot=${hotGames.length} featured=${featuredGames.length} new=${newGames.length}, ttl ${HOMEPAGE_INDEX_TTL_SECONDS}s)`);
    return NextResponse.json({ success: true, generatedAt: index.generatedAt });
  } catch (e) {
    // Same "don't blank out a still-good key on failure" reasoning as
    // shard-check: leave the last successful index in place and let it
    // expire naturally via TTL if failures keep happening. getHomepageIndex()
    // falling back to a live (LIMIT-bounded) query is the safety net either way.
    console.error('[GET /api/internal/reindex] build failed:', e);
    return NextResponse.json({ success: false, error: 'Reindex failed' }, { status: 500 });
  }
}

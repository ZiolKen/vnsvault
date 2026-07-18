/**
 * GET /api/internal/keep-alive
 *
 * Supabase free-tier projects auto-pause after 7 consecutive days with no
 * database request. shard0 gets organic traffic (production data), but
 * shard1/shard2 are effectively empty right now — reserved headroom for
 * when shard0 crosses MAX_SHARD_BYTES — so they can go quiet long enough
 * to trip the pause on their own.
 *
 * Triggered every 3 days by cron-job.org (same external scheduler already
 * used for /api/internal/shard-check — see that route for why an external
 * scheduler instead of Vercel's own `crons`). Runs a trivial `SELECT 1`
 * against every shard via `db.pingAllShards()`. That's it — this route
 * does not read the shard-size or write-target logic at all, it only
 * needs *a* query to land on each shard to reset Supabase's 7-day
 * inactivity clock.
 *
 * Same fail-closed CRON_SECRET pattern as /api/internal/shard-check:
 * unset is a convenience in dev, a hard error in production.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[GET /api/internal/keep-alive] CRON_SECRET not set in production — refusing request.');
      return NextResponse.json({ success: false, error: 'Server misconfigured' }, { status: 500 });
    }
    console.warn('[GET /api/internal/keep-alive] CRON_SECRET not set — allowing unauthenticated request (dev only).');
  } else {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const results = await db.pingAllShards();
    const failed = results.filter(r => !r.ok);

    if (failed.length > 0) {
      // Deliberately still 200: a paused/unreachable shard here is a signal
      // to check the Supabase dashboard, not a reason to fail the cron job
      // itself (cron-job.org retry/alerting is configured on HTTP status —
      // see README — a hard failure here would page for something that
      // isn't actually an app outage).
      console.warn('[keep-alive] some shards unreachable:', failed);
    } else {
      console.log(`[keep-alive] pinged ${results.length} shard(s) OK`);
    }

    return NextResponse.json({ success: true, results });
  } catch (e) {
    console.error('[GET /api/internal/keep-alive] unexpected failure:', e);
    return NextResponse.json({ success: false, error: 'Keep-alive sweep failed' }, { status: 500 });
  }
}

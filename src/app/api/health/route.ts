/**
 * GET /api/health
 * Lightweight readiness probe — confirms the app can reach the database.
 * Point an uptime monitor (UptimeRobot, BetterStack, etc.) at this so a
 * bad deploy or dropped DB connection is caught automatically instead of
 * waiting for a user to report it.
 */
export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    await db.fanOut('SELECT 1', []);
    return NextResponse.json({ status: 'ok', db: 'connected', ts: Date.now() });
  } catch (e) {
    console.error('[GET /api/health]', e);
    return NextResponse.json({ status: 'degraded', db: 'unreachable' }, { status: 503 });
  }
}

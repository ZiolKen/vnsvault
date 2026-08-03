export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { getApiOriginMode } from '@/lib/apiOrigin';

/**
 * Public, unauthenticated — every visitor's browser (not just admins)
 * needs this to decide which origin `apiFetch` sends its OTHER `/api/...`
 * calls to, same reasoning as /api/announcement being public. Never
 * cached: an admin flipping the switch should reach every browser within
 * one poll, not after a stale cache expires.
 */
export async function GET() {
  try {
    const mode = await getApiOriginMode();
    return NextResponse.json(
      { success: true, data: { mode } },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (e) {
    console.error('[GET /api/api-origin]', e);
    // Fail soft: callers treat a failed/missing read as 'auto'.
    return NextResponse.json({ success: true, data: { mode: 'auto' } });
  }
}

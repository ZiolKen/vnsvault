export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { getAnnouncement } from '@/lib/announcement';

/**
 * Public, unauthenticated — the popup needs to fetch this for every
 * visitor, logged in or not. Always returns 200 with the current row
 * (including when `enabled` is false); the client decides whether to
 * show anything. Response is never cached — the announcement can be
 * toggled off from the Admin Dashboard at any moment and every visitor
 * should see that immediately, not after a stale cache expires.
 */
export async function GET() {
  try {
    const announcement = await getAnnouncement();
    return NextResponse.json(
      { success: true, data: announcement },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (e) {
    console.error('[GET /api/announcement]', e);
    // Fail soft: the popup just doesn't show rather than breaking the page.
    return NextResponse.json({ success: true, data: null });
  }
}

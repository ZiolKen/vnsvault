/**
 * POST /api/games/[slug]/download
 * Fire-and-forget download count increment.
 * Called client-side when a logged-in user clicks a download link.
 * Always returns 200 for an authenticated request — never block the
 * user's download.
 */
export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/jwt';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  // The UI already withholds the real download URL from anonymous
  // visitors (DownloadButton renders a "log in to download" link
  // instead), but this endpoint itself didn't enforce that — anyone could
  // POST here directly, with no auth and no rate limiting, to inflate
  // download_count (used to rank "Game Hot") in an unattended loop.
  // Requiring a session brings the API in line with what the UI already
  // implies, and is far cheaper than wiring Turnstile into every
  // download click. A Cloudflare rate-limit rule on this path is still
  // recommended as defense-in-depth against a compromised/shared account.
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  }

  const { slug } = await params;
  // Fire-and-forget: don't await, don't block. fanOut is safe — only the
  // shard holding this game's row is actually affected.
  db.fanOut(
    'UPDATE games SET download_count = download_count + 1 WHERE slug=$1 AND published=TRUE',
    [slug]
  ).catch((e) => console.error('[download-tracker]', e));

  return NextResponse.json({ success: true });
}

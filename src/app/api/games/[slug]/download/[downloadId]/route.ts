/**
 * GET /api/games/[slug]/download/[downloadId]
 *
 * The single place the real `game_downloads.url` is ever read for an
 * end-user download. The page/API never sends that URL to the browser —
 * DownloadButton links here by id instead, and this route resolves it
 * server-side then 302s the browser onward:
 *
 *   - VIP account (permanent or not-yet-expired)  → redirect straight to
 *     the real download URL. VIP's whole point is skipping the link
 *     shortener, so there is nothing to wrap.
 *   - Everyone else                                → wrap the real URL
 *     through bbmkts.com (see src/lib/linkShortener.ts) and redirect to
 *     the wrapped `https://bbmkts.com/go/...` link instead. If bbmkts
 *     errors or returns nothing, we show an error page rather than ever
 *     falling back to the real URL — "don't leak the origin link" holds
 *     even when the wrapper is down.
 *
 * Auth required (same "log in to download" gate as before, just enforced
 * here instead of by withholding the URL from the HTML).
 */
export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { db, RowNotFoundError } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/jwt';
import { getUserVipStatus } from '@/lib/vip';
import { wrapDownloadUrl } from '@/lib/linkShortener';
import { isValidUUID, isHttpUrl } from '@/lib/utils';

function errorPage(message: string, backHref: string, status: number): NextResponse {
  const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Không thể tải link | VNSVault</title>
<style>
  body{background:#0d0f14;color:#e8e6e3;font-family:system-ui,-apple-system,sans-serif;
       display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;}
  .card{max-width:420px;text-align:center;background:#171a21;border:1px solid #2a2e38;
        border-radius:16px;padding:32px 24px;}
  h1{font-size:18px;margin:0 0 12px;}
  p{color:#a8a6a3;font-size:14px;line-height:1.6;margin:0 0 20px;}
  a{display:inline-block;background:rgba(184,115,51,0.2);color:#e0a877;border:1px solid rgba(184,115,51,0.4);
     padding:10px 20px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;}
</style></head>
<body><div class="card"><h1>⚠️ ${message}</h1>
<p>Vui lòng thử lại sau ít phút. Nếu lỗi vẫn tiếp diễn, hãy báo lỗi link ở trang game.</p>
<a href="${backHref}">← Quay lại trang game</a>
</div></body></html>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; downloadId: string }> }
) {
  const { slug, downloadId } = await params;
  const backHref = `/games/${encodeURIComponent(slug)}`;

  if (!isValidUUID(downloadId)) {
    return errorPage('Liên kết không hợp lệ', backHref, 400);
  }

  const session = await getSessionFromRequest(req);
  if (!session) {
    const loginUrl = new URL(`/login`, req.url);
    loginUrl.searchParams.set('redirect', backHref);
    return NextResponse.redirect(loginUrl, { status: 302 });
  }

  try {
    // game_downloads rows always co-locate with their parent game's shard
    // (see schema.sql) — withRowTransaction pins us to the right one.
    const row = await db.withRowTransaction(
      'game_downloads', 'id', downloadId,
      async (client) => {
        const res = await client.query<{ url: string; game_id: string; slug: string; published: boolean }>(
          `SELECT gd.url, gd.game_id, g.slug, g.published
           FROM game_downloads gd
           JOIN games g ON g.id = gd.game_id
           WHERE gd.id = $1`,
          [downloadId]
        );
        return res.rows[0] ?? null;
      }
    );

    if (!row || row.slug !== slug || !row.published) {
      return errorPage('Không tìm thấy link tải', backHref, 404);
    }
    if (!isHttpUrl(row.url)) {
      return errorPage('Link tải chưa được cấu hình đúng', backHref, 502);
    }

    // Fire-and-forget: same counter the old client-side POST used to bump,
    // now driven from the one place that actually confirms a real
    // redirect is about to happen instead of an unauthenticated click.
    db.fanOut(
      'UPDATE games SET download_count = download_count + 1 WHERE id=$1 AND published=TRUE',
      [row.game_id]
    ).catch((e) => console.error('[download-resolver] count bump failed', e));

    const vip = await getUserVipStatus(session.userId);
    if (vip.isVip) {
      const res = NextResponse.redirect(row.url, { status: 302 });
      res.headers.set('Cache-Control', 'private, no-store');
      return res;
    }

    const wrapped = await wrapDownloadUrl(row.url);
    if (!wrapped) {
      return errorPage('Dịch vụ vượt link tạm thời không khả dụng', backHref, 502);
    }
    const res = NextResponse.redirect(wrapped, { status: 302 });
    res.headers.set('Cache-Control', 'private, no-store');
    return res;
  } catch (e) {
    if (e instanceof RowNotFoundError) {
      return errorPage('Không tìm thấy link tải', backHref, 404);
    }
    console.error('[GET /api/games/[slug]/download/[downloadId]]', e);
    return errorPage('Lỗi server', backHref, 500);
  }
}

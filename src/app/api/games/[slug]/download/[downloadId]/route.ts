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

/**
 * HTML-attribute-escape a string. `destination` is either a raw DB value
 * (game_downloads.url, VIP path) or a bbmkts response (wrapped path) —
 * `isHttpUrl`/`new URL()` only validate the scheme, they don't strip HTML
 * metacharacters from the original string, so this is the only thing
 * standing between a stray `"` in a download URL and a stored XSS that
 * runs in a logged-in user's session. Escape at the point of output,
 * always — never trust that upstream validation already did it.
 */
function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Safely embed a string as a JS string literal inside an inline <script>
 * block. JSON.stringify handles quote/backslash escaping for the JS
 * string context, but it does NOT stop a literal `</script` substring
 * from closing the tag early (the HTML parser scans for that sequence
 * regardless of JS string quoting) — so any `<` is additionally escaped
 * as \u003c after stringifying.
 */
function toScriptLiteral(s: string): string {
  return JSON.stringify(s).replace(/</g, '\\u003c');
}

/**
 * The "you're leaving VNSVault" interstitial shown while we hand the
 * browser off to the real host (Mega, bbmkts, etc). Auto-redirects after
 * a short delay via <meta refresh> + JS (works with JS disabled too); the
 * button/link is also a real <a href> to the destination so a manual
 * click always works immediately.
 *
 * The banner is a 4100x493 image slot meant to be filled in later — if
 * it 404s, the <img> just hides itself and the gradient panel behind it
 * shows instead, so nothing looks broken in the meantime.
 */
function interstitialPage(destination: string, backHref: string): NextResponse {
  const safeDest = escapeHtmlAttr(destination);
  const scriptDest = toScriptLiteral(destination);
  const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="refresh" content="2;url=${safeDest}" />
<title>Đang chuyển hướng... | VNSVault</title>
<style>
  :root{
    --obsidian:#09090f; --vault:#0f0f1a; --surface:#13131f; --border:#1e1e30;
    --copper:#b87333; --copper-light:#d4956a; --gold:#c9a84c;
    --ghost:#e0e0f0; --ghost-dim:#9090b0;
  }
  *{box-sizing:border-box;}
  body{background:var(--obsidian);color:var(--ghost);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
       margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;
       justify-content:center;padding:24px;}
  .wrap{width:100%;max-width:900px;}
  .banner{position:relative;max-width:55px;width:100%;aspect-ratio:4100/493;border-radius:14px;overflow:hidden;
          margin-bottom:28px;background:radial-gradient(ellipse at 50% 0%, rgba(184,115,51,0.18) 0%, var(--vault) 65%);
          border:1px solid var(--border);}
  .banner img{width:100%;height:100%;object-fit:cover;display:block;}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:16px;
        padding:40px 32px;text-align:center;}
  h1{font-family:Georgia,serif;font-weight:600;font-size:24px;margin:0 0 14px;color:var(--ghost);}
  p.sub{color:var(--ghost-dim);font-size:14px;line-height:1.7;margin:0 auto 26px;max-width:520px;}
  .go-btn{display:inline-flex;align-items:center;gap:10px;background:var(--vault);
          border:1px solid var(--border);border-radius:12px;padding:14px 28px;
          text-decoration:none;color:var(--ghost);font-size:15px;font-weight:600;
          transition:border-color .15s ease, background .15s ease;}
  .go-btn:hover{border-color:rgba(184,115,51,0.5);background:rgba(184,115,51,0.08);}
  .go-btn img{width:22px;height:22px;border-radius:5px;display:block;}
  .spinner{width:14px;height:14px;border-radius:50%;border:2px solid rgba(224,224,240,0.25);
           border-top-color:var(--copper-light);animation:spin .7s linear infinite;flex:none;}
  @keyframes spin{to{transform:rotate(360deg);}}
  .back{display:block;margin-top:22px;color:var(--ghost-dim);font-size:13px;
        text-decoration:none;transition:color .15s ease;}
  .back:hover{color:#ab4545;}
  .notice{max-width:700px;margin:32px auto 0;text-align:center;color:var(--dim,#3a3a55);
          font-size:12px;line-height:1.7;opacity:.7;}
</style></head>
<body>
<div class="wrap">
  <div class="banner">
    <img src="/banner.png" alt="" onerror="this.style.display='none'" />
  </div>
  <div class="card">
    <h1>Bạn đang rời khỏi VNSVault</h1>
    <p class="sub">Chúng tôi luôn cố gắng đảm bảo mọi liên kết đều an toàn, tuy nhiên bạn vẫn nên tự quét virus cho mọi tệp tải về.</p>
    <a class="go-btn" id="go" href="${safeDest}">
      <img src="/logo.png" alt="" />
      <span>Đang chuyển hướng...</span>
    </a>
    <a class="back" href="${backHref}">&lt; Quay lại VNSVault</a>
  </div>
  <p class="notice">Liên kết này đã được ẩn để ngăn bot tự động. Nhấn nút phía trên nếu bạn không được tự động chuyển hướng.</p>
</div>
<script>setTimeout(function(){ window.location.replace(${scriptDest}); }, 2000);</script>
</body></html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } });
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
      return interstitialPage(row.url, backHref);
    }

    const wrapped = await wrapDownloadUrl(row.url);
    if (!wrapped) {
      return errorPage('Dịch vụ vượt link tạm thời không khả dụng', backHref, 502);
    }
    return interstitialPage(wrapped, backHref);
  } catch (e) {
    if (e instanceof RowNotFoundError) {
      return errorPage('Không tìm thấy link tải', backHref, 404);
    }
    console.error('[GET /api/games/[slug]/download/[downloadId]]', e);
    return errorPage('Lỗi server', backHref, 500);
  }
}

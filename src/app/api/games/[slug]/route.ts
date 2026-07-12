export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // The game could be on any shard — fan out and merge.
    const games = await db.fanOut(
      `SELECT g.*, t.name AS translator_name, t.slug AS translator_slug,
              t.bio AS translator_bio, t.discord_url AS translator_discord,
              t.avatar_url AS translator_avatar
       FROM games g
       LEFT JOIN translators t ON t.id = g.translator_id
       WHERE g.slug = $1 AND g.published = TRUE`,
      [slug]
    );

    if (!games[0]) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy game' }, { status: 404 });
    }

    const game = games[0];
    const [genres, downloadRows] = await Promise.all([
      db.fanOut(
        `SELECT gn.id, gn.name, gn.slug FROM game_genres gg
         JOIN genres gn ON gn.id = gg.genre_id WHERE gg.game_id = $1`,
        [game.id]
      ),
      db.fanOut<{ id: string; version: string; platform: string; url: string; created_at: string }>(
        `SELECT id, version, platform, url, created_at FROM game_downloads
         WHERE game_id = $1 ORDER BY created_at DESC`,
        [game.id]
      ),
    ]);

    // SECURITY: the real download `url` is never sent to any client,
    // logged in or not — DownloadButton links by `id` to
    // /api/games/[slug]/download/[id], which resolves + redirects
    // server-side (wrapping through the link-shortener unless the viewer
    // is VIP). Anyone curling this endpoint directly, authenticated or
    // not, gets the same redacted shape.
    const downloads = downloadRows.map(d => ({ ...d, url: '' }));

    // NOTE: view_count is intentionally NOT incremented here. The SSR page
    // (src/lib/queries.ts::getGameBySlug) is the single source of truth for
    // that counter. This route exists for client-side/external fetches of
    // the same game data — incrementing here too would double-count a view
    // any time something on the client (e.g. a future SWR/React Query
    // refetch) calls this endpoint after the page has already rendered.

    const res = NextResponse.json({ success: true, data: { ...game, genres, downloads } });
    // The response no longer differs by session (url is redacted either
    // way), so it's always safe to share at the CDN edge.
    res.headers.set('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    return res;
  } catch (e) {
    console.error('[GET /api/games/[slug]]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

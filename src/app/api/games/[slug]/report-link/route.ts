export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { db, RowNotFoundError } from '@/lib/db';
import { verifyTurnstile } from '@/lib/turnstile';
import { isValidUUID } from '@/lib/utils';

const REASON_MAX_LEN = 500;

/**
 * POST /api/games/[slug]/report-link
 *
 * Replaces the old "Báo cáo tại đây" link that just pointed at /requests
 * (the page for requesting NEW games — completely unrelated to reporting a
 * broken download for an EXISTING game, so it never actually reported
 * anything). This stores a real report against the game, optionally tied
 * to the specific download link the person clicked.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await req.json().catch(() => ({})) as {
      downloadId?: string; reason?: string; tsToken?: string;
    };

    if (body.downloadId !== undefined && !isValidUUID(body.downloadId)) {
      return NextResponse.json({ success: false, error: 'downloadId không hợp lệ' }, { status: 400 });
    }
    const reason = body.reason?.trim().slice(0, REASON_MAX_LEN) || null;

    const ip   = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? undefined;
    const tsOk = await verifyTurnstile(body.tsToken, ip);
    if (!tsOk) {
      return NextResponse.json({ success: false, error: 'Xác minh bảo mật thất bại. Vui lòng thử lại.' }, { status: 403 });
    }

    // Locate which shard holds this game (by slug, not id — the page only
    // has the slug), then write the report there so link_reports.game_id
    // and .download_id stay co-located with their parents, as documented
    // in schema.sql.
    await db.withRowTransaction('games', 'slug', slug, async (client) => {
      const gameRes = await client.query<{ id: string }>('SELECT id FROM games WHERE slug=$1', [slug]);
      const gameId = gameRes.rows[0]?.id;
      if (!gameId) {
        throw new RowNotFoundError('games', 'slug', slug);
      }

      // If a specific download was flagged, confirm it actually belongs to
      // THIS game (co-located on this same shard) before linking it —
      // otherwise silently drop the reference rather than reject the whole
      // report, since the general report is still useful without it.
      let downloadId: string | null = null;
      if (body.downloadId) {
        const dlRes = await client.query<{ id: string }>(
          'SELECT id FROM game_downloads WHERE id=$1 AND game_id=$2',
          [body.downloadId, gameId]
        );
        downloadId = dlRes.rows[0]?.id ?? null;
      }

      await client.query(
        'INSERT INTO link_reports (game_id, download_id, reason) VALUES ($1,$2,$3)',
        [gameId, downloadId, reason]
      );
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof RowNotFoundError) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy game' }, { status: 404 });
    }
    console.error('[POST /api/games/[slug]/report-link]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

/**
 * POST /api/games/[slug]/bookmark — toggle bookmark for the current user.
 * GET  /api/games/[slug]/bookmark — is the current user bookmarking this game?
 *
 * Every bookmark row is written to whichever shard holds the `games` parent
 * row (located via withRowTransaction on slug) — never the user's shard,
 * which may differ. See schema.sql `bookmarks` for the cross-shard FK note.
 */
export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { db, RowNotFoundError } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/jwt';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Vui lòng đăng nhập để lưu game yêu thích' }, { status: 401 });
    }

    const { slug } = await params;

    const bookmarked = await db.withRowTransaction('games', 'slug', slug, async (client) => {
      const gameRes = await client.query<{ id: string }>(
        'SELECT id FROM games WHERE slug=$1 AND published=TRUE FOR UPDATE',
        [slug]
      );
      const gameId = gameRes.rows[0]?.id;
      if (!gameId) throw new RowNotFoundError('games', 'slug', slug);

      const existing = await client.query(
        'SELECT 1 FROM bookmarks WHERE user_id=$1 AND game_id=$2',
        [session.userId, gameId]
      );

      if (existing.rows.length > 0) {
        await client.query('DELETE FROM bookmarks WHERE user_id=$1 AND game_id=$2', [session.userId, gameId]);
        return false;
      } else {
        await client.query('INSERT INTO bookmarks (user_id, game_id) VALUES ($1,$2)', [session.userId, gameId]);
        return true;
      }
    });

    return NextResponse.json({ success: true, data: { bookmarked } });
  } catch (e) {
    if (e instanceof RowNotFoundError) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy game' }, { status: 404 });
    }
    console.error('[POST /api/games/[slug]/bookmark]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ success: true, data: { bookmarked: false } });
    }

    const { slug } = await params;
    const rows = await db.fanOut<{ x: number }>(
      `SELECT 1 AS x FROM bookmarks b
       JOIN games g ON g.id = b.game_id
       WHERE g.slug=$1 AND b.user_id=$2`,
      [slug, session.userId]
    );

    return NextResponse.json({ success: true, data: { bookmarked: rows.length > 0 } });
  } catch (e) {
    console.error('[GET /api/games/[slug]/bookmark]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

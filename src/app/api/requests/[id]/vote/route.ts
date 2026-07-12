export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { db, RowNotFoundError } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/jwt';
import { verifyTurnstile } from '@/lib/turnstile';
import { isValidUUID } from '@/lib/utils';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });

    const body = await req.json().catch(() => ({})) as { tsToken?: string };
    const ip   = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? undefined;
    const tsOk = await verifyTurnstile(body.tsToken, ip);
    if (!tsOk) {
      return NextResponse.json({ success: false, error: 'Xác minh bảo mật thất bại.' }, { status: 403 });
    }

    const { id } = await params;
    if (!isValidUUID(id)) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy request' }, { status: 404 });
    }

    // request_votes has no FK to users (the voting user may live on a
    // different shard than this request — see schema.sql) — every vote row
    // is written to whichever shard holds the game_requests parent, located
    // here and used for every statement in the transaction (check + toggle
    // + count update), preventing race conditions and vote_count desync.
    const voted = await db.withRowTransaction('game_requests', 'id', id, async (client) => {
      // Re-confirm under a row lock (withRowTransaction's probe ran before
      // BEGIN, so lock it again now that we're inside the transaction).
      await client.query('SELECT id FROM game_requests WHERE id=$1 FOR UPDATE', [id]);

      const existing = await client.query(
        'SELECT 1 FROM request_votes WHERE request_id=$1 AND user_id=$2',
        [id, session.userId]
      );

      if (existing.rows.length > 0) {
        // Toggle off
        await client.query(
          'DELETE FROM request_votes WHERE request_id=$1 AND user_id=$2',
          [id, session.userId]
        );
        await client.query(
          'UPDATE game_requests SET vote_count = GREATEST(0, vote_count - 1) WHERE id=$1',
          [id]
        );
        return false;
      } else {
        await client.query(
          'INSERT INTO request_votes (request_id, user_id) VALUES ($1,$2)',
          [id, session.userId]
        );
        await client.query(
          'UPDATE game_requests SET vote_count = vote_count + 1 WHERE id=$1',
          [id]
        );
        return true;
      }
    });

    return NextResponse.json({ success: true, data: { voted } });
  } catch (e: unknown) {
    if (e instanceof RowNotFoundError) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy request' }, { status: 404 });
    }
    console.error('[POST /api/requests/[id]/vote]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

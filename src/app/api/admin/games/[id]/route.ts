export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { db, RowNotFoundError } from '@/lib/db';
import { requireFreshAdmin } from '@/lib/adminGuard';
import { resolveTranslatorId } from '@/lib/translators';
import { isHttpUrl, isValidUUID } from '@/lib/utils';

async function guard(req: NextRequest) {
  return requireFreshAdmin(req);
}

function nullify(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await guard(req)) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ success: false, error: 'ID không hợp lệ' }, { status: 400 });
  }

  const rows = await db.fanOut('SELECT * FROM games WHERE id=$1', [id]);
  if (!rows[0]) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  const [genres, downloads] = await Promise.all([
    db.fanOut(
      'SELECT gn.id, gn.name, gn.slug FROM game_genres gg JOIN genres gn ON gn.id=gg.genre_id WHERE gg.game_id=$1',
      [id]
    ),
    db.fanOut('SELECT * FROM game_downloads WHERE game_id=$1 ORDER BY created_at DESC', [id]),
  ]);

  return NextResponse.json({ success: true, data: { ...rows[0], genres, downloads } });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await guard(req)) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ success: false, error: 'ID không hợp lệ' }, { status: 400 });
  }

  const body = await req.json() as {
    title?: string; description?: string; cover_url?: string; banner_url?: string;
    developer?: string; engine?: string; status?: string; age_rating?: string;
    translator_id?: string; translator_note?: string; is_featured?: boolean;
    published?: boolean; genres?: number[];
    downloads?: { version: string; platform: string; url: string; label?: string }[];
  };

  // SECURITY: see POST /api/admin/games — same javascript:/data: URI risk
  // applies on edit, not just on create.
  for (const [field, val] of [['cover_url', body.cover_url], ['banner_url', body.banner_url]] as const) {
    if (val?.trim() && !isHttpUrl(val.trim())) {
      return NextResponse.json({ success: false, error: `${field} không hợp lệ (chỉ chấp nhận http/https)` }, { status: 400 });
    }
  }
  for (const dl of body.downloads ?? []) {
    if (dl.url?.trim() && !isHttpUrl(dl.url.trim())) {
      return NextResponse.json({ success: false, error: `Link tải không hợp lệ: ${dl.url}` }, { status: 400 });
    }
  }

  try {
    await db.withRowTransaction('games', 'id', id, async (client) => {
      const translatorId = await resolveTranslatorId(nullify(body.translator_id), client);

      await client.query(
        `UPDATE games SET
          title            = COALESCE($1, title),
          description      = COALESCE($2, description),
          cover_url        = $3,
          banner_url       = $4,
          developer        = $5,
          engine           = $6,
          status           = COALESCE($7, status),
          age_rating       = COALESCE($8, age_rating),
          translator_id    = $9,
          translator_note  = $10,
          is_featured      = COALESCE($11, is_featured),
          published        = COALESCE($12, published),
          updated_at       = NOW()
         WHERE id = $13`,
        [
          nullify(body.title),
          nullify(body.description),
          nullify(body.cover_url),
          nullify(body.banner_url),
          nullify(body.developer),
          nullify(body.engine),
          body.status ?? null,
          body.age_rating ?? null,
          translatorId,
          nullify(body.translator_note),
          body.is_featured ?? null,
          body.published ?? null,
          id,
        ]
      );

      if (body.genres !== undefined) {
        await client.query('DELETE FROM game_genres WHERE game_id=$1', [id]);
        if (body.genres.length) {
          // Insert via subquery so the FK is satisfied by construction —
          // only genre IDs that actually exist on this shard are inserted.
          // Prevents a 23503 FK violation when a shard's genres table was
          // seeded from an older schema.sql (see schema.sql for details).
          await client.query(
            `INSERT INTO game_genres (game_id, genre_id)
               SELECT $1, id FROM genres WHERE id = ANY($2::int[])
             ON CONFLICT DO NOTHING`,
            [id, body.genres]
          );
        }
      }

      if (body.downloads !== undefined) {
        await client.query('DELETE FROM game_downloads WHERE game_id=$1', [id]);
        for (const dl of body.downloads.filter(d => d.url?.trim())) {
          await client.query(
            'INSERT INTO game_downloads (game_id, version, platform, url, label) VALUES ($1,$2,$3,$4,$5)',
            [id, dl.version, dl.platform, dl.url.trim(), nullify(dl.label)]
          );
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof RowNotFoundError) {
      return NextResponse.json({ success: false, error: 'Game không tồn tại' }, { status: 404 });
    }
    console.error('[PUT /api/admin/games/[id]]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await guard(req)) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ success: false, error: 'ID không hợp lệ' }, { status: 400 });
  }
  // fanOut DELETE — chỉ shard chứa row mới bị ảnh hưởng, các shard khác no-op
  await db.fanOut('DELETE FROM games WHERE id=$1', [id]);
  return NextResponse.json({ success: true });
}

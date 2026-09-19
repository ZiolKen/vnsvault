export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireFreshAdmin } from '@/lib/adminGuard';
import { slugify, isHttpUrl } from '@/lib/utils';
import { resolveTranslatorId } from '@/lib/translators';
import type { Game } from '@/types';

async function requireAdmin(req: NextRequest) {
  return requireFreshAdmin(req);
}

/** Convert empty string / whitespace to null — prevents UUID parse errors */
function nullify(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ success: false, error: 'Không có quyền truy cập' }, { status: 403 });
  }
  const games = await db.fanOut<Game>(
    `SELECT g.*, t.name AS translator_name FROM games g
     LEFT JOIN translators t ON t.id = g.translator_id`
  );
  games.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return NextResponse.json({ success: true, data: games });
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ success: false, error: 'Không có quyền truy cập' }, { status: 403 });
  }
  try {
    const body = await req.json() as {
      title: string; description: string; cover_url?: string; banner_url?: string;
      developer?: string; engine?: string; status?: string; age_rating?: string;
      translator_id?: string; translator_note?: string; is_featured?: boolean;
      published?: boolean; genres?: number[];
      downloads?: { version: string; platform: string; url: string; label?: string }[];
    };

    if (!body.title?.trim()) {
      return NextResponse.json({ success: false, error: 'Tên game không được để trống' }, { status: 400 });
    }
    if (!body.description?.trim()) {
      return NextResponse.json({ success: false, error: 'Mô tả không được để trống' }, { status: 400 });
    }

    // SECURITY: these values end up as `<a href>` / image `src` for every
    // visitor — without a protocol whitelist, a `javascript:`/`data:` URI
    // stored here would execute in the browser of anyone who clicks the
    // download link or loads the cover/banner (stored XSS).
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

    const slug = slugify(body.title);
    if (!slug) {
      return NextResponse.json({ success: false, error: 'Tên game không hợp lệ' }, { status: 400 });
    }

    const existing = await db.fanOut('SELECT id FROM games WHERE slug=$1', [slug]);
    let finalSlug = existing.length > 0 ? `${slug}-${Date.now()}` : slug;

    // The fan-out check above is a TOCTOU race, same class as the
    // register-route one (see that file): two admins creating a
    // same-titled game at nearly the same moment could both pass it and
    // then both attempt to INSERT the identical `finalSlug`. Trusted actor
    // + narrow window make this low-severity, but it's a one-line fix —
    // retry once on the shard's own UNIQUE(slug) violation (23505) with a
    // fresh, guaranteed-distinct suffix, rather than surfacing a raw 500.
    const MAX_SLUG_ATTEMPTS = 2;
    let gameId: string | null = null;
    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS && gameId === null; attempt++) {
      try {
        gameId = await db.withNewRowTransaction(async (client) => {
          // nullify() trước khi truyền vào resolveTranslatorId
          const translatorId = await resolveTranslatorId(nullify(body.translator_id), client);

          const rows = await client.query<{ id: string }>(
            `INSERT INTO games
              (title, slug, description, cover_url, banner_url, developer, engine, status, age_rating,
               translator_id, translator_note, is_featured, published)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             RETURNING id`,
            [
              body.title.trim(),
              finalSlug,
              body.description.trim(),
              nullify(body.cover_url),
              nullify(body.banner_url),
              nullify(body.developer),
              nullify(body.engine),        // engine = '' → null (enum check passes)
              body.status ?? 'in_progress',
              body.age_rating ?? 'all',
              translatorId,                // already null-safe from resolveTranslatorId
              nullify(body.translator_note),
              body.is_featured ?? false,
              body.published ?? false,
            ]
          );
          const id = rows.rows[0].id;

          if (body.genres?.length) {
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

          if (body.downloads?.length) {
            for (const dl of body.downloads.filter(d => d.url?.trim())) {
              await client.query(
                'INSERT INTO game_downloads (game_id, version, platform, url, label) VALUES ($1,$2,$3,$4,$5)',
                [id, dl.version, dl.platform, dl.url.trim(), nullify(dl.label)]
              );
            }
          }

          return id;
        });
      } catch (e: unknown) {
        const isSlugConflict = (e as { code?: string })?.code === '23505';
        if (isSlugConflict && attempt < MAX_SLUG_ATTEMPTS) {
          finalSlug = `${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          continue;
        }
        throw e;
      }
    }

    return NextResponse.json({ success: true, data: { id: gameId, slug: finalSlug } }, { status: 201 });
  } catch (e) {
    console.error('[POST /api/admin/games]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

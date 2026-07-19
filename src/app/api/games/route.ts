export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { Game } from '@/types';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(24, Math.max(1, parseInt(searchParams.get('pageSize') ?? '12', 10)));

    const status   = searchParams.get('status');
    const engine   = searchParams.get('engine');
    const genre    = searchParams.get('genre');
    // Comma-separated genre slugs used as free-text "tag" search from the
    // library filter sidebar — kept separate from `genre` (singular, used
    // by the "click a genre chip on a game page" links) for backward
    // compatibility. A game must match EVERY selected tag (AND), which is
    // the usual expectation for tag filtering (narrows results as you add
    // more tags rather than broadening them).
    const tagsParam = searchParams.get('tags');
    const tags = tagsParam ? tagsParam.split(',').map(t => t.trim()).filter(Boolean) : [];
    const search   = searchParams.get('q');
    const featured = searchParams.get('featured');
    const sortBy   = searchParams.get('sort') ?? 'updated_at';

    const conditions: string[] = ['g.published = TRUE'];
    const values: unknown[] = [];
    let idx = 1;

    if (status)   { conditions.push(`g.status = $${idx++}`); values.push(status); }
    if (engine)   { conditions.push(`g.engine = $${idx++}`); values.push(engine); }
    if (featured === 'true') { conditions.push('g.is_featured = TRUE'); }
    if (search)   {
      conditions.push(`(g.title ILIKE $${idx} OR g.developer ILIKE $${idx} OR g.description ILIKE $${idx})`);
      values.push(`%${search}%`); idx++;
    }
    if (genre) {
      conditions.push(
        `EXISTS (SELECT 1 FROM game_genres gg JOIN genres gn ON gn.id=gg.genre_id WHERE gg.game_id=g.id AND gn.slug=$${idx++})`
      );
      values.push(genre);
    }
    for (const tag of tags) {
      conditions.push(
        `EXISTS (SELECT 1 FROM game_genres gg JOIN genres gn ON gn.id=gg.genre_id WHERE gg.game_id=g.id AND gn.slug=$${idx++})`
      );
      values.push(tag);
    }

    const where    = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const ORDER_ALLOW = ['updated_at', 'download_count', 'view_count', 'created_at'];
    const orderCol = ORDER_ALLOW.includes(sortBy) ? sortBy : 'updated_at';

    // Games are spread across every shard with no replication between
    // them, so LIMIT/OFFSET can't be pushed down per-shard (each shard only
    // knows its own slice of the table — applying OFFSET there would skip
    // rows that actually belong on a LATER page once everything is merged).
    // Instead: fan out for every matching row from every shard, merge, then
    // sort + paginate in application code over the complete, correct set.
    //
    // `g.id ASC` tiebreaker matters here: page N and page N+1 are two
    // separate HTTP requests, each running its own fanOut across shards.
    // Without a deterministic tiebreaker, any row that TIES with another on
    // orderCol (same updated_at down to the millisecond, same
    // download_count, etc.) has no guaranteed relative order between the
    // two requests — which shard's Promise.all() settled first can vary
    // request to request. A tied row could land in the tail of page N's
    // slice on one request and the head of page N+1's slice on the next,
    // which is exactly what produced the "game duplicated across page
    // boundaries" bug (never within a single page/request, only across
    // two of them, matching how this was reported).
    const allMatches = await db.fanOut<Game>(
      `SELECT g.*, t.name AS translator_name, t.slug AS translator_slug
       FROM games g
       LEFT JOIN translators t ON t.id = g.translator_id
       ${where}
       ORDER BY g.${orderCol} DESC, g.id ASC`,
      values
    );

    allMatches.sort((a, b) => {
      const av = a[orderCol as keyof Game];
      const bv = b[orderCol as keyof Game];
      let cmp: number;
      if (orderCol === 'created_at' || orderCol === 'updated_at') {
        cmp = new Date(bv as string).getTime() - new Date(av as string).getTime();
      } else {
        cmp = Number(bv) - Number(av);
      }
      if (cmp !== 0) return cmp;
      // Same tiebreaker as the SQL ORDER BY above, re-applied here because
      // this JS sort is what actually determines final order (the SQL
      // ORDER BY only orders each shard's own rows before they're merged).
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    const total = allMatches.length;
    const offset = (page - 1) * pageSize;
    const items = allMatches.slice(offset, offset + pageSize);

    // Attach genres
    if (items.length > 0) {
      const ids = items.map(i => i.id);
      const genres = await db.fanOut<{ game_id: string; genre_id: number; name: string; slug: string }>(
        `SELECT gg.game_id, gn.id AS genre_id, gn.name, gn.slug
         FROM game_genres gg JOIN genres gn ON gn.id = gg.genre_id
         WHERE gg.game_id = ANY($1)`,
        [ids]
      );
      const genreMap = new Map<string, { id: number; name: string; slug: string }[]>();
      for (const g of genres) {
        if (!genreMap.has(g.game_id)) genreMap.set(g.game_id, []);
        genreMap.get(g.game_id)!.push({ id: g.genre_id, name: g.name, slug: g.slug });
      }
      items.forEach(g => { (g as Game).genres = genreMap.get(g.id) ?? []; });
    }

    const res = NextResponse.json({
      success: true,
      data: { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
    // Cache for 5 min, revalidate in background
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res;
  } catch (e) {
    console.error('[GET /api/games]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

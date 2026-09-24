export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { cached, SHORT_CACHE_TTL_SECONDS } from '@/lib/redis';
import { escapeLike } from '@/lib/utils';
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
    // Each tag becomes its own EXISTS(...) subquery below, run across every
    // shard — an unbounded tag count from the query string (e.g.
    // `tags=a,a,a,...` repeated thousands of times) would let anyone build
    // an arbitrarily expensive query with no auth required, capped only by
    // the generic per-IP rate limit. MAX_TAGS bounds the query's own
    // complexity regardless of how many tags a request tries to pass.
    // Sorted so `tags=a,b` and `tags=b,a` — same filter, different URL —
    // land on the same Redis cache key below instead of two separate ones.
    const MAX_TAGS = 10;
    const tags = tagsParam
      ? Array.from(new Set(tagsParam.split(',').map(t => t.trim()).filter(Boolean))).slice(0, MAX_TAGS).sort()
      : [];
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
      values.push(`%${escapeLike(search)}%`); idx++;
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
    const offset = (page - 1) * pageSize;

    // Cache key: every param that changes the result set or its order,
    // normalized (tags already sorted above) so equivalent requests share
    // one entry. Deliberately excludes nothing session-specific — this
    // route has no per-user data, so the whole response is safe to share
    // across visitors.
    const cacheKey = `games:list:${JSON.stringify({ page, pageSize, status, engine, genre, tags, search, featured, sortBy: orderCol })}`;

    const payload = await cached(cacheKey, SHORT_CACHE_TTL_SECONDS, async () => {
      // Games are spread across every shard with no replication between
      // them, so a global LIMIT/OFFSET can't be pushed down as-is — each
      // shard only knows its own slice of the table, and OFFSET on a
      // single shard would skip rows that actually belong on a LATER page
      // once everything is merged.
      //
      // What CAN be pushed down: a LIMIT of `offset + pageSize` per shard.
      // To correctly produce the top N of a UNION of sorted lists, you
      // never need more than the top N from each individual list — so
      // fetching (offset + pageSize) rows, already ORDER BY'd, from every
      // shard is provably enough to merge-and-slice down to any page up to
      // this one. This bounds the per-request JS sort to (shard count) ×
      // (offset + pageSize) rows instead of every matching row in the
      // whole catalog, which is what was driving Active CPU up on this
      // route as the catalog grew — deep pagination still costs more (a
      // large `offset` means a large per-shard LIMIT), but the common case
      // of browsing the first few pages stays cheap regardless of catalog
      // size.
      //
      // `g.id ASC` tiebreaker matters here: page N and page N+1 are two
      // separate HTTP requests, each running its own fan-out across
      // shards. Without a deterministic tiebreaker, any row that TIES with
      // another on orderCol (same updated_at down to the millisecond, same
      // download_count, etc.) has no guaranteed relative order between the
      // two requests — which shard's Promise.all() settled first can vary
      // request to request. A tied row could land in the tail of page N's
      // slice on one request and the head of page N+1's slice on the next,
      // which is exactly what produced the "game duplicated across page
      // boundaries" bug (never within a single page/request, only across
      // two of them, matching how this was reported).
      const perShardLimit = offset + pageSize;
      const limitIdx = idx;

      // Only the columns GameCard/list views actually render — `description`
      // and `translator_note` are the two large text columns nothing in the
      // list UI reads (only the game detail page does), so pulling them for
      // every row of every page just to throw them away was pure wasted
      // serialization/CPU on the hottest browse path.
      const [perShardRows, countRows] = await Promise.all([
        db.fanOut<Game>(
          `SELECT g.id, g.slug, g.title, g.cover_url, g.developer, g.engine, g.status,
                  g.age_rating, g.is_featured, g.published, g.view_count, g.download_count,
                  g.translator_id, g.created_at, g.updated_at,
                  t.name AS translator_name, t.slug AS translator_slug
           FROM games g
           LEFT JOIN translators t ON t.id = g.translator_id
           ${where}
           ORDER BY g.${orderCol} DESC, g.id ASC
           LIMIT $${limitIdx}`,
          [...values, perShardLimit]
        ),
        // Separate, cheap aggregate — avoids pulling every matching row
        // just to learn how many there are. No JOIN needed: the WHERE
        // conditions only ever reference g.* and EXISTS subqueries, never
        // translator columns, so the row count is identical with or
        // without the join.
        db.fanOut<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM games g ${where}`,
          values
        ),
      ]);

      perShardRows.sort((a, b) => {
        const av = a[orderCol as keyof Game];
        const bv = b[orderCol as keyof Game];
        let cmp: number;
        if (orderCol === 'created_at' || orderCol === 'updated_at') {
          cmp = new Date(bv as string).getTime() - new Date(av as string).getTime();
        } else {
          cmp = Number(bv) - Number(av);
        }
        if (cmp !== 0) return cmp;
        // Same tiebreaker as the SQL ORDER BY above, re-applied here
        // because this JS sort is what actually determines final order
        // (the SQL ORDER BY only orders each shard's own rows before
        // they're merged).
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });

      const total = countRows.reduce((sum, r) => sum + Number(r.count), 0);
      const items = perShardRows.slice(offset, offset + pageSize);

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

      return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    });

    const res = NextResponse.json({ success: true, data: payload });
    // CDN cache on top of the Redis cache below — this covers anonymous
    // edge hits; Redis covers everything that reaches the function itself
    // (cache-busting query strings, logged-in requests, crawlers).
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res;
  } catch (e) {
    console.error('[GET /api/games]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

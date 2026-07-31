/**
 * Server-side query helpers that call the DB directly.
 *
 * ❌ NEVER use fetch('/api/...') inside server components or generateMetadata.
 *    On Vercel, a function cannot make HTTP requests back to itself during
 *    server-side rendering — the call either hangs, times out, or returns an
 *    empty cached response.  Even when it "works" locally, Next.js caches the
 *    empty result via { next: { revalidate } } and serves it for minutes.
 *
 * ✅ Import from this file instead — the DB is called in the same process,
 *    no network hop, no cache issues, always fresh.
 */

import { db } from '@/lib/db';
import { cached, getRedis, SHORT_CACHE_TTL_SECONDS, HOMEPAGE_INDEX_KEY } from '@/lib/redis';
import type { Game } from '@/types';

// ─── Types ──────────────────────────────────────────────────────────────────

interface GameRow extends Record<string, unknown> {
  id: string;
  slug: string;
  title: string;
  published: boolean;
  is_featured: boolean;
  download_count: number;
  view_count: number;
  updated_at: string;
  created_at: string;
  translator_name?: string;
  translator_slug?: string;
}

interface GenreRow {
  game_id: string;
  genre_id: number;
  name: string;
  slug: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Attach genres to a list of game rows (in-place mutation, returns same array). */
async function attachGenres<T extends { id: string; genres?: unknown }>(games: T[]): Promise<T[]> {
  if (games.length === 0) return games;
  const ids = games.map(g => g.id);
  const genres = await db.fanOut<GenreRow>(
    `SELECT gg.game_id, gn.id AS genre_id, gn.name, gn.slug
     FROM game_genres gg JOIN genres gn ON gn.id = gg.genre_id
     WHERE gg.game_id = ANY($1)`,
    [ids]
  );
  const map = new Map<string, { id: number; name: string; slug: string }[]>();
  for (const g of genres) {
    if (!map.has(g.game_id)) map.set(g.game_id, []);
    map.get(g.game_id)!.push({ id: g.genre_id, name: g.name, slug: g.slug });
  }
  for (const game of games) {
    game.genres = map.get(game.id) ?? [];
  }
  return games;
}

// ─── Public query functions ──────────────────────────────────────────────────

/**
 * Site-wide totals for the landing page stat strip ("Game đã dịch",
 * "Tổng lượt tải"). Deliberately NOT derived from getHotGames()/
 * getFeaturedGames() — those are capped at 8/4 items for display, so
 * `hotGames.length + featuredGames.length` silently maxes out at 12 (and
 * double-counts anything that's both hot and featured) instead of
 * reflecting the real catalog size. COUNT/SUM here run across the whole
 * `games` table on every shard, then get summed in app code — same
 * cross-shard aggregation pattern as the admin dashboard's getStats().
 */
export async function getSiteStats(): Promise<{ totalGames: number; totalDownloads: number }> {
  const [totalGames, totalDownloads] = await Promise.all([
    db.aggregate('SELECT COUNT(*) AS count FROM games WHERE published=TRUE', undefined, 'count'),
    db.aggregate('SELECT COALESCE(SUM(download_count),0) AS sum FROM games WHERE published=TRUE', undefined, 'sum'),
  ]);
  return { totalGames, totalDownloads };
}

export interface HomepageIndex {
  hotGames: Game[];
  featuredGames: Game[];
  newGames: Game[];
  siteStats: { totalGames: number; totalDownloads: number };
  generatedAt: string;
}

/**
 * Read-mostly entry point for the homepage. Tries the pre-computed bundle
 * written by `/api/internal/reindex` first (one Redis GET — no fan-out, no
 * JOIN, no JS sort at all on the request path); only falls back to the
 * live 4-query path below if the index hasn't been built yet or Redis is
 * unavailable/stale. Because getHotGames/getNewGames/getFeaturedGames now
 * push LIMIT down per shard (see their comments), even this fallback no
 * longer sorts the whole catalog — it's just slower than the Redis hit,
 * never "wrong" or unbounded.
 */
export async function getHomepageIndex(): Promise<HomepageIndex> {
  const redis = getRedis();
  if (redis) {
    try {
      const hit = await redis.get<HomepageIndex>(HOMEPAGE_INDEX_KEY);
      if (hit) return hit;
    } catch (e) {
      console.error(`[getHomepageIndex] Redis GET ${HOMEPAGE_INDEX_KEY} failed, falling back to live query:`, e);
    }
  }

  const [hotGames, featuredGames, newGames, siteStats] = await Promise.all([
    getHotGames(8),
    getFeaturedGames(4),
    getNewGames(8),
    getSiteStats(),
  ]);
  return { hotGames, featuredGames, newGames, siteStats, generatedAt: new Date().toISOString() };
}

/**
 * Get the most-downloaded published games.
 * Used by the landing page "Game Hot" section.
 */
export async function getHotGames(limit = 8): Promise<Game[]> {
  // LIMIT pushed down per shard (not just capped at the end): to correctly
  // produce the global top-N of a merge of per-shard sorted lists, the top
  // N from EACH shard is provably enough — a shard could in the worst case
  // hold all N of the final result. Previously this pulled every published
  // row (full row + JOIN) from every shard with no LIMIT at all and sorted
  // the WHOLE catalog in JS on every call; this bounds both the bytes
  // pulled and the JS sort to (shard count) × limit regardless of how many
  // games are published — same technique as /api/games's pagination.
  // Explicit column list instead of `g.*`: the card only ever renders
  // id/slug/title/cover_url/status/engine/age_rating/view_count/
  // download_count, so there's no reason to pull `description`,
  // `banner_url`, `translator_note` (all TEXT, can be large) across every
  // shard for a list that never reads them. Translator JOIN dropped
  // entirely too — GameCard never renders translator info, so the join
  // was pure per-shard cost with no payoff.
  const rows = await db.fanOut<GameRow>(
    `SELECT g.id, g.slug, g.title, g.cover_url, g.status, g.engine, g.age_rating,
            g.view_count, g.download_count
     FROM games g
     WHERE g.published = TRUE
     ORDER BY g.download_count DESC, g.id ASC
     LIMIT $1`,
    [limit]
  );
  // fanOut merges all shards — sort+slice in app to get globally top-N
  rows.sort((a, b) => Number(b.download_count) - Number(a.download_count));
  const top = rows.slice(0, limit) as unknown as Game[];
  return attachGenres(top);
}

/**
 * Get the most recently added published games.
 * Used by the landing page "Mới Thêm" section.
 */
export async function getNewGames(limit = 8): Promise<Game[]> {
  // Same per-shard LIMIT pushdown as getHotGames — see comment there.
  // Explicit column list — see getHotGames' comment for why: same
  // trimmed set, plus `created_at` since it's the sort key here.
  const rows = await db.fanOut<GameRow>(
    `SELECT g.id, g.slug, g.title, g.cover_url, g.status, g.engine, g.age_rating,
            g.view_count, g.download_count, g.created_at
     FROM games g
     WHERE g.published = TRUE
     ORDER BY g.created_at DESC, g.id ASC
     LIMIT $1`,
    [limit]
  );
  rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const top = rows.slice(0, limit) as unknown as Game[];
  return attachGenres(top);
}

/**
 * Get featured published games.
 * Used by the landing page "Được Chọn Lọc" section.
 */
export async function getFeaturedGames(limit = 4): Promise<Game[]> {
  // Same per-shard LIMIT pushdown as getHotGames — see comment there.
  // Explicit column list — see getHotGames' comment for why: same
  // trimmed set, plus `updated_at` since it's the sort key here.
  const rows = await db.fanOut<GameRow>(
    `SELECT g.id, g.slug, g.title, g.cover_url, g.status, g.engine, g.age_rating,
            g.view_count, g.download_count, g.updated_at
     FROM games g
     WHERE g.published = TRUE AND g.is_featured = TRUE
     ORDER BY g.updated_at DESC, g.id ASC
     LIMIT $1`,
    [limit]
  );
  rows.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  const top = rows.slice(0, limit) as unknown as Game[];
  return attachGenres(top);
}

/**
 * Get a single published game by slug, with genres and downloads attached.
 * Used by the game detail page and generateMetadata — the single
 * highest-traffic query in the app (every real visit to a game page, no
 * ISR/cache on this route since view_count must bump per view).
 *
 * ★ Pinned to a single shard, no probe, no explicit transaction ★
 * This used to fan out FOUR separate queries to EVERY shard — the main
 * row, then genres/downloads/bookmark-count concurrently via Promise.all,
 * then a fire-and-forget view-count UPDATE. On a 3-shard setup that's up
 * to 9 simultaneous connections just from one page view, repeated for
 * every visitor — a major contributor to hitting Aiven's 20-connection
 * ceiling under any real concurrent traffic.
 *
 * Genres, downloads, and bookmarks for a game always live on the SAME
 * shard as the game row (they're written together via
 * withNewRowTransaction/withRowTransaction — see db/index.ts), so once we
 * know which shard holds the game, there's no reason to ask the others.
 * `db.withRow()` fans the real game+translator SELECT out to every shard
 * in parallel — that single round trip both finds the owning shard AND
 * fetches the row, instead of a separate cheap `SELECT 1` probe followed
 * by a second full SELECT — then runs genres, downloads, bookmark count,
 * and the view-count bump over that ONE held connection, with no
 * BEGIN/COMMIT wrapper (this is read-mostly; the view-count bump already
 * swallows its own errors, so there's nothing here that needs rollback
 * semantics). Net effect versus the old fan-out-everything approach:
 * connection usage for a game-page view drops from O(shards) to O(1) for
 * the expensive part, and versus the previous single-shard version, two
 * fewer sequential round trips (no probe, no BEGIN/COMMIT).
 */
/**
 * Pure read, cached for SHORT_CACHE_TTL_SECONDS: game row + translator +
 * genres + downloads + bookmark count, all of which are identical for
 * every visitor. Deliberately does NOT touch view_count — see
 * `bumpGameViewCount` below for why that has to stay outside the cache.
 */
export async function getGameBySlug(slug: string): Promise<Game | null> {
  return cached(`game:slug:${slug}`, SHORT_CACHE_TTL_SECONDS, () =>
    db.withRow<GameRow, Game>(
      // Only translator_name/translator_slug are actually rendered on the
      // detail page (title line + sidebar "Dịch giả" row) — bio/discord/
      // avatar dropped along with the "Thương hiệu Việt hóa" sidebar card
      // that used to display them.
      `SELECT g.*, t.name AS translator_name, t.slug AS translator_slug
       FROM games g
       LEFT JOIN translators t ON t.id = g.translator_id
       WHERE g.slug = $1 AND g.published = TRUE
       LIMIT 1`,
      [slug],
      async (client, gameRow) => {
        const game = gameRow as unknown as Game;

        // The JOIN above returns flat `translator_name` / `translator_slug`
        // columns, but the consumer (games/[slug]/page.tsx) reads a nested
        // `game.translator.{name,slug}` object. Without this, `game.translator`
        // is always undefined even when `translator_id` is set — the
        // translator name never renders, only the raw id sits unused on the row.
        const row = gameRow as unknown as Record<string, unknown>;
        if (game.translator_id && row.translator_name) {
          game.translator = {
            id: game.translator_id,
            name: row.translator_name as string,
            slug: row.translator_slug as string,
          };
        }

        const [genresRes, downloadsRes, bookmarkRes] = await Promise.all([
          client.query<{ id: number; name: string; slug: string }>(
            `SELECT gn.id, gn.name, gn.slug
             FROM game_genres gg JOIN genres gn ON gn.id = gg.genre_id
             WHERE gg.game_id = $1`,
            [game.id]
          ),
          client.query(
            `SELECT id, version, platform, url, label, created_at
             FROM game_downloads WHERE game_id = $1 ORDER BY created_at DESC`,
            [game.id]
          ),
          client.query<{ count: string }>('SELECT COUNT(*) AS count FROM bookmarks WHERE game_id=$1', [game.id]),
        ]);

        return {
          ...game,
          genres: genresRes.rows,
          downloads: downloadsRes.rows,
          bookmark_count: Number(bookmarkRes.rows[0]?.count ?? 0),
        } as unknown as Game;
      }
    )
  );
}

/**
 * View-count bump — deliberately kept OUTSIDE getGameBySlug's cache. If it
 * lived inside the cached read, every visitor sharing a cache hit within
 * the TTL window would silently stop incrementing the counter (only the
 * one request that actually missed the cache and hit the DB would count),
 * undercounting real views by roughly the cache hit rate.
 *
 * Called once per real page view instead, on every request regardless of
 * cache state. We no longer have the single already-open shard connection
 * `getGameBySlug` used to reuse for this (that connection only exists on a
 * cache miss now) — fanOut is the documented pattern in db/index.ts for
 * "UPDATE/DELETE by id: only the shard holding that row is affected, the
 * rest are harmless no-ops", so this hits every shard but only the one
 * actually holding `gameId` does real work. fanOut already logs and
 * excludes failing shards rather than throwing, so a counter hiccup here
 * can't fail the page — no extra try/catch needed.
 */
export async function bumpGameViewCount(gameId: string): Promise<void> {
  await db.fanOut('UPDATE games SET view_count = view_count + 1 WHERE id = $1', [gameId]);
}

/** Is `userId` currently bookmarking this game? Viewer-specific — never cached. */
export async function isBookmarkedByUser(gameId: string, userId: string): Promise<boolean> {
  const rows = await db.fanOut<{ x: number }>(
    'SELECT 1 AS x FROM bookmarks WHERE game_id=$1 AND user_id=$2',
    [gameId, userId]
  );
  return rows.length > 0;
}

export interface BookmarkedGameRow {
  game_id: string;
  bookmarked_at: string;
  id: string;
  slug: string;
  title: string;
  cover_url?: string;
  status: string;
  download_count: number;
}

/** All games a user has bookmarked, newest first. Used by /myaccount. */
export async function getUserBookmarks(userId: string): Promise<BookmarkedGameRow[]> {
  const rows = await db.fanOut<BookmarkedGameRow>(
    `SELECT b.game_id, b.created_at AS bookmarked_at,
            g.id, g.slug, g.title, g.cover_url, g.status, g.download_count
     FROM bookmarks b
     JOIN games g ON g.id = b.game_id
     WHERE b.user_id = $1`,
    [userId]
  );
  rows.sort((a, b) => new Date(b.bookmarked_at).getTime() - new Date(a.bookmarked_at).getTime());
  return rows;
}

/**
 * Sitemap helper — returns slug + updated_at for all published games.
 */
export async function getAllPublishedSlugs(): Promise<{ slug: string; updated_at: string }[]> {
  return db.fanOut<{ slug: string; updated_at: string }>(
    `SELECT slug, updated_at FROM games WHERE published = TRUE ORDER BY updated_at DESC`
  );
}

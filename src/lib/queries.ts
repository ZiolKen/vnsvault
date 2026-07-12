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

import { db, RowNotFoundError } from '@/lib/db';
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

/**
 * Get the most-downloaded published games.
 * Used by the landing page "Game Hot" section.
 */
export async function getHotGames(limit = 8): Promise<Game[]> {
  const rows = await db.fanOut<GameRow>(
    `SELECT g.*, t.name AS translator_name, t.slug AS translator_slug
     FROM games g
     LEFT JOIN translators t ON t.id = g.translator_id
     WHERE g.published = TRUE
     ORDER BY g.download_count DESC`
  );
  // fanOut merges all shards — sort+slice in app to get globally top-N
  rows.sort((a, b) => Number(b.download_count) - Number(a.download_count));
  const top = rows.slice(0, limit) as unknown as Game[];
  return attachGenres(top);
}

/**
 * Get featured published games.
 * Used by the landing page "Được Chọn Lọc" section.
 */
export async function getFeaturedGames(limit = 4): Promise<Game[]> {
  const rows = await db.fanOut<GameRow>(
    `SELECT g.*, t.name AS translator_name, t.slug AS translator_slug
     FROM games g
     LEFT JOIN translators t ON t.id = g.translator_id
     WHERE g.published = TRUE AND g.is_featured = TRUE
     ORDER BY g.updated_at DESC`
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
 * ★ Pinned to a single shard ★
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
 * withRowTransaction() probes every shard ONCE with a cheap indexed
 * `SELECT 1` to find the right one, then runs everything else — genres,
 * downloads, bookmark count, and the view-count bump — over that ONE held
 * connection. Net effect: connection usage for a game-page view drops from
 * O(shards) to O(1) for the expensive part.
 */
export async function getGameBySlug(slug: string): Promise<Game | null> {
  try {
    return await db.withRowTransaction<Game | null>('games', 'slug', slug, async (client) => {
      const gameRes = await client.query<GameRow>(
        `SELECT g.*, t.name AS translator_name, t.slug AS translator_slug,
                t.bio AS translator_bio, t.discord_url AS translator_discord,
                t.avatar_url AS translator_avatar
         FROM games g
         LEFT JOIN translators t ON t.id = g.translator_id
         WHERE g.slug = $1 AND g.published = TRUE
         LIMIT 1`,
        [slug]
      );
      const gameRow = gameRes.rows[0];
      // withRowTransaction's probe only checks slug existence, not
      // `published` — an unpublished draft with a matching slug still
      // routes here, it just has no row once the published filter above is
      // applied. Same "not found" result as before, just discovered one
      // level deeper (inside the pinned connection instead of before it).
      if (!gameRow) return null;
      const game = gameRow as unknown as Game;

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

      // View-count bump — now a cheap `await` on the same already-open
      // connection rather than a separate fire-and-forget fanOut across
      // every shard. Swallow errors so a counter hiccup never fails the
      // page; if this one statement fails Postgres aborts the transaction,
      // which just turns the COMMIT below into a no-op ROLLBACK — the
      // genres/downloads/bookmarkCount we already captured above are plain
      // JS values by that point, so the response is unaffected either way.
      await client.query('UPDATE games SET view_count = view_count + 1 WHERE id = $1', [game.id]).catch(() => {});

      return {
        ...game,
        genres: genresRes.rows,
        downloads: downloadsRes.rows,
        bookmark_count: Number(bookmarkRes.rows[0]?.count ?? 0),
      } as unknown as Game;
    });
  } catch (e) {
    if (e instanceof RowNotFoundError) return null;
    throw e;
  }
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

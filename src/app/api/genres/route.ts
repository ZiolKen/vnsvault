export const runtime = 'nodejs';
// Revalidate every hour — genres almost never change.
export const revalidate = 3600;

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

interface GenreRow { id: number; name: string; slug: string; }

/**
 * GET /api/genres
 * Returns every genre row ordered by id, sourced from the real DB.
 * GameForm uses this so its tag-button IDs always match what the DB has
 * (avoids the mismatch that arose when a shard was seeded with SERIAL
 * auto-increment before explicit IDs were pinned in schema.sql).
 */
export async function GET() {
  try {
    const rows = await db.fanOut<GenreRow>(
      'SELECT id, name, slug FROM genres ORDER BY id ASC'
    );

    // fanOut may return duplicates if multiple shards hold the genres table
    // (every shard has genres seeded). Deduplicating by id alone isn't
    // enough: a shard that was seeded with SERIAL auto-increment *before*
    // explicit IDs were pinned in schema.sql may hold the same genre
    // (same name/slug) under a different id — the id-only Set would let
    // both rows through, showing the same tag twice in GameForm. `slug` is
    // UNIQUE NOT NULL and is the one thing guaranteed to match across
    // shards for "the same genre", so dedupe on that instead, keeping the
    // lowest id (the pinned/canonical one) per slug.
    const bySlug = new Map<string, GenreRow>();
    for (const r of rows) {
      const existing = bySlug.get(r.slug);
      if (!existing || r.id < existing.id) bySlug.set(r.slug, r);
    }
    const genres = Array.from(bySlug.values()).sort((a, b) => a.id - b.id);

    return NextResponse.json({ success: true, data: genres });
  } catch (e) {
    console.error('[GET /api/genres]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

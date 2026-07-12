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
    // (every shard has genres seeded); deduplicate by id, keep first seen.
    const seen = new Set<number>();
    const genres: GenreRow[] = [];
    for (const r of rows) {
      if (!seen.has(r.id)) { seen.add(r.id); genres.push(r); }
    }
    genres.sort((a, b) => a.id - b.id);

    return NextResponse.json({ success: true, data: genres });
  } catch (e) {
    console.error('[GET /api/genres]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

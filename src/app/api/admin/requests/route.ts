export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireFreshAdmin } from '@/lib/adminGuard';

async function requireAdmin(req: NextRequest) {
  return requireFreshAdmin(req);
}

interface RequestRow {
  id: string; title: string; source_url: string | null; engine: string | null;
  description: string | null; submitted_by: string | null; status: string;
  vote_count: number; created_at: string;
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ success: false, error: 'Không có quyền truy cập' }, { status: 403 });
  }
  try {
    // Requests can live on any shard — fan out and merge, then sort in app
    // code since ORDER BY only sorts within each shard's own result set.
    const items = await db.fanOut<RequestRow>(
      `SELECT id, title, source_url, engine, description, submitted_by, status, vote_count, created_at
       FROM game_requests`
    );
    items.sort((a, b) =>
      b.vote_count - a.vote_count ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return NextResponse.json({ success: true, data: items });
  } catch (e) {
    console.error('[GET /api/admin/requests]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

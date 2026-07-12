export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireFreshAdmin } from '@/lib/adminGuard';
import type { LinkReport } from '@/types';

async function requireAdmin(req: NextRequest) {
  return requireFreshAdmin(req);
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) {
    return NextResponse.json({ success: false, error: 'Không có quyền truy cập' }, { status: 403 });
  }
  try {
    // link_reports always lives on the SAME shard as the game it reports
    // (written via withRowTransaction('games', 'slug', ...) — see
    // report-link/route.ts), so a plain per-shard JOIN to games/
    // game_downloads is safe: both sides are guaranteed co-located. Fan
    // out across shards and merge, then sort in app code.
    const items = await db.fanOut<LinkReport>(
      `SELECT
         lr.id, lr.game_id, lr.download_id, lr.reason, lr.status, lr.created_at,
         g.title AS game_title, g.slug AS game_slug,
         gd.version AS download_version, gd.platform AS download_platform, gd.url AS download_url
       FROM link_reports lr
       JOIN games g ON g.id = lr.game_id
       LEFT JOIN game_downloads gd ON gd.id = lr.download_id`
    );
    items.sort((a, b) => {
      // Open reports first, then newest first within each group.
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return NextResponse.json({ success: true, data: items });
  } catch (e) {
    console.error('[GET /api/admin/reports]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSessionFromRequest } from '@/lib/jwt';
import { verifyTurnstile } from '@/lib/turnstile';
import { cached, SHORT_CACHE_TTL_SECONDS } from '@/lib/redis';

interface RequestRow {
  id: string; title: string; source_url: string | null; engine: string | null;
  description: string | null; submitted_by: string | null; status: string;
  vote_count: number; created_at: string;
}

// Unlike /api/games this list has no pagination — the requests board is
// meant to be small enough to browse in full. This still caps how many
// rows we'll ever pull per shard so an unbounded, ever-growing table can't
// turn a public, unauthenticated, uncached fan-out into a standing DB-load
// vector (this table has no LIMIT/cache at all before this change).
const MAX_REQUESTS = 500;

export async function GET() {
  try {
    // Public, no per-user data — safe to share one cached response across
    // every visitor, same pattern as /api/games. Requests can live on any
    // shard, so the fan-out + sort + slice still happens on every cache
    // miss; the cache just keeps that off the hot path most of the time.
    const payload = await cached('requests:list', SHORT_CACHE_TTL_SECONDS, async () => {
      const items = await db.fanOut<RequestRow>(
        `SELECT id, title, source_url, engine, description, submitted_by, status, vote_count, created_at
         FROM game_requests
         ORDER BY vote_count DESC, created_at ASC
         LIMIT ${MAX_REQUESTS}`
      );
      items.sort((a, b) =>
        b.vote_count - a.vote_count ||
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      return items.slice(0, MAX_REQUESTS);
    });

    return NextResponse.json({ success: true, data: payload });
  } catch (e) {
    console.error('[GET /api/requests]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    const { title, source_url, engine, description, submitted_by, tsToken } = await req.json() as {
      title: string; source_url?: string; engine?: string;
      description?: string; submitted_by?: string; tsToken?: string;
    };

    if (!title?.trim()) {
      return NextResponse.json({ success: false, error: 'Thiếu tên game' }, { status: 400 });
    }
    if (title.trim().length > 200) {
      return NextResponse.json({ success: false, error: 'Tên game tối đa 200 ký tự' }, { status: 400 });
    }
    if (source_url) {
      try {
        const u = new URL(source_url);
        if (!['http:', 'https:'].includes(u.protocol)) throw new Error('bad protocol');
      } catch {
        return NextResponse.json({ success: false, error: 'URL nguồn không hợp lệ' }, { status: 400 });
      }
    }
    if (description && description.length > 2000) {
      return NextResponse.json({ success: false, error: 'Mô tả tối đa 2000 ký tự' }, { status: 400 });
    }

    const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? undefined;
    const tsOk = await verifyTurnstile(tsToken, ip);
    if (!tsOk) {
      return NextResponse.json({ success: false, error: 'Xác minh bảo mật thất bại. Vui lòng thử lại.' }, { status: 403 });
    }

    // If logged in, always use the session's own username — never trust a
    // client-supplied submitted_by, or any authenticated user could pass
    // { submitted_by: "someone-else" } and impersonate them in the public
    // requests list. Anonymous submitters may still self-report a display
    // name, capped and trimmed.
    const displayName = session?.username ?? submitted_by?.trim()?.slice(0, 100) ?? null;

    // Brand-new request row — lands on the current fill-target shard.
    const rows = await db.write(
      `INSERT INTO game_requests (title, source_url, engine, description, submitted_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [title, source_url, engine, description, displayName]
    );

    return NextResponse.json({ success: true, data: rows[0] }, { status: 201 });
  } catch (e) {
    console.error('[POST /api/requests]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

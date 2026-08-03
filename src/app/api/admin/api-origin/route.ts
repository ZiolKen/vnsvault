export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { requireFreshAdmin } from '@/lib/adminGuard';
import { getApiOriginMode, setApiOriginMode, type ApiOriginMode } from '@/lib/apiOrigin';

const VALID_MODES: ApiOriginMode[] = ['auto', 'primary', 'fallback'];

export async function GET(req: NextRequest) {
  if (!await requireFreshAdmin(req)) {
    return NextResponse.json({ success: false, error: 'Không có quyền truy cập' }, { status: 403 });
  }
  try {
    const mode = await getApiOriginMode();
    return NextResponse.json({ success: true, data: { mode } });
  } catch (e) {
    console.error('[GET /api/admin/api-origin]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!await requireFreshAdmin(req)) {
    return NextResponse.json({ success: false, error: 'Không có quyền truy cập' }, { status: 403 });
  }
  try {
    const { mode } = await req.json() as { mode?: unknown };
    if (typeof mode !== 'string' || !VALID_MODES.includes(mode as ApiOriginMode)) {
      return NextResponse.json({ success: false, error: 'Thiếu hoặc sai tham số mode' }, { status: 400 });
    }
    await setApiOriginMode(mode as ApiOriginMode);
    return NextResponse.json({ success: true, data: { mode } });
  } catch (e) {
    console.error('[PUT /api/admin/api-origin]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

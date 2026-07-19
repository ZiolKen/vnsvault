export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { requireFreshAdmin } from '@/lib/adminGuard';
import { isMaintenanceOn, setMaintenance } from '@/lib/maintenance';

export async function GET(req: NextRequest) {
  if (!await requireFreshAdmin(req)) {
    return NextResponse.json({ success: false, error: 'Không có quyền truy cập' }, { status: 403 });
  }
  try {
    const enabled = await isMaintenanceOn();
    return NextResponse.json({ success: true, data: { enabled } });
  } catch (e) {
    console.error('[GET /api/admin/maintenance]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!await requireFreshAdmin(req)) {
    return NextResponse.json({ success: false, error: 'Không có quyền truy cập' }, { status: 403 });
  }
  try {
    const { enabled } = await req.json() as { enabled?: unknown };
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ success: false, error: 'Thiếu tham số enabled' }, { status: 400 });
    }
    await setMaintenance(enabled);
    return NextResponse.json({ success: true, data: { enabled } });
  } catch (e) {
    console.error('[PUT /api/admin/maintenance]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

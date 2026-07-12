/**
 * GET /api/account/bookmarks — list all bookmarked games for the current user.
 */
export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/jwt';
import { getUserBookmarks } from '@/lib/queries';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
    }
    const data = await getUserBookmarks(session.userId);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('[GET /api/account/bookmarks]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

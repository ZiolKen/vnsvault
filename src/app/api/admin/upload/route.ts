/**
 * POST /api/admin/upload
 * multipart/form-data: { file: File, folder: 'games' | 'avatars' }
 *
 * Admin-only (requireFreshAdmin). Used by GameForm's cover/banner upload
 * tab and by the admin avatar upload tab in /myaccount — both just need
 * "give me a public URL for this image file", then store that URL in the
 * exact same `cover_url` / `banner_url` / `avatar_url` columns the
 * URL-paste flow already writes to. No schema changes needed: this route
 * only produces a URL, it doesn't touch games/users tables itself.
 */
export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { requireFreshAdmin } from '@/lib/adminGuard';
import { uploadImage, ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, StorageNotConfiguredError, StorageUploadError } from '@/lib/storage';

const ALLOWED_FOLDERS = new Set(['games', 'avatars']);

export async function POST(req: NextRequest) {
  if (!await requireFreshAdmin(req)) {
    return NextResponse.json({ success: false, error: 'Không có quyền truy cập' }, { status: 403 });
  }

  try {
    const form = await req.formData();
    const file = form.get('file');
    const folder = form.get('folder');

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Thiếu file ảnh' }, { status: 400 });
    }
    if (typeof folder !== 'string' || !ALLOWED_FOLDERS.has(folder)) {
      return NextResponse.json({ success: false, error: 'folder không hợp lệ' }, { status: 400 });
    }
    if (!ALLOWED_UPLOAD_TYPES[file.type]) {
      return NextResponse.json(
        { success: false, error: 'Chỉ chấp nhận ảnh JPEG, PNG, WebP hoặc GIF.' },
        { status: 400 }
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { success: false, error: `Ảnh vượt quá giới hạn ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadImage(buffer, file.type, folder as 'games' | 'avatars');

    return NextResponse.json({ success: true, data: { url } });
  } catch (e) {
    if (e instanceof StorageNotConfiguredError) {
      return NextResponse.json({ success: false, error: e.message }, { status: 503 });
    }
    if (e instanceof StorageUploadError) {
      return NextResponse.json({ success: false, error: e.message }, { status: 400 });
    }
    console.error('[POST /api/admin/upload]', e);
    return NextResponse.json({ success: false, error: 'Lỗi server' }, { status: 500 });
  }
}

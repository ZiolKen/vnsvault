/**
 * Supabase Storage — used ONLY for admin-uploaded images (game
 * cover/banner, admin avatar). This is a completely separate concern from
 * `db/index.ts`'s ShardedDb: Storage is a REST/S3-style API, not reachable
 * over the Postgres wire protocol, so it needs its own client + its own
 * credentials (a project URL + a service-role API key — NOT a
 * SHARD_N connection string).
 *
 * Deliberately points at ONE Supabase project (SHARD_0's project), not all
 * 3. Sharding exists to work around each shard's own 500MB *database*
 * storage cap — Storage is a completely different 1GB quota that isn't
 * shared with or drained by the DB shards, and an uploaded image's URL
 * needs to be stable regardless of which shard the game row itself landed
 * on. Splitting Storage across projects too would only add complexity
 * (which project does this image belong to?) for a quota that isn't
 * actually under pressure yet at VNSVault's current image volume.
 *
 * Uses the SERVICE ROLE key (bypasses Row Level Security) because uploads
 * only ever happen from a trusted server context (the /api/admin/upload
 * route, already gated by requireFreshAdmin()) — never expose this key to
 * the browser.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'vnsvault-uploads';

export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/jpeg': 'jpeg',
};

// 4MB, not 5MB — Vercel Serverless/Edge Functions have a HARD, non-configurable
// 4.5MB request body cap. This route runs multipart/form-data (file +
// boundary + field overhead on top of the raw file bytes), so a file right
// at 4.5MB would already be rejected by Vercel itself with a raw platform
// 413 before this code ever runs — bypassing our clean Vietnamese error
// message entirely. Staying at 4MB leaves comfortable headroom for
// multipart overhead while still covering any real cover/banner/avatar.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * Magic-byte (file signature) checks — verifies the file's ACTUAL bytes
 * match one of the allowed image formats, rather than trusting the
 * client-supplied `file.type` (a browser `Content-Type` header on the
 * multipart part, entirely attacker-controlled). Without this, anything
 * could be uploaded and stored with an `image/*` label as long as the
 * request just claims to be one — this closes that gap. Admin-only
 * endpoint, so impact was limited, but Zero-Trust means not trusting the
 * client's word for it even when the client is already-authenticated.
 */
const MAGIC_BYTES: Record<string, (buf: Buffer) => boolean> = {
  'image/jpeg': buf => buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF,
  'image/png':  buf => buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47
    && buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A,
  'image/gif':  buf => buf.length >= 6 && (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a'),
  // WebP: RIFF????WEBP — bytes 0-3 "RIFF", bytes 8-11 "WEBP" (4-7 is a
  // little-endian file-size field, not a fixed signature).
  'image/webp': buf => buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 4 + 8) === 'WEBP',
};

function matchesDeclaredType(buffer: Buffer, contentType: string): boolean {
  const check = MAGIC_BYTES[contentType];
  return check ? check(buffer) : false;
}

let client: SupabaseClient | null | undefined;

function getStorageClient(): SupabaseClient | null {
  if (client !== undefined) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn('[storage] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set — uploads disabled.');
    client = null;
    return client;
  }

  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export class StorageNotConfiguredError extends Error {
  constructor() { super('Chức năng upload chưa được cấu hình trên server.'); }
}

export class StorageUploadError extends Error {}

/**
 * Uploads a single image and returns its public URL.
 *
 * `folder` groups uploads for housekeeping (e.g. 'games', 'avatars') —
 * purely cosmetic path structure, doesn't affect access control (the
 * bucket itself is public-read, see README's Storage setup section for
 * the bucket policy to create).
 */
export async function uploadImage(
  buffer: Buffer,
  contentType: string,
  folder: 'games' | 'avatars'
): Promise<string> {
  const ext = ALLOWED_UPLOAD_TYPES[contentType];
  if (!ext) throw new StorageUploadError(`Định dạng ảnh không được hỗ trợ: ${contentType}`);
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new StorageUploadError(`Ảnh vượt quá giới hạn ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`);
  }
  if (!matchesDeclaredType(buffer, contentType)) {
    throw new StorageUploadError('Nội dung file không khớp định dạng ảnh đã khai báo.');
  }

  const supabase = getStorageClient();
  if (!supabase) throw new StorageNotConfiguredError();

  const path = `${folder}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    cacheControl: '31536000', // 1 year — filename is a random UUID, never reused/overwritten
    upsert: false,
  });
  if (error) {
    console.error('[storage] upload failed:', error);
    throw new StorageUploadError('Upload thất bại, vui lòng thử lại.');
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

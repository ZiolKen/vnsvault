'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { Game, Genre } from '@/types';
import FormField from '@/components/ui/FormField';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { canOptimizeImage } from '@/lib/utils';
import { apiFetch } from '@/lib/apiClient';

interface DownloadEntry { version: string; platform: string; url: string; label: string; }

interface Props {
  initial?: Partial<Game & { genres: Genre[]; downloads: DownloadEntry[] }>;
  gameId?: string;
}

const PLATFORMS = ['windows','android','macos','ios','linux','webhtml5'];
const PLATFORM_LABELS: Record<string, string> = {
  windows: 'Windows', android: 'Android', macos: 'macOS',
  ios: 'iOS', linux: 'Linux', webhtml5: 'Web / HTML5',
};

const blank = {
  title: '', description: '', cover_url: '', banner_url: '', developer: '',
  engine: '', status: 'in_progress', age_rating: 'all',
  translator_id: '', translator_note: '', is_featured: false, published: false,
};

// Mirrors MAX_UPLOAD_BYTES in src/lib/storage.ts — can't import that file
// client-side (it also wires up the Supabase service-role client), so this
// is a deliberate, manually-kept-in-sync duplicate. Used only for an
// early client-side check so an oversized file gets a clear Vietnamese
// error immediately instead of a wasted round trip that would otherwise
// either hit our own 400 or, above ~4.5MB, Vercel's platform-level 413.
const MAX_UPLOAD_BYTES_CLIENT = 4 * 1024 * 1024;

/**
 * URL input + file upload for cover/banner. Keeps the old paste-a-URL flow
 * as the default (still the fastest path for an admin who already has the
 * image hosted somewhere), and adds an "Upload" tab that POSTs to
 * /api/admin/upload and writes the returned Supabase Storage URL into the
 * exact same field — the parent form never needs to know which path was
 * used, both end up as a plain string in form.cover_url / form.banner_url.
 */
function ImageUploadField({ label, value, onChange }: {
  label: string; value: string; onChange: (url: string) => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<'url' | 'upload'>('url');
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES_CLIENT) {
      toast.push(`Ảnh vượt quá giới hạn ${MAX_UPLOAD_BYTES_CLIENT / 1024 / 1024}MB.`, 'error');
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('folder', 'games');
      const r = await apiFetch('/api/admin/upload', { method: 'POST', body });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.success) {
        onChange(d.data.url);
        toast.push('Đã upload ảnh', 'success');
      } else {
        toast.push(d?.error ?? 'Upload thất bại', 'error');
      }
    } catch {
      toast.push('Lỗi kết nối khi upload', 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-muted uppercase tracking-wider">{label}</label>
        <div className="flex text-xs rounded-lg border border-border overflow-hidden">
          <button type="button" onClick={() => setMode('url')}
            className={`px-2.5 py-1 transition-colors ${mode === 'url' ? 'bg-copper/20 text-copper-light' : 'text-ghost-dim hover:text-ghost'}`}>
            URL
          </button>
          <button type="button" onClick={() => setMode('upload')}
            className={`px-2.5 py-1 transition-colors ${mode === 'upload' ? 'bg-copper/20 text-copper-light' : 'text-ghost-dim hover:text-ghost'}`}>
            Upload
          </button>
        </div>
      </div>

      {mode === 'url' ? (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="https://..."
          className="input-base w-full text-sm"
        />
      ) : (
        <div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={uploading}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            className="block w-full text-sm text-ghost-dim file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-copper/15 file:text-copper-light hover:file:bg-copper/25 file:cursor-pointer disabled:opacity-50"
          />
          {uploading && <p className="text-xs text-muted mt-1.5">Đang upload...</p>}
          <p className="text-xs text-muted mt-1.5">JPEG/PNG/WebP/GIF, tối đa 4MB. Lưu vào Supabase Storage.</p>
        </div>
      )}

      {value && (
        <div className="relative mt-2 h-32 rounded-lg border border-border overflow-hidden">
          <Image src={value} alt="preview" fill unoptimized={!canOptimizeImage(value)} className="object-cover" />
        </div>
      )}
    </div>
  );
}

export default function GameForm({ initial, gameId }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({ ...blank, ...initial });
  const [genres, setGenres] = useState<number[]>(initial?.genres?.map(g => g.id) ?? []);
  const [allGenres, setAllGenres] = useState<{ id: number; name: string; slug: string }[]>([]);
  const [genresLoading, setGenresLoading] = useState(true);
  const [downloads, setDownloads] = useState<DownloadEntry[]>(
    (initial?.downloads as DownloadEntry[] | undefined)?.map(d => ({ ...d, label: d.label ?? '' }))
      ?? [{ version: 'v1.0', platform: 'windows', url: '', label: '' }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isEdit = !!gameId;

  // Load genres from DB at mount — IDs must come from the real DB, not a
  // hardcoded list, because shards seeded before explicit-ID pinning may
  // have different SERIAL-assigned IDs that don't match any static constant.
  useEffect(() => {
    apiFetch('/api/genres')
      .then(r => r.json())
      .then(d => { if (d.success) setAllGenres(d.data); })
      .catch(() => { /* silently fall through; genres section shows empty */ })
      .finally(() => setGenresLoading(false));
  }, []);

  const set = (key: string, value: unknown) => setForm(f => ({ ...f, [key]: value }));

  const toggleGenre = (id: number) =>
    setGenres(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);

  const addDownload = () => setDownloads(d => [...d, { version: 'v1.0', platform: 'windows', url: '', label: '' }]);
  const removeDownload = (i: number) => setDownloads(d => d.filter((_, idx) => idx !== i));
  const updateDownload = (i: number, key: keyof DownloadEntry, val: string) =>
    setDownloads(d => d.map((dl, idx) => idx === i ? { ...dl, [key]: val } : dl));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Vui lòng nhập tên game'); return; }
    if (!form.description.trim()) { setError('Vui lòng nhập mô tả'); return; }
    setSaving(true); setError('');
    try {
      const url = isEdit ? `/api/admin/games/${gameId}` : '/api/admin/games';
      const method = isEdit ? 'PUT' : 'POST';
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, genres, downloads: downloads.filter(d => d.url.trim()) }),
      });
      const d = await r.json();
      if (d.success) {
        // This is the longest form in the app and the save always
        // navigates away immediately (router.push below) — without a
        // toast there's no visible confirmation the save landed before
        // the admin games list replaces this whole form.
        toast.push(isEdit ? `Đã lưu thay đổi cho "${form.title}"` : `Đã đăng game "${form.title}"`, 'success');
        router.push('/admin/games');
        router.refresh();
      } else {
        setError(d.error ?? 'Lỗi lưu game');
        toast.push(d.error ?? 'Lỗi lưu game', 'error');
      }
    } finally { setSaving(false); }
  };

  const inputCls = "w-full bg-vault border border-border rounded-lg px-3 py-2.5 text-sm text-ghost placeholder:text-muted focus:outline-none focus:border-copper/60 transition-colors";
  const labelCls = "text-xs uppercase tracking-wider text-muted font-semibold mb-1.5 block";

  return (
    <form onSubmit={submit} className="p-4 sm:p-6 md:p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ghost">
            {isEdit ? 'Chỉnh Sửa Game' : 'Thêm Game Mới'}
          </h1>
          <p className="text-ghost-dim text-sm mt-0.5">
            {isEdit ? 'Cập nhật thông tin tựa game' : 'Điền thông tin để đăng game mới'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Hủy
          </Button>
          <Button type="submit" loading={saving} loadingText="Đang lưu...">
            {isEdit ? 'Lưu Thay Đổi' : 'Đăng Game'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="slide-up mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">{error}</div>
      )}

      <div className="space-y-6">
        {/* ── Basic Info ── */}
        <section className="bg-surface border border-border rounded-xl p-5">
          <h2 className="font-heading text-sm font-bold text-ghost mb-4">Thông Tin Cơ Bản</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <FormField label="Tên Game" value={form.title} onChange={e => set('title', e.target.value)}
                placeholder="Tên tựa game" required />
            </div>
            <FormField label="Developer / Hãng phát hành" value={form.developer} onChange={e => set('developer', e.target.value)}
              placeholder="Tên studio / developer" />
            <div>
              <label className={labelCls}>Game Engine</label>
              <select value={form.engine} onChange={e => set('engine', e.target.value)} className={inputCls}>
                <option value="">-- Chọn engine --</option>
                <option value="renpy">Ren&apos;Py</option>
                <option value="kirikiri">KiriKiri</option>
                <option value="unity">Unity</option>
                <option value="rpgmaker">RPG Maker</option>
                <option value="tyranobuild">TyranoBuild</option>
                <option value="godot">Godot</option>
                <option value="wolfrpg">Wolf RPG</option>
                <option value="unreal">Unreal Engine</option>
                <option value="artemis">Artemis</option>
                <option value="catsystem2">Cat System 2</option>
                <option value="other">Khác</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Ngôn ngữ</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className={inputCls}>
                <option value="completed">Việt Hoá</option>
                <option value="in_progress">Tiếng Nhật</option>
                <option value="paused">Tiếng Trung</option>
                <option value="demo">Tiếng Anh</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Độ tuổi</label>
              <select value={form.age_rating} onChange={e => set('age_rating', e.target.value)} className={inputCls}>
                <option value="all">Tất cả</option>
                <option value="16+">16+</option>
                <option value="18+">18+</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Mô tả / Giới thiệu *</label>
              <textarea value={form.description} onChange={e => set('description', e.target.value)}
                rows={5} placeholder="Mô tả chi tiết về game..." required
                className={inputCls + ' resize-none'} />
            </div>
          </div>
        </section>

        {/* ── Media ── */}
        <section className="bg-surface border border-border rounded-xl p-5">
          <h2 className="font-heading text-sm font-bold text-ghost mb-4">Hình Ảnh</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ImageUploadField label="Ảnh Bìa (Cover)" value={form.cover_url} onChange={url => set('cover_url', url)} />
            <ImageUploadField label="Banner (Tùy chọn)" value={form.banner_url} onChange={url => set('banner_url', url)} />
          </div>
        </section>

        {/* ── Genres ── */}
        <section className="bg-surface border border-border rounded-xl p-5">
          <h2 className="font-heading text-sm font-bold text-ghost mb-4">Thể Loại</h2>
          {genresLoading ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-7 w-20 rounded-full bg-dim/40 animate-pulse" />
              ))}
            </div>
          ) : allGenres.length === 0 ? (
            <p className="text-xs text-muted italic">Không tải được danh sách thể loại.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allGenres.map(g => (
                <button key={g.id} type="button" onClick={() => toggleGenre(g.id)}
                  className={`press-scale px-3 py-1.5 rounded-full text-xs border whitespace-nowrap transition-colors ${
                    genres.includes(g.id)
                      ? 'bg-copper/20 text-copper-light border-copper/50'
                      : 'bg-vault text-ghost-dim border-border hover:border-copper/30'
                  }`}>
                  {g.name}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ── Downloads ── */}
        <section className="bg-surface border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-heading text-sm font-bold text-ghost">Link Tải</h2>
            <button type="button" onClick={addDownload}
              className="press-scale text-xs px-3 py-1.5 bg-copper/10 border border-copper/30 text-copper-light rounded-lg hover:bg-copper/20 transition-colors">
              + Thêm Link
            </button>
          </div>
          <p className="text-xs text-ghost-dim mb-4 leading-relaxed">
            <strong className="text-ghost">Phiên bản</strong> sẽ hiển thị ở mục Thông Tin Game (không hiện trên từng link).{' '}
            <strong className="text-ghost">Nhãn</strong> là tên nơi lưu trữ file mà người tải nhìn thấy — VD: Google Drive, Pixeldrain, Mediafire.
          </p>
          <div className="grid grid-cols-12 gap-2 mb-1.5 px-0.5 hidden sm:grid">
            <p className="col-span-2 text-[10px] uppercase tracking-wider text-muted font-semibold">Phiên bản</p>
            <p className="col-span-2 text-[10px] uppercase tracking-wider text-muted font-semibold">Nền tảng</p>
            <p className="col-span-3 text-[10px] uppercase tracking-wider text-muted font-semibold">Nhãn (host)</p>
            <p className="col-span-4 text-[10px] uppercase tracking-wider text-muted font-semibold">URL</p>
          </div>
          <div className="space-y-3">
            {downloads.map((dl, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
                <div className="sm:col-span-2">
                  <input value={dl.version} onChange={e => updateDownload(i, 'version', e.target.value)}
                    placeholder="v1.0" className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <select value={dl.platform} onChange={e => updateDownload(i, 'platform', e.target.value)}
                    className={inputCls}>
                    {PLATFORMS.map(p => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <input value={dl.label} onChange={e => updateDownload(i, 'label', e.target.value)}
                    placeholder="VD: Google Drive, Pixeldrain" className={inputCls} />
                </div>
                <div className="sm:col-span-4">
                  <input value={dl.url} onChange={e => updateDownload(i, 'url', e.target.value)}
                    placeholder="https://..." className={inputCls} />
                </div>
                <div className="sm:col-span-1 flex justify-end">
                  <button type="button" onClick={() => removeDownload(i)}
                    className="press-scale p-2.5 border border-red-500/30 text-red-400/70 rounded-lg hover:text-red-400 hover:border-red-500/60 transition-colors">
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Translator ── */}
        <section className="bg-surface border border-border rounded-xl p-5">
          <h2 className="font-heading text-sm font-bold text-ghost mb-4">Dịch Giả</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FormField
                label="Tên Dịch Giả / Nhóm Dịch"
                value={form.translator_id}
                onChange={e => set('translator_id', e.target.value)}
                placeholder="Nhập tên nhóm dịch (raw text)..."
                hint="Gõ trực tiếp tên dịch giả/nhóm dịch — hệ thống tự lưu và tự tạo hồ sơ nếu chưa có, không cần nhập UUID. Tên này sẽ hiển thị ở mục Thông Tin Game."
              />
            </div>
            <FormField
              label="Ghi chú dịch giả"
              value={form.translator_note}
              onChange={e => set('translator_note', e.target.value)}
              placeholder="Lời nhắn, code, ghi chú..."
              hint="Hỗ trợ chèn link dạng [chữ hiển thị](url) — ví dụ: [Vào nhóm dịch](https://t.me/...). URL trần (https://...) cũng tự thành link. Chỉ chấp nhận http/https."
            />
          </div>
        </section>

        {/* ── Publish Options ── */}
        <section className="bg-surface border border-border rounded-xl p-5">
          <h2 className="font-heading text-sm font-bold text-ghost mb-4">Tùy Chọn Đăng</h2>
          <div className="flex flex-col gap-3">
            {[
              { key: 'published', label: 'Công khai', desc: 'Hiển thị game trên trang chủ và thư viện' },
              { key: 'is_featured', label: 'Game Đặc Sắc', desc: 'Hiển thị trong mục đặc sắc & được chọn lọc' },
            ].map(opt => (
              <label key={opt.key} className="flex items-start gap-3 cursor-pointer group">
                <div className="mt-0.5 relative">
                  <input type="checkbox"
                    checked={!!form[opt.key as keyof typeof form]}
                    onChange={e => set(opt.key, e.target.checked)}
                    className="sr-only" />
                  <div className={`w-9 h-5 rounded-full transition-colors ${
                    form[opt.key as keyof typeof form] ? 'bg-copper' : 'bg-dim'
                  }`}>
                    <div className={`w-3.5 h-3.5 rounded-full bg-white shadow mt-0.75 transition-transform ${
                      form[opt.key as keyof typeof form] ? 'translate-x-4.5 ml-[18px]' : 'ml-[3px]'
                    } mt-[3px]`} />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-ghost">{opt.label}</p>
                  <p className="text-xs text-ghost-dim">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </section>
      </div>

      {/* Bottom actions */}
      <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-border">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Hủy
        </Button>
        <Button type="submit" loading={saving} loadingText="Đang lưu..." className="px-8">
          {isEdit ? 'Lưu Thay Đổi' : 'Đăng Game'}
        </Button>
      </div>
    </form>
  );
}

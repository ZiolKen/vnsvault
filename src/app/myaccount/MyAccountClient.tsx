'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TurnstileWidget } from '@/components/ui/TurnstileWidget';
import { PRESET_AVATARS } from '@/lib/avatars';
import { canOptimizeImage } from '@/lib/utils';
import { refreshNavUser } from '@/components/layout/Navbar';
import type { BookmarkedGameRow } from '@/lib/queries';
import { apiFetch } from '@/lib/apiClient';
import type { VipOrder, VipOrderStatus } from '@/types';

interface UserInfo {
  id: string;
  username: string;
  email: string;
  role: string;
  avatar_url?: string;
  created_at: string;
}

interface VipStatus {
  isVip: boolean;
  permanent: boolean;
  expiresAt: string | null;
}

// Mirrors MAX_UPLOAD_BYTES in src/lib/storage.ts — kept in sync by hand,
// see the same constant's comment in GameForm.tsx for why it can't just
// be imported client-side.
const MAX_UPLOAD_BYTES_CLIENT = 4 * 1024 * 1024;

/* ───────────────────────────────────── Avatar picker ───── */
function AvatarPicker({ user, onUpdated }: { user: UserInfo; onUpdated: (url: string) => void }) {
  const [selected, setSelected] = useState(user.avatar_url ?? '');
  const [customUrl, setCustomUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarTab, setAvatarTab] = useState<'url' | 'upload'>('url');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const isAdmin = user.role === 'admin';

  const save = async (url: string) => {
    setSaving(true); setMsg(''); setErr('');
    const r = await apiFetch('/api/account/avatar', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatarUrl: url }),
    });
    const d = await r.json().catch(() => null);
    setSaving(false);
    if (r.ok && d?.success) {
      setMsg('Đã cập nhật avatar!'); onUpdated(url); setSelected(url); refreshNavUser();
    } else setErr(d?.error ?? 'Lỗi cập nhật');
  };

  const uploadAvatar = async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES_CLIENT) {
      setErr(`Ảnh vượt quá giới hạn ${MAX_UPLOAD_BYTES_CLIENT / 1024 / 1024}MB.`);
      return;
    }
    setUploading(true); setMsg(''); setErr('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('folder', 'avatars');
      const r = await apiFetch('/api/admin/upload', { method: 'POST', body });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.success) {
        await save(d.data.url);
      } else {
        setErr(d?.error ?? 'Upload thất bại');
      }
    } catch {
      setErr('Lỗi kết nối khi upload');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <h2 className="font-heading text-lg font-bold text-ghost mb-4">Ảnh đại diện</h2>

      {/* Current avatar preview */}
      <div className="flex items-center gap-4 mb-5">
        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-copper/30 bg-surface flex items-center justify-center shrink-0">
          {selected ? (
            <Image src={selected} alt="Avatar hiện tại" width={64} height={64} unoptimized={!canOptimizeImage(selected)} className="object-cover w-full h-full" />
          ) : (
            <span className="text-2xl font-bold text-copper-light">{user.username[0].toUpperCase()}</span>
          )}
        </div>
        <div>
          <p className="text-sm text-ghost font-medium">{user.username}</p>
          <p className="text-xs text-muted">{selected ? 'Đang dùng ảnh đã chọn' : 'Chưa có ảnh đại diện'}</p>
        </div>
      </div>

      {msg && <p className="text-sm text-emerald-400 mb-3">{msg}</p>}
      {err && <p className="text-sm text-red-400 mb-3">{err}</p>}

      {/* Preset grid */}
      <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">Chọn từ bộ sưu tập</p>
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mb-4">
        {PRESET_AVATARS.map(url => (
          <button
            key={url}
            type="button"
            onClick={() => save(url)}
            disabled={saving}
            className={`relative w-full aspect-square rounded-xl overflow-hidden border-2 transition-all hover:scale-105 ${
              selected === url ? 'border-copper shadow-lg shadow-copper/30' : 'border-border hover:border-copper/40'
            } disabled:opacity-60`}
            aria-label={`Chọn avatar ${url}`}
            aria-pressed={selected === url}
          >
            <Image src={url} alt="" fill className="object-cover" />
            {selected === url && (
              <div className="absolute inset-0 bg-copper/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-copper-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Admin custom URL / upload */}
      {isAdmin && (
        <div className="border-t border-border/40 pt-4 mt-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-copper">Admin — Ảnh Tùy Chỉnh</p>
            <div className="flex text-xs rounded-lg border border-border overflow-hidden">
              <button type="button" onClick={() => setAvatarTab('url')}
                className={`px-2.5 py-1 transition-colors ${avatarTab === 'url' ? 'bg-copper/20 text-copper-light' : 'text-ghost-dim hover:text-ghost'}`}>
                URL
              </button>
              <button type="button" onClick={() => setAvatarTab('upload')}
                className={`px-2.5 py-1 transition-colors ${avatarTab === 'upload' ? 'bg-copper/20 text-copper-light' : 'text-ghost-dim hover:text-ghost'}`}>
                Upload
              </button>
            </div>
          </div>

          {avatarTab === 'url' ? (
            <div className="flex gap-2">
              <input
                type="url"
                value={customUrl}
                onChange={e => setCustomUrl(e.target.value)}
                placeholder="https://... hoặc /path/to/image"
                className="input-base flex-1 text-sm"
              />
              <button
                type="button"
                onClick={() => { if (customUrl.trim()) save(customUrl.trim()); }}
                disabled={saving || !customUrl.trim()}
                className="btn-copper px-4 py-2 text-sm shrink-0 disabled:opacity-50"
              >
                Lưu
              </button>
            </div>
          ) : (
            <div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                disabled={uploading || saving}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ''; }}
                className="block w-full text-sm text-ghost-dim file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-copper/15 file:text-copper-light hover:file:bg-copper/25 file:cursor-pointer disabled:opacity-50"
              />
              {uploading && <p className="text-xs text-muted mt-1.5">Đang upload...</p>}
              <p className="text-xs text-muted mt-1.5">JPEG/PNG/WebP/GIF, tối đa 4MB. Lưu vào Supabase Storage, tự động áp dụng làm avatar sau khi upload xong.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────── Password change form ─── */
function PasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tsToken, setTsToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(''); setErr('');
    if (newPassword !== confirmPassword) { setErr('Mật khẩu mới không khớp.'); return; }
    if (newPassword.length < 6) { setErr('Mật khẩu mới tối thiểu 6 ký tự.'); return; }
    if (!tsToken) { setErr('Vui lòng hoàn thành xác minh bảo mật.'); return; }
    setSaving(true);
    const r = await apiFetch('/api/account/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword, tsToken }),
    });
    const d = await r.json().catch(() => null);
    if (r.ok && d?.success) {
      // The server clears the session cookie on password change (old JWTs
      // — e.g. a stolen one — must not keep working). Send the user to log
      // back in with the new password instead of leaving them on a page
      // that now looks logged-in but isn't.
      setMsg('Đã đổi mật khẩu thành công! Đang chuyển đến trang đăng nhập...');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setTsToken('');
      setTimeout(() => router.push('/login'), 1500);
    } else {
      setSaving(false);
      setErr(d?.error ?? 'Đổi mật khẩu thất bại.');
    }
  };

  return (
    <div>
      <h2 className="font-heading text-lg font-bold text-ghost mb-4">Đổi Mật Khẩu</h2>
      <form onSubmit={submit} className="space-y-4 max-w-md">
        {msg && <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm text-emerald-400">{msg}</div>}
        {err && <div role="alert" className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">{err}</div>}

        <div>
          <label htmlFor="cur-pass" className="text-xs text-muted uppercase tracking-wider block mb-1.5">Mật khẩu hiện tại</label>
          <input id="cur-pass" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
            required autoComplete="current-password" className="input-base" />
        </div>
        <div>
          <label htmlFor="new-pass" className="text-xs text-muted uppercase tracking-wider block mb-1.5">Mật khẩu mới</label>
          <input id="new-pass" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
            required minLength={6} autoComplete="new-password" className="input-base" />
        </div>
        <div>
          <label htmlFor="conf-pass" className="text-xs text-muted uppercase tracking-wider block mb-1.5">Xác nhận mật khẩu mới</label>
          <input id="conf-pass" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
            required minLength={6} autoComplete="new-password" className="input-base" />
        </div>

        {/* Turnstile */}
        <div>
          <p className="text-xs text-muted uppercase tracking-wider mb-2">Xác Minh Bảo Mật</p>
          <TurnstileWidget onToken={setTsToken} onExpire={() => setTsToken('')} />
        </div>

        <button type="submit" disabled={saving || !tsToken}
          className="btn-copper w-full justify-center py-3 disabled:opacity-50 disabled:cursor-not-allowed">
          {saving ? 'Đang lưu...' : 'Đổi Mật Khẩu'}
        </button>
      </form>
    </div>
  );
}

/* ──────────────────────────────── Bookmark list ────────── */
function BookmarkList({ userId }: { userId: string }) {
  const [items, setItems] = useState<BookmarkedGameRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/account/bookmarks')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.success) setItems(d.data ?? []); })
      .finally(() => setLoading(false));
  }, [userId]);

  const remove = (gameId: string, slug: string) => {
    setItems(prev => prev.filter(i => i.game_id !== gameId));
    apiFetch(`/api/games/${slug}/bookmark`, { method: 'POST' }).catch(() => {});
  };

  if (loading) return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-surface rounded-xl shimmer" />)}
    </div>
  );

  if (items.length === 0) return (
    <div className="text-center py-10 text-ghost-dim">
      <p className="text-4xl mb-3">🔖</p>
      <p className="text-sm">Chưa có game nào được lưu.</p>
      <Link href="/games" className="btn-copper mt-4 text-sm">Khám phá thư viện</Link>
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {items.map(item => (
        <div key={item.game_id} className="flex items-center gap-3 p-3 bg-surface border border-border rounded-xl group hover:border-copper/30 transition-colors">
          <div className="relative w-12 h-16 rounded-lg overflow-hidden shrink-0 bg-vault">
            {item.cover_url
              ? <Image src={item.cover_url} alt={item.title} fill className="object-cover" sizes="48px" />
              : <div className="absolute inset-0 flex items-center justify-center"><span className="font-cinzel text-lg text-dim">VN</span></div>}
          </div>
          <div className="flex-1 min-w-0">
            <Link href={`/games/${item.slug}`} className="text-sm font-medium text-ghost hover:text-copper-light transition-colors line-clamp-2">{item.title}</Link>
            <p className="text-xs text-muted mt-0.5">↓ {item.download_count.toLocaleString('vi-VN')} lượt tải</p>
          </div>
          <button type="button" onClick={() => remove(item.game_id, item.slug)}
            className="p-1.5 text-muted hover:text-copper-light hover:bg-copper/10 rounded-lg transition-colors shrink-0 opacity-0 group-hover:opacity-100"
            aria-label={`Bỏ lưu ${item.title}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────────────── VIP order history ──── */
function orderStatusLabel(s: VipOrderStatus): string {
  const map: Record<VipOrderStatus, string> = {
    pending: 'Chờ thanh toán',
    paid: 'Đã thanh toán',
    cancelled: 'Đã hủy',
    expired: 'Hết hạn',
  };
  return map[s] ?? s;
}

function orderStatusColor(s: VipOrderStatus): string {
  const map: Record<VipOrderStatus, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    paid: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    cancelled: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    expired: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return map[s] ?? 'bg-gray-500/20 text-gray-400';
}

function VipOrderHistory() {
  const [orders, setOrders] = useState<VipOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/account/orders')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.success) setOrders(d.data ?? []); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-surface rounded-xl shimmer" />)}
    </div>
  );

  if (orders.length === 0) return (
    <div className="text-center py-10 text-ghost-dim">
      <p className="text-4xl mb-3">💳</p>
      <p className="text-sm">Chưa có giao dịch nào.</p>
      <Link href="/donate" className="btn-copper mt-4 text-sm">Đăng ký VIP</Link>
    </div>
  );

  return (
    <div className="space-y-3">
      {orders.map(order => (
        <div key={order.id} className="flex items-center gap-4 p-4 bg-surface border border-border rounded-xl">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${orderStatusColor(order.status)}`}>
                {orderStatusLabel(order.status)}
              </span>
              <span className="text-xs text-muted">
                {new Date(order.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="text-sm text-ghost">
              <span className="font-medium">{order.months} tháng VIP</span>
              {' — '}
              <span className="text-copper-light font-semibold">
                {(order.paid_amount ?? order.expected_amount).toLocaleString('vi-VN')}₫
              </span>
            </p>
            <p className="text-xs text-muted mt-0.5">Mã: {order.order_code}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────────────── Main page ────────────── */
type Tab = 'bookmarks' | 'vip-history' | 'avatar' | 'password';

export default function MyAccountClient({ user, vip }: { user: UserInfo; vip: VipStatus }) {
  const [tab, setTab] = useState<Tab>('bookmarks');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url);

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'bookmarks',   label: 'Game Yêu Thích',    icon: '🔖' },
    { id: 'vip-history', label: 'Lịch Sử VIP',       icon: '💳' },
    { id: 'avatar',      label: 'Ảnh Đại Diện',      icon: '🖼️' },
    { id: 'password',    label: 'Đổi Mật Khẩu',      icon: '🔒' },
  ];

  return (
    <main className="pt-16 flex-1" id="main-content">
      <div className="max-w-5xl mx-auto px-4 py-10">

        {/* Profile header */}
        <div className="flex items-center gap-5 mb-8 p-5 bg-surface border border-border rounded-2xl">
          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-copper/30 bg-vault flex items-center justify-center shrink-0">
            {avatarUrl ? (
              <Image src={avatarUrl} alt="Avatar" width={64} height={64} unoptimized={!canOptimizeImage(avatarUrl)} className="object-cover w-full h-full" />
            ) : (
              <span className="text-2xl font-bold text-copper-light">{user.username[0].toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="font-heading text-xl font-bold text-ghost truncate">{user.username}</h1>
            <p className="text-sm text-muted truncate">{user.email}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${user.role === 'admin' ? 'bg-copper/20 text-copper-light border-copper/30' : 'bg-surface border-border text-ghost-dim'}`}>
                {user.role === 'admin' ? '⚙ Admin' : '👤 Thành viên'}
              </span>
              {vip.isVip ? (
                <span className="text-xs px-2 py-0.5 rounded-full border bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-medium whitespace-nowrap">
                  👑 {vip.permanent ? 'VIP vĩnh viễn' : `VIP — hết hạn ${vip.expiresAt ? new Date(vip.expiresAt).toLocaleDateString('vi-VN') : 'không xác định'}`}
                </span>
              ) : (
                <Link href="/donate" className="text-xs px-2 py-0.5 rounded-full border bg-copper/10 text-copper-light border-copper/30 font-medium hover:bg-copper/20 transition-colors whitespace-nowrap">
                  ✦ Đăng ký VIP — tải không cần vượt link
                </Link>
              )}
              <span className="text-xs text-muted">Tham gia {new Date(user.created_at).toLocaleDateString('vi-VN')}</span>
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 border-b border-border mb-7" role="tablist">
          {TABS.map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id ? 'border-copper text-copper-light' : 'border-transparent text-ghost-dim hover:text-ghost'
              }`}>
              <span aria-hidden="true">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab panels */}
        <div role="tabpanel">
          {tab === 'bookmarks'   && <BookmarkList userId={user.id} />}
          {tab === 'vip-history' && <VipOrderHistory />}
          {tab === 'avatar'      && <AvatarPicker user={{ ...user, avatar_url: avatarUrl }} onUpdated={setAvatarUrl} />}
          {tab === 'password'    && <PasswordForm />}
        </div>
      </div>
    </main>
  );
}

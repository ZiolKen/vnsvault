'use client';
import { useState, useEffect, useCallback } from 'react';
import { formatDate } from '@/lib/utils';
import { apiFetch } from '@/lib/apiClient';

interface VipStatus {
  isVip: boolean;
  permanent: boolean;
  expiresAt: string | null;
}

interface AdminUserRow {
  id: string;
  username: string;
  email: string;
  role: string;
  created_at: string;
  vip: VipStatus;
}

const MONTH_PRESETS = [1, 3, 6, 12];

type VipFilter = 'all' | 'vip' | 'novip' | 'admin';
const FILTER_TABS: { value: VipFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'vip', label: '👑 Đã VIP' },
  { value: 'novip', label: 'Chưa VIP' },
  { value: 'admin', label: 'Admin' },
];

function VipBadge({ vip }: { vip: VipStatus }) {
  if (!vip.isVip) {
    return <span className="text-xs px-2 py-0.5 rounded-full border bg-surface border-border text-ghost-dim whitespace-nowrap">Không VIP</span>;
  }
  if (vip.permanent) {
    return <span className="text-xs px-2 py-0.5 rounded-full border bg-copper/20 text-copper-light border-copper/40 font-medium whitespace-nowrap">👑 VIP vĩnh viễn</span>;
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full border bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-medium whitespace-nowrap">
      👑 VIP đến {vip.expiresAt ? formatDate(vip.expiresAt) : '—'}
    </span>
  );
}

function UserRow({ user, onUpdated }: { user: AdminUserRow; onUpdated: (u: AdminUserRow) => void }) {
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const call = async (body: Record<string, unknown>) => {
    setBusy(true); setErr('');
    try {
      const r = await apiFetch(`/api/admin/users/${user.id}/vip`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.success) {
        onUpdated({ ...user, vip: d.data.vip });
      } else {
        setErr(d?.error ?? 'Cập nhật thất bại.');
      }
    } catch {
      setErr('Lỗi kết nối.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="font-medium text-ghost">{user.username}</p>
            {user.role === 'admin' && (
              <span className="text-xs px-2 py-0.5 rounded-full border bg-copper/10 text-copper-light border-copper/30">Admin</span>
            )}
            <VipBadge vip={user.vip} />
          </div>
          <p className="text-xs text-muted truncate">{user.email}</p>
          <p className="text-xs text-dim mt-0.5">Tham gia {formatDate(user.created_at)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <select
            value={months}
            disabled={busy}
            onChange={e => setMonths(Number(e.target.value))}
            className="text-xs bg-vault border border-border rounded-lg px-2 py-1.5 text-ghost-dim focus:outline-none focus:border-copper/60 disabled:opacity-40"
            aria-label="Số tháng VIP"
          >
            {MONTH_PRESETS.map(m => <option key={m} value={m}>{m} tháng</option>)}
          </select>
          <button
            onClick={() => call({ months })}
            disabled={busy}
            className="text-xs px-3 py-1.5 bg-copper/15 text-copper-light border border-copper/30 rounded-lg hover:bg-copper/25 transition-colors disabled:opacity-40"
          >
            {busy ? '...' : 'Gia hạn'}
          </button>
          <button
            onClick={() => call({ permanent: true })}
            disabled={busy}
            className="text-xs px-3 py-1.5 bg-surface border border-border rounded-lg text-ghost-dim hover:border-copper/40 hover:text-copper-light transition-colors disabled:opacity-40"
          >
            Vĩnh viễn
          </button>
          {user.vip.isVip && (
            <button
              onClick={() => { if (confirm(`Thu hồi VIP của "${user.username}"?`)) call({ revoke: true }); }}
              disabled={busy}
              className="text-xs px-3 py-1.5 border border-red-500/30 rounded-lg text-red-400/70 hover:text-red-400 hover:border-red-500/60 transition-colors disabled:opacity-40"
            >
              Thu hồi
            </button>
          )}
        </div>
      </div>
      {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
    </div>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<VipFilter>('all');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  const load = useCallback((q: string, f: VipFilter) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (f !== 'all') params.set('filter', f);
    apiFetch(`/api/admin/users${params.toString() ? `?${params.toString()}` : ''}`)
      .then(r => r.json())
      .then(d => {
        if (d?.success) { setUsers(d.data); setFetchError(false); }
        else setFetchError(true);
      })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load('', 'all'); }, [load]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load(query.trim(), filter);
  };

  const selectFilter = (f: VipFilter) => {
    setFilter(f);
    load(query.trim(), f);
  };

  const updateUser = (u: AdminUserRow) => {
    setUsers(prev => prev.map(x => x.id === u.id ? u : x));
  };

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-ghost">Quản Lý VIP</h1>
        <p className="text-ghost-dim text-sm mt-0.5">
          Tìm tài khoản theo username hoặc email (đối chiếu với nội dung chuyển khoản), rồi nâng lên VIP.
        </p>
      </div>

      <form onSubmit={submitSearch} className="flex gap-2 mb-4 max-w-md">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Tìm theo username hoặc email..."
          className="input-base flex-1 text-sm"
        />
        <button type="submit" className="btn-copper px-4 py-2 text-sm shrink-0">Tìm</button>
      </form>

      <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label="Bộ lọc VIP">
        {FILTER_TABS.map(t => (
          <button
            key={t.value}
            onClick={() => selectFilter(t.value)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filter === t.value
                ? 'bg-copper/15 text-copper-light border-copper/30'
                : 'bg-surface text-ghost-dim border-border hover:border-copper/30 hover:text-ghost'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {fetchError ? (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">
          <span className="text-xl">⚠️</span>
          <span>Không thể tải danh sách người dùng.</span>
          <button onClick={() => load(query, filter)} className="ml-auto text-xs px-3 py-1.5 border border-red-500/40 rounded-lg hover:bg-red-500/10">
            Thử lại
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-surface border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-ghost-dim">Không tìm thấy người dùng nào.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map(u => <UserRow key={u.id} user={u} onUpdated={updateUser} />)}
        </div>
      )}
    </div>
  );
}

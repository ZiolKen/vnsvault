'use client';
import { useState, useEffect } from 'react';
import { requestStatusLabel, requestStatusColor, formatDate } from '@/lib/utils';
import type { GameRequest, RequestStatus } from '@/types';

const STATUS_OPTIONS: RequestStatus[] = ['pending', 'approved', 'in_progress', 'rejected'];

export default function AdminRequestsPage() {
  const [requests, setRequests] = useState<GameRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<RequestStatus | ''>('');

  const load = () => {
    setLoading(true);
    fetch('/api/admin/requests')
      .then(r => r.json())
      .then(d => {
        if (d?.success) { setRequests(d.data); setFetchError(false); }
        else setFetchError(true);
      })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const updateStatus = async (id: string, status: RequestStatus) => {
    setBusyId(id);
    try {
      const r = await fetch(`/api/admin/requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (r.ok) {
        setRequests(prev => prev.map(req => req.id === id ? { ...req, status } : req));
      } else {
        const d = await r.json().catch(() => null);
        alert(d?.error ?? 'Cập nhật trạng thái thất bại. Vui lòng thử lại.');
      }
    } catch {
      alert('Lỗi kết nối. Vui lòng thử lại.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string, title: string) => {
    if (!confirm(`Xóa đề xuất "${title}"? Hành động này không thể hoàn tác.`)) return;
    setBusyId(id);
    try {
      const r = await fetch(`/api/admin/requests/${id}`, { method: 'DELETE' });
      if (r.ok) {
        setRequests(prev => prev.filter(req => req.id !== id));
      } else {
        const d = await r.json().catch(() => null);
        alert(d?.error ?? 'Xóa thất bại. Vui lòng thử lại.');
      }
    } catch {
      alert('Lỗi kết nối. Vui lòng thử lại.');
    } finally {
      setBusyId(null);
    }
  };

  const filtered = filter ? requests.filter(r => r.status === filter) : requests;

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ghost">Đề Xuất Game</h1>
          <p className="text-ghost-dim text-sm mt-0.5">{requests.length} đề xuất từ cộng đồng</p>
        </div>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value as RequestStatus | '')}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ghost focus:outline-none focus:border-copper/60"
        >
          <option value="">Tất cả trạng thái</option>
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{requestStatusLabel(s)}</option>
          ))}
        </select>
      </div>

      {fetchError ? (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">
          <span className="text-xl">⚠️</span>
          <span>Không thể tải danh sách đề xuất.</span>
          <button onClick={load} className="ml-auto text-xs px-3 py-1.5 border border-red-500/40 rounded-lg hover:bg-red-500/10">
            Thử lại
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-surface border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-ghost-dim">{requests.length === 0 ? 'Chưa có đề xuất nào.' : 'Không có đề xuất khớp bộ lọc.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <div key={r.id} className="bg-surface border border-border rounded-xl p-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <h3 className="font-medium text-ghost">{r.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${requestStatusColor(r.status)}`}>
                      {requestStatusLabel(r.status)}
                    </span>
                  </div>
                  {r.description && (
                    <p className="text-sm text-ghost-dim line-clamp-2 mb-1.5">{r.description}</p>
                  )}
                  <div className="flex items-center gap-3 flex-wrap text-xs text-muted">
                    <span>👍 {r.vote_count} lượt vote</span>
                    {r.engine && <span>🔧 {r.engine}</span>}
                    {r.submitted_by && <span>👤 {r.submitted_by}</span>}
                    <span>{formatDate(r.created_at)}</span>
                    {r.source_url && (
                      <a href={r.source_url} target="_blank" rel="noopener noreferrer"
                        className="text-copper-light hover:underline">
                        Nguồn ↗
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={r.status}
                    disabled={busyId === r.id}
                    onChange={e => updateStatus(r.id, e.target.value as RequestStatus)}
                    className="text-xs bg-vault border border-border rounded-lg px-2 py-1.5 text-ghost-dim focus:outline-none focus:border-copper/60 disabled:opacity-40"
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s} value={s}>{requestStatusLabel(s)}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => remove(r.id, r.title)}
                    disabled={busyId === r.id}
                    className="text-xs px-2.5 py-1.5 border border-red-500/30 rounded-lg text-red-400/70 hover:text-red-400 hover:border-red-500/60 transition-colors disabled:opacity-40 shrink-0"
                  >
                    {busyId === r.id ? '...' : 'Xóa'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

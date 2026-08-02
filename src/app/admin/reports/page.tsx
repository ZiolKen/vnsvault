'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { reportStatusLabel, reportStatusColor, platformLabel, formatDate } from '@/lib/utils';
import type { LinkReport, ReportStatus } from '@/types';
import { apiFetch } from '@/lib/apiClient';

export default function AdminReportsPage() {
  const [reports, setReports] = useState<LinkReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReportStatus | ''>('open');

  const load = () => {
    setLoading(true);
    apiFetch('/api/admin/reports')
      .then(r => r.json())
      .then(d => {
        if (d?.success) { setReports(d.data); setFetchError(false); }
        else setFetchError(true);
      })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const setStatus = async (id: string, status: ReportStatus) => {
    setBusyId(id);
    try {
      const r = await apiFetch(`/api/admin/reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (r.ok) {
        setReports(prev => prev.map(rep => rep.id === id ? { ...rep, status } : rep));
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

  const remove = async (id: string) => {
    if (!confirm('Xóa báo cáo này? Hành động này không thể hoàn tác.')) return;
    setBusyId(id);
    try {
      const r = await apiFetch(`/api/admin/reports/${id}`, { method: 'DELETE' });
      if (r.ok) {
        setReports(prev => prev.filter(rep => rep.id !== id));
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

  const filtered = filter ? reports.filter(r => r.status === filter) : reports;
  const openCount = reports.filter(r => r.status === 'open').length;

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ghost">Báo Lỗi Link Tải</h1>
          <p className="text-ghost-dim text-sm mt-0.5">{openCount} báo cáo đang mở · {reports.length} tổng cộng</p>
        </div>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value as ReportStatus | '')}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-ghost focus:outline-none focus:border-copper/60"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="open">Đang mở</option>
          <option value="resolved">Đã xử lý</option>
        </select>
      </div>

      {fetchError ? (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">
          <span className="text-xl">⚠️</span>
          <span>Không thể tải danh sách báo cáo.</span>
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
          <p className="text-ghost-dim">
            {reports.length === 0 ? 'Chưa có báo cáo nào. 🎉' : 'Không có báo cáo khớp bộ lọc.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <div key={r.id} className="bg-surface border border-border rounded-xl p-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <Link href={`/games/${r.game_slug}`} target="_blank"
                      className="font-medium text-ghost hover:text-copper-light transition-colors">
                      {r.game_title}
                    </Link>
                    <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${reportStatusColor(r.status)}`}>
                      {reportStatusLabel(r.status)}
                    </span>
                  </div>
                  {r.download_version && (
                    <p className="text-xs text-muted mb-1">
                      🔗 Link: v{r.download_version} · {r.download_platform ? platformLabel(r.download_platform) : ''}
                      {r.download_url && (
                        <a href={r.download_url} target="_blank" rel="noopener noreferrer"
                          className="ml-1.5 text-copper-light hover:underline">Xem link ↗</a>
                      )}
                    </p>
                  )}
                  {r.reason ? (
                    <p className="text-sm text-ghost-dim mb-1.5">{r.reason}</p>
                  ) : (
                    <p className="text-sm text-muted italic mb-1.5">Không có mô tả chi tiết</p>
                  )}
                  <span className="text-xs text-muted">{formatDate(r.created_at)}</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {r.status === 'open' ? (
                    <button
                      onClick={() => setStatus(r.id, 'resolved')}
                      disabled={busyId === r.id}
                      className="text-xs px-2.5 py-1.5 border border-emerald-500/30 rounded-lg text-emerald-400/80 hover:text-emerald-400 hover:border-emerald-500/60 transition-colors disabled:opacity-40"
                    >
                      {busyId === r.id ? '...' : '✓ Đã xử lý'}
                    </button>
                  ) : (
                    <button
                      onClick={() => setStatus(r.id, 'open')}
                      disabled={busyId === r.id}
                      className="text-xs px-2.5 py-1.5 border border-border rounded-lg text-ghost-dim hover:text-ghost hover:border-copper/40 transition-colors disabled:opacity-40"
                    >
                      {busyId === r.id ? '...' : 'Mở lại'}
                    </button>
                  )}
                  <button
                    onClick={() => remove(r.id)}
                    disabled={busyId === r.id}
                    className="text-xs px-2.5 py-1.5 border border-red-500/30 rounded-lg text-red-400/70 hover:text-red-400 hover:border-red-500/60 transition-colors disabled:opacity-40"
                  >
                    Xóa
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

'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { TurnstileWidget } from '@/components/ui/TurnstileWidget';
import VoteModal from '@/components/requests/VoteModal';
import type { GameRequest } from '@/types';
import { formatDate } from '@/lib/utils';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:     { label: 'Chờ duyệt', color: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30' },
  approved:    { label: 'Đã duyệt',  color: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/30' },
  in_progress: { label: 'Đang dịch', color: 'bg-sky-400/10 text-sky-400 border-sky-400/30' },
  rejected:    { label: 'Từ chối',   color: 'bg-red-400/10 text-red-400 border-red-400/30' },
};

const ENGINE_OPTIONS = ['', "Ren'Py", 'KiriKiri', 'Unity', 'RPG Maker', 'TyranoBuild', 'Godot', 'Wolf RPG', 'Unreal Engine', 'Artemis', 'Cat System 2', 'Khác'];

export default function RequestsPage() {
  const [requests, setRequests] = useState<GameRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', source_url: '', engine: '', description: '', submitted_by: '' });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');
  const [filter, setFilter] = useState('');
  // Turnstile token for the submit-request form (unrelated to voting)
  const [submitTsToken, setSubmitTsToken] = useState('');
  // ★ Vote flow: clicking Vote opens VoteModal, which renders a normal
  // (visible) Turnstile challenge and calls vote() once solved. This
  // replaces the old "invisible" pre-loaded Turnstile widget that never
  // reliably fired a token (size:'invisible' + appearance:'interaction-only'
  // fight each other), so every vote silently failed verification server-side
  // — see VoteModal.tsx's doc comment for the full explanation.
  const [voteModalReq, setVoteModalReq] = useState<GameRequest | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/requests')
      .then(r => r.json())
      .then(d => {
        if (d?.success) { setRequests(d.data); setFetchError(false); }
        else { setFetchError(true); }
      })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, [retryNonce]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const vote = async (id: string, tsToken: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const r = await fetch(`/api/requests/${id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tsToken }),
      });
      if (r.status === 401) {
        return { success: false, error: 'Vui lòng đăng nhập để bình chọn.' };
      }
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.success) {
        return { success: false, error: d?.error ?? 'Lỗi server, vui lòng thử lại.' };
      }
      setRequests(prev => prev.map(req =>
        req.id === id
          ? { ...req, vote_count: req.vote_count + (d.data.voted ? 1 : -1), user_voted: d.data.voted }
          : req
      ));
      return { success: true };
    } catch {
      return { success: false, error: 'Lỗi kết nối, vui lòng thử lại.' };
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { showToast('Vui lòng nhập tên game'); return; }
    if (!submitTsToken) { showToast('Vui lòng hoàn thành xác minh bên dưới'); return; }
    setSubmitting(true);
    try {
      const r = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, tsToken: submitTsToken }),
      });
      const d = await r.json();
      if (d.success) {
        setRequests(prev => [d.data, ...prev]);
        setShowForm(false);
        setForm({ title: '', source_url: '', engine: '', description: '', submitted_by: '' });
        setSubmitTsToken('');
        showToast('✓ Đề xuất đã được gửi thành công!');
      } else {
        // Turnstile tokens are single-use — whether verify succeeded or
        // failed, this one is spent. Clear it so the disabled-button check
        // forces a fresh solve instead of silently retrying with a dead token.
        setSubmitTsToken('');
        showToast(d.error ?? 'Lỗi gửi đề xuất');
      }
    } finally { setSubmitting(false); }
  };

  const filtered = filter
    ? requests.filter(r => r.status === filter)
    : requests;

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 bg-surface border border-copper/40 rounded-xl text-sm text-ghost shadow-2xl fade-in" role="alert" aria-live="polite">
          {toast}
        </div>
      )}

      <main className="pt-16 flex-1" id="main-content">
        <div className="max-w-4xl mx-auto px-4 py-10">
          {/* Breadcrumb */}
          <nav className="breadcrumb mb-6" aria-label="Breadcrumb">
            <Link href="/">Trang chủ</Link>
            <span aria-hidden="true">›</span>
            <span className="text-ghost-dim text-sm">Đề Xuất Game</span>
          </nav>

          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1" aria-hidden="true">
                <span className="w-5 h-px bg-copper" />
                <span className="text-xs uppercase tracking-widest text-copper-light font-semibold">Cộng đồng</span>
              </div>
              <h1 className="font-heading text-2xl sm:text-3xl font-bold text-ghost">Đề Xuất & Bình Chọn Game</h1>
              <p className="text-ghost-dim text-sm mt-1">
                {loading ? 'Đang tải...' : `${requests.length} đề xuất · Bình chọn để ưu tiên Việt hóa`}
              </p>
            </div>
            <button
              onClick={() => setShowForm(s => !s)}
              className="btn-copper shrink-0 text-sm"
              aria-expanded={showForm}
            >
              {showForm ? '✕ Đóng' : '+ Gửi Đề Xuất'}
            </button>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 flex-wrap mb-6" role="group" aria-label="Lọc theo trạng thái">
            {[
              { value: '', label: `Tất cả (${requests.length})` },
              { value: 'approved', label: 'Đã duyệt' },
              { value: 'pending', label: 'Chờ duyệt' },
              { value: 'in_progress', label: 'Đang dịch' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                aria-pressed={filter === opt.value}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  filter === opt.value
                    ? 'bg-copper/15 text-copper-light border-copper/40'
                    : 'bg-transparent text-ghost-dim border-border hover:border-copper/30'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* ── Submit form ── */}
          {showForm && (
            <div className="glass rounded-xl p-6 mb-6 slide-up" role="region" aria-label="Form gửi đề xuất">
              <h2 className="font-heading text-base font-bold text-ghost mb-5">Gửi Đề Xuất Mới</h2>
              <form onSubmit={submit} className="space-y-4" noValidate>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="req-title" className="text-xs text-muted mb-1.5 block uppercase tracking-wider">
                      Tên game <span className="text-red-400" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="req-title"
                      value={form.title}
                      onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Tên tựa game bạn muốn đề xuất"
                      required
                      className="input-base"
                    />
                  </div>
                  <div>
                    <label htmlFor="req-engine" className="text-xs text-muted mb-1.5 block uppercase tracking-wider">Engine</label>
                    <select
                      id="req-engine"
                      value={form.engine}
                      onChange={e => setForm(f => ({ ...f, engine: e.target.value }))}
                      className="input-base"
                    >
                      {ENGINE_OPTIONS.map(e => <option key={e} value={e}>{e || '-- Chọn engine --'}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="req-url" className="text-xs text-muted mb-1.5 block uppercase tracking-wider">Link gốc (F95Zone, Itch.io…)</label>
                  <input
                    id="req-url"
                    type="url"
                    value={form.source_url}
                    onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))}
                    placeholder="https://f95zone.to/threads/..."
                    className="input-base"
                  />
                </div>
                <div>
                  <label htmlFor="req-submitter" className="text-xs text-muted mb-1.5 block uppercase tracking-wider">Tên / Biệt danh</label>
                  <input
                    id="req-submitter"
                    value={form.submitted_by}
                    onChange={e => setForm(f => ({ ...f, submitted_by: e.target.value }))}
                    placeholder="Để trống nếu muốn ẩn danh"
                    className="input-base"
                  />
                </div>
                <div>
                  <label htmlFor="req-desc" className="text-xs text-muted mb-1.5 block uppercase tracking-wider">Mô tả ngắn</label>
                  <textarea
                    id="req-desc"
                    rows={3}
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Tóm tắt cốt truyện hoặc lý do tại sao nên dịch game này..."
                    className="input-base resize-none"
                  />
                </div>
                {/* Turnstile for submit */}
                <TurnstileWidget
                  onToken={setSubmitTsToken}
                  onExpire={() => setSubmitTsToken('')}
                  className="mt-2"
                />
                <div className="flex gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={submitting || !submitTsToken}
                    className="btn-copper disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Đang gửi...' : 'Gửi Đề Xuất'}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">Hủy</button>
                </div>
                {!submitTsToken && (
                  <p className="text-xs text-dim">Hoàn thành xác minh bên trên trước khi gửi.</p>
                )}
              </form>
            </div>
          )}

          {/* ── Request list ── */}
          <section aria-label="Danh sách đề xuất">
            {loading ? (
              <div className="space-y-3" aria-hidden="true">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="skeleton h-28 rounded-xl" />
                ))}
              </div>
            ) : fetchError ? (
              <div className="text-center py-16 text-ghost-dim fade-in">
                <p className="text-3xl mb-3" aria-hidden="true">⚠️</p>
                <p className="mb-4">Không thể tải danh sách đề xuất. Vui lòng thử lại.</p>
                <button onClick={() => setRetryNonce(n => n + 1)} className="btn-copper">Thử lại</button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-ghost-dim fade-in">
                <p className="text-3xl mb-3" aria-hidden="true">📭</p>
                <p>Chưa có đề xuất nào. Hãy là người đầu tiên!</p>
              </div>
            ) : (
              <ol className="space-y-3" aria-label="Danh sách đề xuất game">
                {filtered.map((req, i) => {
                  const st = STATUS_LABELS[req.status] ?? STATUS_LABELS.pending;
                  return (
                    <li
                      key={req.id}
                      className="bg-surface border border-border rounded-xl p-4 sm:p-5 hover:border-copper/30 transition-colors fade-in"
                    >
                      <div className="flex gap-4">
                        {/* Vote button */}
                        <button
                          onClick={() => setVoteModalReq(req)}
                          aria-label={`${req.user_voted ? 'Bỏ bình chọn' : 'Bình chọn'} cho ${req.title} (${req.vote_count} vote)`}
                          className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all shrink-0 min-w-[52px] ${
                            req.user_voted
                              ? 'bg-copper/15 border-copper/40 text-copper-light'
                              : 'border-border text-muted hover:border-copper/40 hover:text-copper-light'
                          }`}
                        >
                          <svg className="w-4 h-4" fill={req.user_voted ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                          <span className="font-cinzel text-sm font-bold leading-none">{req.vote_count}</span>
                        </button>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="font-cinzel text-xs text-copper/50 font-bold shrink-0">#{i + 1}</span>
                            <h2 className="font-heading text-base font-bold text-ghost leading-snug">{req.title}</h2>
                            <span className={`badge border ${st.color} shrink-0`}>{st.label}</span>
                            {req.engine && (
                              <span className="badge bg-dim/25 text-ghost-dim border-dim/40">{req.engine}</span>
                            )}
                          </div>

                          {req.description && (
                            <p className="text-sm text-ghost-dim line-clamp-2 mb-2 leading-relaxed">{req.description}</p>
                          )}

                          {req.source_url && (
                            <a
                              href={req.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-copper-light hover:text-copper transition-colors mb-2 truncate max-w-xs"
                              aria-label={`Link gốc cho ${req.title} (mở tab mới)`}
                            >
                              <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              {req.source_url.replace(/^https?:\/\//, '').slice(0, 55)}…
                            </a>
                          )}

                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted mt-1">
                            <span>{formatDate(req.created_at)}</span>
                            {req.submitted_by && <span>Bởi <span className="text-ghost-dim">{req.submitted_by}</span></span>}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </main>
      {/* Vote confirmation modal — opens on Vote click, shows a real
          Turnstile challenge, calls vote() once solved */}
      {voteModalReq && (
        <VoteModal
          requestTitle={voteModalReq.title}
          alreadyVoted={!!voteModalReq.user_voted}
          onConfirm={(tsToken) => vote(voteModalReq.id, tsToken)}
          onClose={() => setVoteModalReq(null)}
        />
      )}
    </>
  );
}

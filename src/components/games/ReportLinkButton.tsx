'use client';
import { useState } from 'react';
import { TurnstileWidget } from '@/components/ui/TurnstileWidget';
import { platformLabel } from '@/lib/utils';
import type { Platform } from '@/types';

interface DownloadOption {
  id: string;
  version: string;
  platform: Platform;
  label?: string;
}

interface Props {
  gameSlug: string;
  gameTitle: string;
  downloads: DownloadOption[];
  /** 'link' = small text link (default), 'button' = full ghost button row */
  variant?: 'link' | 'button';
}

/**
 * ★ Replaces the old fake "report" link ★
 * The detail page used to show "Link tải bị hỏng? Báo cáo tại đây" pointing
 * at /requests — the page for requesting a NEW game to be translated, which
 * has nothing to do with an existing game's broken download link. Nothing
 * was ever actually reported. This opens a real modal that lets the
 * reporter pick which download is broken, add an optional note, solve a
 * visible Turnstile challenge, and POSTs to /api/games/[slug]/report-link,
 * which stores the report (see schema.sql `link_reports`).
 *
 * ★ Explicit confirm step ★
 * Solving the Turnstile checkbox used to fire the POST immediately via its
 * `callback`, so the report was sent the instant the box was ticked — no
 * "are you sure" moment, and no chance to fix a typo in the reason field
 * after the fact. Turnstile now only stores the token; a separate "Gửi Báo
 * Cáo" button (enabled once a token exists) does the actual submit.
 */
export default function ReportLinkButton({ gameSlug, gameTitle, downloads, variant = 'link' }: Props) {
  const [open, setOpen] = useState(false);
  const [downloadId, setDownloadId] = useState('');
  const [reason, setReason] = useState('');
  const [tsToken, setTsToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const reset = () => {
    setOpen(false);
    setDownloadId('');
    setReason('');
    setTsToken('');
    setError('');
    setDone(false);
  };

  const handleSubmit = async () => {
    if (!tsToken || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const r = await fetch(`/api/games/${gameSlug}/report-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ downloadId: downloadId || undefined, reason: reason.trim() || undefined, tsToken }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.success) {
        setError(d?.error ?? 'Gửi báo cáo thất bại, vui lòng thử lại.');
        setSubmitting(false);
        return;
      }
      setDone(true);
      setSubmitting(false);
      setTimeout(reset, 2200);
    } catch {
      setError('Lỗi kết nối, vui lòng thử lại.');
      setSubmitting(false);
    }
  };

  return (
    <>
      {variant === 'button' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-ghost justify-center gap-2 text-sm"
        >
          <svg className="w-4 h-4 shrink-0 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86l-8.18 14.18A1 1 0 003 19.5h18a1 1 0 00.89-1.46L13.71 3.86a1 1 0 00-1.72 0z" />
          </svg>
          BÁO LIÊN KẾT TẢI HỎNG
        </button>
      ) : (
        <p className="text-xs text-muted">
          Link tải bị hỏng?{' '}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-copper-light hover:text-copper transition-colors underline underline-offset-2"
          >
            Báo cáo tại đây
          </button>
        </p>
      )}

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Báo lỗi link tải">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={reset} aria-hidden="true" />
          <div className="relative w-full max-w-sm glass rounded-2xl p-6 slide-up">
            <button
              onClick={reset}
              className="absolute top-3 right-3 p-1.5 text-muted hover:text-ghost-dim rounded-lg transition-colors"
              aria-label="Đóng"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {done ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-3" aria-hidden="true">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="font-heading text-base font-bold text-ghost mb-1">Đã gửi báo cáo!</h2>
                <p className="text-sm text-ghost-dim">Cảm ơn bạn đã giúp VNSVault giữ link luôn sạch.</p>
              </div>
            ) : (
              <>
                <div className="text-center mb-5">
                  <div className="w-12 h-12 rounded-full bg-copper/15 flex items-center justify-center mx-auto mb-3" aria-hidden="true">
                    <svg className="w-5 h-5 text-copper-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86l-8.18 14.18A1 1 0 003 19.5h18a1 1 0 00.89-1.46L13.71 3.86a1 1 0 00-1.72 0z" />
                    </svg>
                  </div>
                  <h2 className="font-heading text-base font-bold text-ghost mb-1">Báo Lỗi Link Tải</h2>
                  <p className="text-sm text-ghost-dim line-clamp-2">{gameTitle}</p>
                </div>

                {error && (
                  <div role="alert" className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
                    {error}
                  </div>
                )}

                <div className="space-y-3 mb-4">
                  {downloads.length > 0 && (
                    <div>
                      <label htmlFor="report-download" className="text-xs text-muted mb-1.5 block uppercase tracking-wider">
                        Link bị lỗi (không bắt buộc)
                      </label>
                      <select
                        id="report-download"
                        value={downloadId}
                        onChange={e => setDownloadId(e.target.value)}
                        className="input-base"
                      >
                        <option value="">-- Chọn link cụ thể --</option>
                        {downloads.map(d => (
                          <option key={d.id} value={d.id}>
                            {d.label?.trim() ? `${d.label} · ` : ''}v{d.version} · {platformLabel(d.platform)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label htmlFor="report-reason" className="text-xs text-muted mb-1.5 block uppercase tracking-wider">
                      Mô tả lỗi (không bắt buộc)
                    </label>
                    <textarea
                      id="report-reason"
                      rows={2}
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      maxLength={500}
                      placeholder="VD: Link 404, sai file, virus cảnh báo..."
                      className="input-base resize-none"
                    />
                  </div>
                </div>

                <div className="flex justify-center min-h-[65px] items-center">
                  <TurnstileWidget onToken={setTsToken} onExpire={() => setTsToken('')} />
                </div>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!tsToken || submitting}
                  className="btn-copper w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Đang gửi...
                    </span>
                  ) : (
                    'Gửi Báo Cáo'
                  )}
                </button>

                <p className="text-xs text-dim text-center mt-3">
                  {tsToken ? 'Bấm "Gửi Báo Cáo" để hoàn tất.' : 'Hoàn thành xác minh bên trên trước khi gửi.'}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

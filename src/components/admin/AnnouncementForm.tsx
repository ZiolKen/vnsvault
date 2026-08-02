'use client';
import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import AnnouncementBody from '@/components/announcement/AnnouncementBody';
import { refreshAnnouncement } from '@/components/layout/AnnouncementModal';
import type { Announcement, AnnouncementParagraph, AnnouncementSegment, AnnouncementTone } from '@/types';
import { apiFetch } from '@/lib/apiClient';

// Editor-local segment shape — always has every field present (unlike the
// stored/API shape where bold/tone/href are optional) so controlled inputs
// never have to juggle `undefined`. Converted to/from the real
// AnnouncementSegment shape at load/save time (see toEditState / toPayload).
interface EditSegment {
  text: string;
  bold: boolean;
  tone: AnnouncementTone;
  href: string;
}
type EditParagraph = EditSegment[];

const TONE_OPTIONS: { value: AnnouncementTone; label: string }[] = [
  { value: 'default', label: 'Mặc định' },
  { value: 'muted', label: 'Mờ' },
  { value: 'copper', label: 'Đồng (accent)' },
  { value: 'gold', label: 'Vàng' },
  { value: 'danger', label: 'Đỏ (cảnh báo)' },
];

const blankSegment = (): EditSegment => ({ text: '', bold: false, tone: 'default', href: '' });
const blankParagraph = (): EditParagraph => [blankSegment()];

function toEditState(body: AnnouncementParagraph[]): EditParagraph[] {
  if (body.length === 0) return [blankParagraph()];
  return body.map(paragraph =>
    paragraph.map((seg): EditSegment => ({
      text: seg.text,
      bold: seg.bold ?? false,
      tone: seg.tone ?? 'default',
      href: seg.href ?? '',
    }))
  );
}

function toPayload(paragraphs: EditParagraph[]): AnnouncementParagraph[] {
  return paragraphs
    .map(paragraph =>
      paragraph
        .filter(seg => seg.text.trim())
        .map((seg): AnnouncementSegment => ({
          text: seg.text.trim(),
          ...(seg.bold ? { bold: true } : {}),
          ...(seg.tone !== 'default' ? { tone: seg.tone } : {}),
          ...(seg.href.trim() ? { href: seg.href.trim() } : {}),
        }))
    )
    .filter(paragraph => paragraph.length > 0);
}

const inputCls = 'w-full bg-vault border border-border rounded-lg px-3 py-2.5 text-sm text-ghost placeholder:text-muted focus:outline-none focus:border-copper/60 transition-colors';
const labelCls = 'text-xs uppercase tracking-wider text-muted font-semibold mb-1.5 block';

export default function AnnouncementForm() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState('Thông báo');
  const [snoozeHours, setSnoozeHours] = useState(12);
  const [paragraphs, setParagraphs] = useState<EditParagraph[]>([blankParagraph()]);
  const [version, setVersion] = useState<number | null>(null);

  useEffect(() => {
    apiFetch('/api/admin/announcement')
      .then(r => r.json())
      .then(d => {
        if (d?.success && d.data) {
          const ann: Announcement = d.data;
          setEnabled(ann.enabled);
          setTitle(ann.title);
          setSnoozeHours(ann.snoozeHours);
          setParagraphs(toEditState(ann.body));
          setVersion(ann.version);
        }
      })
      .catch(() => toast.push('Không thể tải thông báo hiện tại.', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSegment = (pi: number, si: number, patch: Partial<EditSegment>) =>
    setParagraphs(prev => prev.map((p, i) => i !== pi ? p : p.map((s, j) => j !== si ? s : { ...s, ...patch })));

  const addSegment = (pi: number) =>
    setParagraphs(prev => prev.map((p, i) => i !== pi ? p : [...p, blankSegment()]));

  const removeSegment = (pi: number, si: number) =>
    setParagraphs(prev => prev.map((p, i) => i !== pi ? p : p.filter((_, j) => j !== si)));

  const addParagraph = () => setParagraphs(prev => [...prev, blankParagraph()]);
  const removeParagraph = (pi: number) => setParagraphs(prev => prev.filter((_, i) => i !== pi));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const payloadBody = toPayload(paragraphs);
    if (enabled && payloadBody.length === 0) {
      setError('Vui lòng thêm nội dung trước khi bật thông báo.');
      return;
    }

    setSaving(true);
    try {
      const r = await apiFetch('/api/admin/announcement', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, title, snoozeHours, body: payloadBody }),
      });
      const d = await r.json();
      if (d.success) {
        setVersion(d.data.version);
        toast.push('Đã lưu thông báo — hiển thị lại cho mọi khách đã từng đóng.', 'success');
        refreshAnnouncement();
      } else {
        setError(d.error ?? 'Lỗi lưu thông báo');
        toast.push(d.error ?? 'Lỗi lưu thông báo', 'error');
      }
    } catch {
      setError('Lỗi kết nối. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const previewBody = toPayload(paragraphs);

  if (loading) {
    return (
      <div className="p-4 sm:p-6 md:p-8 max-w-5xl">
        <div className="h-40 bg-surface border border-border rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="p-4 sm:p-6 md:p-8 max-w-5xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ghost">Thông Báo Popup</h1>
          <p className="text-ghost-dim text-sm mt-0.5">
            Popup hiển thị cho mọi khách truy cập trang chủ.
            {version !== null && <span className="text-muted"> · phiên bản hiện tại: v{version}</span>}
          </p>
        </div>
        <Button type="submit" loading={saving} loadingText="Đang lưu...">
          Lưu Thông Báo
        </Button>
      </div>

      {error && (
        <div className="slide-up mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        {/* ── Editor ── */}
        <div className="space-y-6 min-w-0">
          <section className="bg-surface border border-border rounded-xl p-5">
            <h2 className="font-heading text-sm font-bold text-ghost mb-4">Cài Đặt Chung</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="sm:col-span-2 flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={e => setEnabled(e.target.checked)}
                  className="w-4 h-4 accent-copper"
                />
                <span className="text-sm text-ghost">Bật thông báo (hiển thị cho khách truy cập)</span>
              </label>
              <div className="sm:col-span-2">
                <label className={labelCls}>Tiêu đề</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Thông báo" className={inputCls} maxLength={200} />
              </div>
              <div>
                <label className={labelCls}>Thời gian &quot;Đóng N giờ&quot;</label>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={snoozeHours}
                  onChange={e => setSnoozeHours(Math.max(1, Math.min(168, Number(e.target.value) || 1)))}
                  className={inputCls}
                />
                <p className="text-xs text-dim mt-1.5">Số giờ nút &quot;Đóng {snoozeHours} giờ&quot; sẽ tạm ẩn popup cho khách đã bấm.</p>
              </div>
            </div>
          </section>

          <section className="bg-surface border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading text-sm font-bold text-ghost">Nội Dung</h2>
              <span className="text-xs text-muted">Mỗi dòng có thể chứa nhiều đoạn nhỏ với màu/độ đậm/link khác nhau</span>
            </div>

            <div className="space-y-4">
              {paragraphs.map((paragraph, pi) => (
                <div key={pi} className="border border-border rounded-lg p-3 bg-vault/50">
                  <div className="space-y-2">
                    {paragraph.map((segment, si) => (
                      <div key={si} className="flex flex-wrap items-center gap-2">
                        <input
                          value={segment.text}
                          onChange={e => setSegment(pi, si, { text: e.target.value })}
                          placeholder="Nội dung..."
                          className={inputCls + ' flex-1 min-w-[160px]'}
                          maxLength={500}
                        />
                        <select
                          value={segment.tone}
                          onChange={e => setSegment(pi, si, { tone: e.target.value as AnnouncementTone })}
                          className={inputCls + ' w-auto shrink-0'}
                        >
                          {TONE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <label className="flex items-center gap-1.5 text-xs text-ghost-dim shrink-0 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={segment.bold}
                            onChange={e => setSegment(pi, si, { bold: e.target.checked })}
                            className="w-3.5 h-3.5 accent-copper"
                          />
                          Đậm
                        </label>
                        <input
                          value={segment.href}
                          onChange={e => setSegment(pi, si, { href: e.target.value })}
                          placeholder="Link (tuỳ chọn)"
                          className={inputCls + ' w-full sm:w-40 shrink-0'}
                        />
                        <button
                          type="button"
                          onClick={() => removeSegment(pi, si)}
                          disabled={paragraph.length === 1}
                          aria-label="Xóa đoạn nhỏ"
                          className="p-1.5 text-muted hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/60">
                    <button type="button" onClick={() => addSegment(pi)} className="text-xs text-copper-light hover:underline">
                      + Thêm đoạn nhỏ
                    </button>
                    <button
                      type="button"
                      onClick={() => removeParagraph(pi)}
                      disabled={paragraphs.length === 1}
                      className="text-xs text-red-400/80 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed ml-auto"
                    >
                      Xóa dòng
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button type="button" onClick={addParagraph} className="btn-ghost press-scale text-xs mt-4">
              + Thêm dòng mới
            </button>
          </section>
        </div>

        {/* ── Live preview ── */}
        <div className="lg:sticky lg:top-20 space-y-2">
          <span className={labelCls}>Xem trước</span>
          <div className="glass rounded-2xl p-6">
            <h2 className="font-heading text-base font-bold text-ghost mb-4 pr-6">{title || 'Thông báo'}</h2>
            <div className="max-h-[50vh] overflow-y-auto pr-1">
              <AnnouncementBody body={previewBody} />
            </div>
            <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-border">
              <span className="btn-copper text-xs sm:text-sm pointer-events-none opacity-90">Đóng {snoozeHours} giờ</span>
              <span className="btn-danger text-xs sm:text-sm pointer-events-none opacity-90">Đóng</span>
            </div>
          </div>
          {!enabled && (
            <p className="text-xs text-muted">Đang tắt — khách sẽ không thấy popup này cho đến khi bạn bật lại.</p>
          )}
        </div>
      </div>
    </form>
  );
}

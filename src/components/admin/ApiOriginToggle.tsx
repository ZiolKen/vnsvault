'use client';
import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { type ApiOriginMode, primeApiOriginOverride } from '@/lib/apiClient';

// Mirrors NEXT_PUBLIC_FALLBACK_ORIGIN — the switch only makes sense (and
// only renders) when a mirror deployment is actually configured, same
// condition apiClient.ts itself gates on.
const FALLBACK_ORIGIN = (process.env.NEXT_PUBLIC_FALLBACK_ORIGIN ?? '').replace(/\/$/, '');

const OPTIONS: { mode: ApiOriginMode; label: string }[] = [
  { mode: 'auto', label: 'Tự động' },
  { mode: 'primary', label: 'Primary' },
  { mode: 'fallback', label: 'Fallback' },
];

/**
 * Lets an admin force every visitor's browser (this is stored in Redis via
 * /api/admin/api-origin — see lib/apiOrigin.ts — not just this tab) to
 * send `/api/...` calls to the primary deployment or the backup mirror,
 * instead of waiting for the automatic platform-failure detection in
 * apiClient.ts to kick in.
 *
 * Deliberately uses plain `fetch()` here (via `/api/admin/api-origin`,
 * always same-origin) rather than `apiFetch` for its OWN reads/writes.
 * If this used `apiFetch`, then once mode is set to 'fallback' (and the
 * mirror turns out to be unreachable, e.g. a CORS misconfig) every
 * subsequent call THIS SWITCH makes — including the one meant to turn
 * 'fallback' back off — would itself try hitting the broken mirror first,
 * potentially locking an admin out of fixing their own toggle. Reading
 * and writing this control plane directly against primary sidesteps that
 * entirely.
 */
export default function ApiOriginToggle() {
  const toast = useToast();
  const [mode, setMode] = useState<ApiOriginMode>('auto');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ApiOriginMode | null>(null);

  useEffect(() => {
    fetch('/api/admin/api-origin', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d.success) setMode(d.data.mode); })
      .catch(() => toast.push('Không thể tải trạng thái nguồn API', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!FALLBACK_ORIGIN) return null;

  const select = async (next: ApiOriginMode) => {
    if (next === mode) return;
    setSaving(next);
    try {
      const res = await fetch('/api/admin/api-origin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.success) {
        setMode(next);
        primeApiOriginOverride(next); // this tab reflects it immediately
        toast.push(`Đã chuyển nguồn API sang: ${OPTIONS.find(o => o.mode === next)?.label}`, 'success');
      } else {
        toast.push(d?.error ?? 'Lỗi cập nhật', 'error');
      }
    } catch {
      toast.push('Lỗi kết nối', 'error');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="mb-8 flex items-center justify-between gap-4 p-4 bg-surface border border-border rounded-xl flex-wrap">
      <div>
        <p className="text-sm font-semibold text-ghost">🔀 Nguồn gọi API (áp dụng cho mọi người dùng)</p>
        <p className="text-xs text-ghost-dim mt-0.5">
          {loading && 'Đang tải...'}
          {!loading && mode === 'auto' && 'Tự động chuyển sang Fallback khi Primary gặp sự cố.'}
          {!loading && mode === 'primary' && 'Đang ép mọi request /api gọi thẳng vào Primary, kể cả khi lỗi.'}
          {!loading && mode === 'fallback' && `Đang ép mọi request /api gọi thẳng vào Fallback (${FALLBACK_ORIGIN}).`}
        </p>
      </div>
      <div className="flex gap-2">
        {OPTIONS.map(o => (
          <Button
            key={o.mode}
            variant={mode === o.mode ? 'copper' : 'ghost'}
            onClick={() => select(o.mode)}
            disabled={loading || saving !== null}
            className="text-xs px-3 py-1.5"
          >
            {saving === o.mode ? 'Đang lưu...' : o.label}
          </Button>
        ))}
      </div>
      <p className="w-full text-xs text-muted">
        Lưu ở Redis, có hiệu lực cho mọi trình duyệt trong tối đa ~5 giây (cache nhẹ phía client) — không cần redeploy.
      </p>
    </div>
  );
}

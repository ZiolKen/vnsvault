'use client';
import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import {
  type ApiOriginMode,
  getApiOriginOverride,
  setApiOriginOverride,
  onApiOriginOverrideChange,
} from '@/lib/apiClient';

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
 * Lets an admin force every subsequent `apiFetch` call (this tab + any
 * other open tab, since it's stored in localStorage) to hit the primary
 * deployment or the backup mirror, instead of waiting for the automatic
 * platform-failure detection in apiClient.ts to kick in. Useful for
 * confirming the mirror actually works before an outage, or for ruling
 * out the mirror while debugging something on primary.
 */
export default function ApiOriginToggle() {
  const [mode, setMode] = useState<ApiOriginMode>('auto');

  useEffect(() => {
    setMode(getApiOriginOverride());
    return onApiOriginOverrideChange(() => setMode(getApiOriginOverride()));
  }, []);

  if (!FALLBACK_ORIGIN) return null;

  return (
    <div className="mb-8 flex items-center justify-between gap-4 p-4 bg-surface border border-border rounded-xl flex-wrap">
      <div>
        <p className="text-sm font-semibold text-ghost">🔀 Nguồn gọi API</p>
        <p className="text-xs text-ghost-dim mt-0.5">
          {mode === 'auto' && 'Tự động chuyển sang Fallback khi Primary gặp sự cố.'}
          {mode === 'primary' && 'Đang ép mọi request /api gọi thẳng vào Primary, kể cả khi lỗi.'}
          {mode === 'fallback' && `Đang ép mọi request /api gọi thẳng vào Fallback (${FALLBACK_ORIGIN}).`}
        </p>
      </div>
      <div className="flex gap-2">
        {OPTIONS.map(o => (
          <Button
            key={o.mode}
            variant={mode === o.mode ? 'copper' : 'ghost'}
            onClick={() => setApiOriginOverride(o.mode)}
            className="text-xs px-3 py-1.5"
          >
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

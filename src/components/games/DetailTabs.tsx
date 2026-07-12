'use client';
import { useState, useEffect, type ReactNode } from 'react';

interface Props {
  /** Anchor id — the hero's primary download CTA links to #${id}. */
  id: string;
  introNode: ReactNode;
  downloadNode: ReactNode;
}

type Tab = 'intro' | 'download';

/**
 * Two tabs only — Giới thiệu / Tải Game. (No "Thư viện" or "Lịch sử dịch":
 * VNSVault doesn't have per-game media galleries or translation-history
 * logs, so those tabs from the reference design were dropped.)
 *
 * The hero's "TẢI GAME BẢN DỊCH" button is a plain #anchor link rather than
 * something wired to local state here — that keeps the two components
 * independent. On mount (and on further in-page hash changes) this just
 * checks the URL hash to decide which tab should be active.
 */
export default function DetailTabs({ id, introNode, downloadNode }: Props) {
  const [tab, setTab] = useState<Tab>('intro');

  useEffect(() => {
    const syncFromHash = () => {
      if (window.location.hash === `#${id}`) setTab('download');
    };
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, [id]);

  return (
    <div id={id}>
      <div className="flex border-b border-border mb-6" role="tablist" aria-label="Chi tiết game">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'intro'}
          onClick={() => setTab('intro')}
          className={`px-4 sm:px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'intro' ? 'border-copper text-copper-light' : 'border-transparent text-ghost-dim hover:text-ghost'
          }`}
        >
          Giới thiệu
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'download'}
          onClick={() => setTab('download')}
          className={`px-4 sm:px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'download' ? 'border-copper text-copper-light' : 'border-transparent text-ghost-dim hover:text-ghost'
          }`}
        >
          Tải Game
        </button>
      </div>

      <div role="tabpanel" hidden={tab !== 'intro'}>{introNode}</div>
      <div role="tabpanel" hidden={tab !== 'download'}>{downloadNode}</div>
    </div>
  );
}

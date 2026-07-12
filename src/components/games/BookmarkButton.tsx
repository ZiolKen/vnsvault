'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  gameSlug: string;
  initialBookmarked: boolean;
  loggedIn: boolean;
  /** Compact icon-only variant for use in cards/lists (e.g. /myaccount). */
  variant?: 'button' | 'icon';
  /** Called after a successful toggle — e.g. to remove the card from a list. */
  onToggled?: (bookmarked: boolean) => void;
}

export default function BookmarkButton({ gameSlug, initialBookmarked, loggedIn, variant = 'button', onToggled }: Props) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const toggle = async () => {
    if (!loggedIn) {
      router.push(`/login?redirect=/games/${gameSlug}`);
      return;
    }
    if (pending) return;
    setPending(true);
    const next = !bookmarked;
    setBookmarked(next); // optimistic
    try {
      const r = await fetch(`/api/games/${gameSlug}/bookmark`, { method: 'POST' });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.success) {
        setBookmarked(!next); // revert on failure
      } else {
        setBookmarked(d.data.bookmarked);
        onToggled?.(d.data.bookmarked);
      }
    } catch {
      setBookmarked(!next);
    } finally {
      setPending(false);
    }
  };

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={bookmarked}
        aria-label={bookmarked ? 'Bỏ yêu thích' : 'Yêu thích'}
        className={`p-2 rounded-lg border transition-colors shrink-0 ${
          bookmarked
            ? 'bg-copper/20 border-copper/40 text-copper-light'
            : 'bg-surface border-border text-muted hover:text-ghost-dim hover:border-copper/30'
        } disabled:opacity-60`}
      >
        <svg className="w-4 h-4" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={bookmarked}
      className={`btn-ghost w-full justify-center gap-2 ${bookmarked ? '!text-copper-light !border-copper/40 !bg-copper/10' : ''} disabled:opacity-60`}
    >
      <svg className="w-4 h-4" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" />
      </svg>
      {bookmarked ? 'Đã Yêu Thích' : 'Yêu Thích (Bookmark)'}
    </button>
  );
}

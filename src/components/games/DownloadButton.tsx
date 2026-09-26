'use client';
import Link from 'next/link';
import { platformLabel } from '@/lib/utils';
import type { Platform } from '@/types';
import { useGameAuth } from '@/components/games/GameAuthProvider';

interface DownloadLink {
  id: string;
  version: string;
  /** Host label shown to the visitor, e.g. "Google Drive", "Pixeldrain". */
  label?: string;
}

interface Props {
  gameSlug: string;
  platform: Platform;
  link: DownloadLink;
  gameTitle: string;
  /** When false, the real URL was withheld server-side — clicking goes to /login instead. */
  loggedIn: boolean;
}

/**
 * Client component.
 *
 * The real download URL is NEVER sent to the browser — not even for
 * logged-in users. This links to /api/games/[slug]/download/[id]
 * instead, a server route that resolves the real URL, wraps it through
 * the bbmkts "vượt link" service (or, for VIP accounts, skips wrapping
 * entirely) and redirects — see that route for details. It also bumps
 * download_count itself once it confirms a real redirect is happening,
 * so there's no separate fire-and-forget count request to make here
 * anymore.
 *
 * Anonymous visitors must log in to download: the page never sends them a
 * working link.id-based href in the first place (see games/[slug]/page.tsx),
 * so this renders a "Đăng nhập để tải" CTA instead.
 */
export default function DownloadButton({ gameSlug, platform, link, gameTitle, loggedIn: loggedInProp }: Props) {
  const auth = useGameAuth();
  const loggedIn = loggedInProp || auth.loggedIn;
  const displayLabel = link.label?.trim() || 'Link tải';

  if (!loggedIn) {
    return (
      <Link
        href={`/login?redirect=/games/${gameSlug}`}
        className="flex items-center gap-2 min-w-0 px-3 py-2.5 bg-surface text-muted border border-border rounded-lg hover:border-copper/30 hover:text-ghost-dim transition-colors text-sm font-medium"
        aria-label={`Đăng nhập để tải ${gameTitle} phiên bản ${link.version} (${displayLabel}) cho ${platformLabel(platform)}`}
      >
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-12V7a4 4 0 10-8 0v4h8z" />
        </svg>
        <span className="truncate">Đăng nhập để tải · {displayLabel}</span>
      </Link>
    );
  }

  return (
    <a
      href={`/api/games/${gameSlug}/download/${link.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 min-w-0 px-3 py-2.5 bg-copper/15 text-copper-light border border-copper/30 rounded-lg hover:bg-copper/25 transition-colors text-sm font-medium"
      aria-label={`Tải ${gameTitle} phiên bản ${link.version} (${displayLabel}) cho ${platformLabel(platform)}`}
    >
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      <span className="truncate">{displayLabel}</span>
    </a>
  );
}

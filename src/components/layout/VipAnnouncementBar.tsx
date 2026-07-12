'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

// Bumped whenever the copy changes meaningfully, so a returning visitor
// who dismissed an older announcement sees the new one instead of it
// staying hidden forever.
const DISMISS_KEY = 'vns_vip_banner_dismissed_v1';

/**
 * Slim, dismissible promo strip announcing VIP (no-link-bypass downloads).
 * Sits fixed just below the main Navbar (which is itself `fixed h-16`) so
 * it works on every page without needing every page's own `pt-16` spacer
 * touched. It's short and dismissible, so the minor overlap with the very
 * top of each page's hero content is a fair trade — same pattern most
 * sites use for a persistent-but-closable promo bar.
 *
 * Hidden on /donate (which already has its own, more detailed VIP notice
 * + pricing table) and /admin/* (internal tooling, not a storefront).
 */
export default function VipAnnouncementBar() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(DISMISS_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const hiddenHere = pathname === '/donate' || pathname?.startsWith('/admin');
  if (!visible || hiddenHere) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setVisible(false);
  };

  return (
    <div className="fixed top-16 inset-x-0 z-40 bg-copper/15 backdrop-blur-sm border-b border-copper/30">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3">
        <span className="text-base shrink-0" aria-hidden="true">👑</span>
        <p className="flex-1 min-w-0 text-xs sm:text-sm text-ghost-dim truncate">
          <span className="text-copper-light font-semibold">Đã mở gói VIP</span>
          {' '}— tải game trực tiếp, không cần vượt link quảng cáo.{' '}
          <Link href="/donate" className="underline hover:text-copper-light whitespace-nowrap">
            Đăng ký ngay →
          </Link>
        </p>
        <button
          onClick={dismiss}
          aria-label="Đóng thông báo"
          className="p-1 text-muted hover:text-ghost transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

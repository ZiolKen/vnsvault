'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

// Bumped whenever the copy changes meaningfully, so a returning visitor
// who dismissed an older announcement sees the new one instead of it
// staying hidden forever.
const DISMISS_KEY = 'vns_vip_banner_dismissed_v1';

/**
 * Slim, dismissible promo strip announcing VIP (no-link-bypass downloads).
 * Sits fixed just below the main Navbar (which is itself `fixed h-16`).
 *
 * It measures its own rendered height and publishes it to the `--vip-banner-h`
 * CSS variable on <html>. The root layout uses that variable as extra top
 * padding on the page-content wrapper, so every page automatically reserves
 * just enough space for the banner — no overlap with hero content, no need
 * to touch every page's own `pt-16` spacer. When the banner is hidden,
 * dismissed, or unmounted (route change), the variable resets to 0px and
 * the reserved space collapses again.
 *
 * Hidden on /donate (which already has its own, more detailed VIP notice
 * + pricing table) and /admin/* (internal tooling, not a storefront).
 */
export default function VipAnnouncementBar() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (!localStorage.getItem(DISMISS_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const hiddenHere = pathname === '/donate' || pathname?.startsWith('/admin');
  const shown = visible && !hiddenHere;

  // Keep --vip-banner-h in sync with the banner's real, rendered height
  // (it can wrap to two lines on narrow screens) so reserved page padding
  // always matches exactly. Resets to 0px whenever the banner isn't shown.
  useEffect(() => {
    const root = document.documentElement;
    if (!shown || !barRef.current) {
      root.style.setProperty('--vip-banner-h', '0px');
      return;
    }
    const el = barRef.current;
    const sync = () => root.style.setProperty('--vip-banner-h', `${el.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty('--vip-banner-h', '0px');
    };
  }, [shown]);

  if (!shown) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setVisible(false);
  };

  return (
    <div ref={barRef} className="fixed top-16 inset-x-0 z-40 bg-copper/15 backdrop-blur-sm border-b border-copper/30">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3">
        <span className="text-base shrink-0" aria-hidden="true">👑</span>
        <p className="flex-1 min-w-0 text-xs sm:text-sm text-ghost-dim truncate">
          <span className="text-copper-light font-semibold">Đã có gói VIP</span>
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

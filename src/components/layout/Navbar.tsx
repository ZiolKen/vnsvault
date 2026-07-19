'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { canOptimizeImage } from '@/lib/utils';

interface NavUser { username: string; role: string; avatar_url?: string; }

const NAV_LINKS = [
  { href: '/games', label: 'Thư Viện' },
  { href: '/requests', label: 'Đề Xuất' },
  { href: '/donate', label: 'Ủng Hộ' },
];

const NAV_USER_REFRESH_EVENT = 'vnsvault:refresh-nav-user';

/**
 * Call this after any change that re-signs the session cookie client-side
 * without a full page navigation (currently: avatar update on
 * /myaccount) so Navbar picks it up immediately instead of showing stale
 * data until the next full reload.
 */
export function refreshNavUser() {
  window.dispatchEvent(new Event(NAV_USER_REFRESH_EVENT));
}

export default function Navbar() {
  const [user, setUser] = useState<NavUser | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); setUserMenuOpen(false); }, [pathname]);

  // Detect scroll for nav shadow
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // Auto-focus search input when opened
  useEffect(() => { if (searchOpen) setTimeout(() => searchRef.current?.focus(), 50); }, [searchOpen]);

  // Close mobile menu + lock body scroll
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    // A transient DB hiccup (cold pool connection, brief shard timeout)
    // returns 500/network-error — that is NOT the same as "not logged in"
    // (401) and must not flip the UI to logged-out. Retry transient
    // failures a couple times before giving up silently.
    async function loadUser(attempt = 0) {
      try {
        const r = await fetch('/api/auth/me', { cache: 'no-store', signal: controller.signal });
        if (r.status === 401) {
          if (!cancelled) setUser(null); // definitively not logged in
          return;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (!cancelled && d?.success) setUser(d.data);
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return;
        if (attempt < 2) setTimeout(() => loadUser(attempt + 1), 500 * (attempt + 1));
      }
    }

    loadUser();

    // Navbar only fetches /api/auth/me once on mount — fine for a fresh
    // page load, but a client-side-only change (e.g. picking a new avatar
    // on /myaccount, which re-signs the session cookie server-side but
    // doesn't trigger a full page navigation) would otherwise leave this
    // component showing the stale avatar/username until the next full
    // reload. `refreshNavUser()` (exported below) dispatches this event
    // from wherever the profile actually changes, so Navbar re-fetches
    // immediately instead of requiring a manual refresh.
    const onRefresh = () => loadUser();
    window.addEventListener(NAV_USER_REFRESH_EVENT, onRefresh);

    return () => {
      cancelled = true;
      controller.abort();
      window.removeEventListener(NAV_USER_REFRESH_EVENT, onRefresh);
    };
  }, []);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setUserMenuOpen(false);
    router.refresh();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/games?q=${encodeURIComponent(query.trim())}`);
      setSearchOpen(false);
      setQuery('');
    }
  };

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <>
      <nav
        className={`fixed top-0 inset-x-0 z-50 glass border-b border-border/60 transition-shadow duration-300 ${scrolled ? 'shadow-xl shadow-black/40' : ''}`}
        role="navigation"
        aria-label="Điều hướng chính"
      >
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-3">
          {/* ── Logo ── */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0 min-h-[44px]" aria-label="VNSVault – Trang chủ">
            <Image src="/logo.png" alt="" width={34} height={34} className="drop-shadow-lg" aria-hidden="true" />
            <span className="font-cinzel text-base font-semibold text-copper-light tracking-wide hidden sm:block select-none">
              VNSVault
            </span>
          </Link>

          {/* ── Desktop nav ── */}
          <div className="hidden md:flex items-center gap-0.5 ml-3" role="list">
            {NAV_LINKS.map(l => (
              <Link
                key={l.href}
                href={l.href}
                role="listitem"
                className={`px-3 py-2 text-sm rounded-md transition-colors min-h-[40px] flex items-center ${
                  isActive(l.href)
                    ? 'text-copper-light bg-copper/10'
                    : 'text-ghost-dim hover:text-ghost hover:bg-surface'
                }`}
                aria-current={isActive(l.href) ? 'page' : undefined}
              >
                {l.label}
              </Link>
            ))}
          </div>

          <div className="flex-1" />

          {/* ── Search toggle ── */}
          <button
            onClick={() => setSearchOpen(s => !s)}
            className="p-2.5 text-ghost-dim hover:text-copper-light transition-colors rounded-lg hover:bg-surface min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label={searchOpen ? 'Đóng tìm kiếm' : 'Mở tìm kiếm'}
            aria-expanded={searchOpen}
          >
            {searchOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </button>

          {/* ── Auth (desktop) ── */}
          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(s => !s)}
                  className="flex items-center gap-2 px-3 py-2 rounded-md bg-surface border border-border hover:border-copper/40 transition-colors text-sm min-h-[40px]"
                  aria-expanded={userMenuOpen}
                  aria-haspopup="menu"
                >
                  <span className="w-6 h-6 rounded-full bg-copper/20 flex items-center justify-center text-copper-light text-xs font-bold overflow-hidden shrink-0" aria-hidden="true">
                    {user.avatar_url
                      ? <Image src={user.avatar_url} alt="" width={24} height={24} unoptimized={!canOptimizeImage(user.avatar_url)} className="object-cover w-full h-full" />
                      : user.username[0].toUpperCase()}
                  </span>
                  <span className="text-ghost-dim max-w-[100px] truncate">{user.username}</span>
                  <svg className={`w-3.5 h-3.5 text-muted transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} aria-hidden="true" />
                    <div className="absolute right-0 mt-2 w-48 glass rounded-lg overflow-hidden shadow-2xl z-20 slide-up" role="menu">
                      <Link href="/myaccount" role="menuitem"
                        className="flex items-center gap-2 px-4 py-3 text-sm text-ghost-dim hover:bg-surface hover:text-ghost transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        Tài Khoản Của Tôi
                      </Link>
                      {user.role === 'admin' && (
                        <Link href="/admin" role="menuitem"
                          className="flex items-center gap-2 px-4 py-3 text-sm text-copper-light hover:bg-surface transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          Admin Panel
                        </Link>
                      )}
                      <button onClick={logout} role="menuitem"
                        className="w-full flex items-center gap-2 px-4 py-3 text-sm text-ghost-dim hover:bg-surface hover:text-ghost transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                        Đăng xuất
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                <Link href="/login" className="px-3 py-2 text-sm text-ghost-dim hover:text-ghost transition-colors min-h-[40px] flex items-center">
                  Đăng nhập
                </Link>
                <Link href="/register" className="px-3 py-2 text-sm rounded-md bg-copper/20 text-copper-light border border-copper/40 hover:bg-copper/30 transition-colors min-h-[40px] flex items-center">
                  Đăng ký
                </Link>
              </>
            )}
          </div>

          {/* ── Mobile hamburger ── */}
          <button
            onClick={() => setMobileOpen(s => !s)}
            className="md:hidden p-2.5 text-ghost-dim hover:text-ghost rounded-lg hover:bg-surface transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label={mobileOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d={mobileOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
            </svg>
          </button>
        </div>

        {/* ── Search dropdown ── */}
        {searchOpen && (
          <div className="border-t border-border/50 px-4 py-3 slide-up">
            <form onSubmit={handleSearch} className="max-w-2xl mx-auto flex gap-2" role="search">
              <label htmlFor="nav-search" className="sr-only">Tìm kiếm game</label>
              <input
                id="nav-search"
                ref={searchRef}
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Tìm theo tên game, developer, engine..."
                className="input-base flex-1"
                autoComplete="off"
              />
              <button type="submit" className="btn-copper px-4 py-2 text-sm">
                Tìm
              </button>
            </form>
          </div>
        )}
      </nav>

      {/* ── Mobile menu overlay ── */}
      {mobileOpen && (
        <div className="drawer-overlay md:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      {/* ── Mobile menu drawer ── */}
      <div
        id="mobile-menu"
        className={`fixed top-16 right-0 bottom-0 w-72 max-w-[85vw] z-50 glass border-l border-border/60 flex flex-col transition-transform duration-300 md:hidden ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`}
        aria-hidden={!mobileOpen}
        role="dialog"
        aria-label="Menu điều hướng"
      >
        <nav className="flex-1 overflow-y-auto p-4" aria-label="Menu mobile">
          {/* Nav links */}
          <div className="space-y-1 mb-6">
            {NAV_LINKS.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-lg text-sm transition-colors ${
                  isActive(l.href)
                    ? 'bg-copper/15 text-copper-light'
                    : 'text-ghost-dim hover:bg-surface hover:text-ghost'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>

          <hr className="border-border/40 mb-6" />

          {/* Auth section */}
          {user ? (
            <div className="space-y-1">
              <div className="flex items-center gap-3 px-4 py-3 mb-2">
                <span className="w-9 h-9 rounded-full bg-copper/20 flex items-center justify-center text-copper-light font-bold" aria-hidden="true">
                  {user.username[0].toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-medium text-ghost">{user.username}</p>
                  <p className="text-xs text-muted capitalize">{user.role}</p>
                </div>
              </div>
              <Link href="/myaccount" className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-ghost-dim hover:bg-surface hover:text-ghost transition-colors">
                👤 Tài Khoản Của Tôi
              </Link>
              {user.role === 'admin' && (
                <Link href="/admin" className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-copper-light hover:bg-surface transition-colors">
                  ⚙ Admin Panel
                </Link>
              )}
              <button onClick={logout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-ghost-dim hover:bg-surface hover:text-ghost transition-colors">
                Đăng xuất
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <Link href="/login" className="flex justify-center items-center px-4 py-3 rounded-lg text-sm border border-border text-ghost-dim hover:border-copper/40 hover:text-ghost transition-colors">
                Đăng nhập
              </Link>
              <Link href="/register" className="flex justify-center items-center px-4 py-3 rounded-lg text-sm bg-copper/20 text-copper-light border border-copper/40 hover:bg-copper/30 transition-colors">
                Tạo tài khoản
              </Link>
            </div>
          )}
        </nav>

        {/* Bottom branding */}
        <div className="p-4 border-t border-border/40">
          <p className="text-xs text-muted text-center">VNSVault © 2026</p>
        </div>
      </div>
    </>
  );
}

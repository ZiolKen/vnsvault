'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/admin',           label: '📊 Dashboard' },
  { href: '/admin/games',     label: '🎮 Quản lý Game' },
  { href: '/admin/games/new', label: '➕ Thêm Game' },
  { href: '/admin/requests',  label: '💬 Đề Xuất Game' },
  { href: '/admin/reports',   label: '🚩 Báo Lỗi Link' },
  { href: '/admin/users',     label: '👑 Quản Lý VIP' },
  { href: '/admin/announcement', label: '📢 Thông Báo' },
];

function SidebarContent({ username, onClose }: { username: string; onClose?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="p-4 border-b border-border flex items-center justify-between gap-2">
        <Link href="/" className="flex items-center gap-2 min-w-0" onClick={onClose}>
          <Image src="/logo.png" alt="VNSVault" width={26} height={26} className="shrink-0" />
          <div className="min-w-0">
            <span className="font-cinzel text-sm font-semibold text-copper-light block">VNSVault</span>
            <span className="text-xs text-muted">Admin Panel</span>
          </div>
        </Link>
        {onClose && (
          <button onClick={onClose} aria-label="Đóng menu"
            className="p-1.5 rounded-lg text-ghost-dim hover:text-ghost hover:bg-surface transition-colors shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="p-3 flex-1 space-y-0.5" aria-label="Admin navigation">
        {NAV_ITEMS.map(l => (
          <Link key={l.href} href={l.href} onClick={onClose}
            className={`block px-3 py-2.5 rounded-lg text-sm transition-colors ${
              isActive(l.href)
                ? 'bg-copper/15 text-copper-light border border-copper/25'
                : 'text-ghost-dim hover:bg-surface hover:text-ghost'
            }`}>
            {l.label}
          </Link>
        ))}
        <div className="pt-3 border-t border-border mt-3">
          <Link href="/" onClick={onClose}
            className="block px-3 py-2.5 rounded-lg text-sm text-ghost-dim hover:bg-surface hover:text-ghost transition-colors">
            ← Về trang chủ
          </Link>
        </div>
      </nav>

      {/* User avatar */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="w-7 h-7 rounded-full bg-copper/20 flex items-center justify-center text-copper-light text-xs font-bold shrink-0">
            {username[0].toUpperCase()}
          </span>
          <span className="text-xs text-ghost-dim truncate">{username}</span>
        </div>
      </div>
    </div>
  );
}

export default function AdminLayoutClient({
  children,
  username,
}: {
  children: React.ReactNode;
  username: string;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setDrawerOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  return (
    <div className="min-h-screen flex bg-obsidian">
      {/* Desktop sidebar (md+) */}
      <aside className="hidden md:flex md:flex-col w-56 shrink-0 bg-vault border-r border-border pt-16">
        <SidebarContent username={username} />
      </aside>

      {/* Mobile: overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden"
          onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      )}

      {/* Mobile: slide-in drawer */}
      <aside
        className={`fixed top-16 left-0 bottom-0 z-50 w-64 bg-vault border-r border-border flex flex-col
          transition-transform duration-300 ease-out md:hidden
          ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="Admin sidebar"
        aria-hidden={!drawerOpen}
        role="dialog"
      >
        <SidebarContent username={username} onClose={() => setDrawerOpen(false)} />
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col pt-16">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-16 z-30 flex items-center gap-3 px-4 h-14
          bg-vault border-b border-border shrink-0">
          <button onClick={() => setDrawerOpen(true)} aria-label="Mở menu admin"
            aria-expanded={drawerOpen}
            className="p-2 rounded-lg text-ghost-dim hover:text-ghost hover:bg-surface transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="VNSVault" width={22} height={22} />
            <span className="font-cinzel text-sm font-semibold text-copper-light">Admin</span>
          </Link>
          <span className="ml-auto text-xs text-muted truncate">{username}</span>
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

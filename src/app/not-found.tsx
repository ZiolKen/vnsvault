import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';

// NOTE: Navbar lives in the root layout and persists across navigations —
// do NOT mount another one here. A second instance would start with
// `user = null` and briefly look like a fake logout (see app/layout.tsx).
export const metadata: Metadata = {
  title: '404 – Không tìm thấy trang',
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main className="flex-1 pt-16 flex items-center justify-center px-4" role="main">
      <div className="text-center max-w-lg fade-in">
        <div className="relative w-32 h-32 mx-auto mb-8">
          <Image src="/logo.png" alt="" fill className="object-contain opacity-20" aria-hidden="true" />
          <span className="absolute inset-0 flex items-center justify-center font-cinzel text-5xl font-black text-copper/30 select-none">
            404
          </span>
        </div>
        <h1 className="font-heading text-3xl font-bold text-ghost mb-3">Trang Không Tìm Thấy</h1>
        <p className="text-ghost-dim leading-relaxed mb-8">
          Trang bạn đang tìm kiếm có thể đã bị xóa, đổi tên, hoặc chưa được tạo. Hãy quay lại kho báu của chúng ta.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link href="/" className="btn-copper">Về Trang Chủ</Link>
          <Link href="/games" className="btn-ghost">Thư Viện Game</Link>
        </div>
        {/* Quick links */}
        <div className="mt-10 pt-8 border-t border-border/40">
          <p className="text-xs text-muted mb-4 uppercase tracking-widest">Có thể bạn muốn xem</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {[
              { href: '/games?sort=download_count', label: 'Game Hot' },
              { href: '/games?featured=true', label: 'Game Đặc Sắc' },
              { href: '/requests', label: 'Đề Xuất Game' },
              { href: '/donate', label: 'Ủng Hộ' },
            ].map(l => (
              <Link key={l.href} href={l.href}
                className="text-sm px-3 py-1.5 bg-surface border border-border rounded-lg text-ghost-dim hover:border-copper/40 hover:text-copper-light transition-colors">
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

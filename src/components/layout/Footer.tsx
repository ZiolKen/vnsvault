import Link from 'next/link';
import Image from 'next/image';

const PLATFORM_LINKS = [
  { href: '/games', label: 'Thư Viện Game' },
  { href: '/games?sort=download_count', label: 'Game Hot' },
  { href: '/games?featured=true', label: 'Game Đặc Sắc' },
  { href: '/requests', label: 'Đề Xuất Game' },
  { href: '/donate', label: 'Ủng Hộ Website' },
];
const COMMUNITY_LINKS = [
  { href: '/login', label: 'Đăng Nhập' },
  { href: '/register', label: 'Tạo Tài Khoản' },
  { href: '/terms', label: 'Điều Khoản' },
  { href: 'https://t.me/ZiolKen', label: 'Liên Hệ' },
  { href: 'mailto:contact@ziolken.qzz.io', label: 'Email' },
];
const GENRE_LINKS = [
  { href: '/games?genre=romance', label: 'Romance' },
  { href: '/games?genre=drama', label: 'Drama' },
  { href: '/games?genre=fantasy', label: 'Fantasy' },
  { href: '/games?genre=horror', label: 'Horror' },
  { href: '/games?genre=sci-fi', label: 'Sci-Fi' },
  { href: '/games?genre=slice-of-life', label: 'Slice of Life' },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border/60 bg-vault/80" role="contentinfo">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 mb-4 w-fit" aria-label="VNSVault trang chủ">
              <Image src="/logo.png" alt="VNSVault logo" width={32} height={32} className="opacity-90" />
              <span className="font-cinzel text-base font-semibold text-copper-light">VNSVault</span>
            </Link>
            <p className="text-sm text-ghost-dim leading-relaxed mb-4">
              Kho tàng Visual Novel được Việt hóa. Miễn phí, không quảng cáo.
            </p>
            {/* Trust badges */}
            <div className="flex flex-wrap gap-2">
              {['100% Miễn Phí', 'Không Ads'].map(b => (
                <span key={b} className="text-xs px-2 py-1 bg-copper/10 text-copper-light border border-copper/20 rounded-full">
                  {b}
                </span>
              ))}
            </div>
          </div>

          {/* Platform */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">Nền Tảng</p>
            <nav aria-label="Footer navigation – Nền tảng">
              <ul className="flex flex-col gap-2.5" role="list">
                {PLATFORM_LINKS.map(l => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-ghost-dim hover:text-copper-light transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          {/* Genres */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">Thể Loại</p>
            <nav aria-label="Footer navigation – Thể loại">
              <ul className="flex flex-col gap-2.5" role="list">
                {GENRE_LINKS.map(l => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-ghost-dim hover:text-copper-light transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          {/* Community */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">Cộng Đồng</p>
            <nav aria-label="Footer navigation – Cộng đồng">
              <ul className="flex flex-col gap-2.5" role="list">
                {COMMUNITY_LINKS.map(l => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-ghost-dim hover:text-copper-light transition-colors">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-6 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted text-center sm:text-left">
            © {year} VNSVault | All Rights Reserved
          </p>
        </div>
      </div>
    </footer>
  );
}

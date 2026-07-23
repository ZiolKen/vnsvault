import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import GameCard from '@/components/games/GameCard';
import { formatNumber } from '@/lib/utils';

import { getHotGames, getFeaturedGames, getNewGames, getSiteStats } from '@/lib/queries';

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  alternates: { canonical: BASE },
};

// Revalidate page every 5 minutes (ISR)
export const revalidate = 300;

async function getData() {
  try {
    const [hotGames, featuredGames, newGames, siteStats] = await Promise.all([
      getHotGames(8),
      getFeaturedGames(4),
      getNewGames(8),
      getSiteStats(),
    ]);
    return { hotGames, featuredGames, newGames, siteStats };
  } catch {
    return { hotGames: [], featuredGames: [], newGames: [], siteStats: { totalGames: 0, totalDownloads: 0 } };
  }
}

export default async function HomePage() {
  const { hotGames, featuredGames, newGames, siteStats } = await getData();
  const hero = featuredGames[0] ?? hotGames[0];

  const stats = [
    { label: 'Game đã dịch', value: siteStats.totalGames > 0 ? `${siteStats.totalGames}+` : '–' },
    { label: 'Tổng lượt tải', value: siteStats.totalDownloads > 0 ? formatNumber(siteStats.totalDownloads) : '0' },
    { label: 'Miễn phí', value: '100%' },
    { label: 'Không quảng cáo', value: '✓' },
  ];

  return (
    <main id="main-content" className="flex-1">
      {/* ── Hero ──────────────────────────────────────────── */}
      <section
          className="relative min-h-[100svh] flex items-end pb-16 sm:pb-24 pt-16 overflow-hidden"
          aria-labelledby="hero-heading"
        >
          {/* BG image */}
          <div className="absolute inset-0" aria-hidden="true">
            <Image
              src="/bg.jpg"
              alt=""
              fill
              className="object-cover object-center opacity-35"
              priority
              sizes="100vw"
              quality={85}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/65 to-obsidian/15" />
            <div className="absolute inset-0 bg-gradient-to-r from-obsidian/85 via-obsidian/30 to-transparent" />
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-4 w-full">
            <div className="max-w-xl">
              {/* Eyebrow */}
              <div className="flex items-center gap-2 mb-5" aria-hidden="true">
                <span className="w-8 h-px bg-copper" />
                <span className="text-xs font-semibold uppercase tracking-widest text-copper-light">Visual Novel Vault</span>
              </div>

              <h1 id="hero-heading" className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold text-ghost leading-[1.1] mb-5">
                VNS<span className="text-copper-light text-glow-copper">Vault</span>
              </h1>

              <p className="text-base sm:text-lg text-ghost-dim leading-relaxed mb-8 max-w-md">
                Kho tàng Visual Novel được Việt hóa. Miễn phí, chất lượng cao, không quảng cáo.
              </p>

              <div className="flex flex-wrap gap-3">
                <Link href="/games" className="btn-copper px-6 py-3 text-sm sm:text-base" aria-label="Khám phá thư viện game">
                  Khám Phá Ngay
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
                <Link href="/games?sort=download_count" className="btn-ghost px-6 py-3 text-sm sm:text-base">
                  🔥 Game Hot
                </Link>
              </div>

              {/* Stats */}
              <div className="flex flex-wrap gap-6 mt-10" role="list" aria-label="Thống kê VNSVault">
                {stats.map(s => (
                  <div key={s.label} role="listitem">
                    <p className="font-cinzel text-xl sm:text-2xl font-bold text-copper-light">{s.value}</p>
                    <p className="text-xs text-ghost-dim mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Floating featured card – desktop only */}
            {hero && (
              <Link
                href={`/games/${hero.slug}`}
                className="hidden lg:block absolute bottom-20 right-4 w-52 glass rounded-xl overflow-hidden hover:border-copper/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-copper/20 group fade-in"
                aria-label={`Game nổi bật: ${hero.title}`}
              >
                <div className="vault-overlay relative aspect-[3/4]">
                  {hero.cover_url ? (
                    <Image src={hero.cover_url} alt={`Ảnh bìa ${hero.title}`} fill unoptimized className="object-cover group-hover:scale-105 transition-transform duration-500" sizes="208px" />
                  ) : (
                    <div className="absolute inset-0 bg-vault flex items-center justify-center">
                      <span className="font-cinzel text-3xl text-dim" aria-hidden="true">VN</span>
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-xs text-copper-light font-semibold uppercase tracking-wider mb-0.5" aria-hidden="true">Nổi bật</p>
                  <p className="font-heading text-sm text-ghost font-medium line-clamp-2">{hero.title}</p>
                </div>
              </Link>
            )}
          </div>
        </section>

        {/* ── Hot Rankings ────────────────────────────────── */}
        {hotGames.length > 0 && (
          <section className="max-w-7xl mx-auto px-4 py-14 sm:py-16 w-full" aria-labelledby="hot-heading">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1" aria-hidden="true">
                  <span className="w-5 h-px bg-copper" />
                  <span className="text-xs uppercase tracking-widest text-copper-light font-semibold">Game Hot</span>
                </div>
                <h2 id="hot-heading" className="font-heading text-xl sm:text-2xl font-bold text-ghost">Được Tải Nhiều Nhất</h2>
              </div>
              <Link href="/games?sort=download_count" className="text-sm text-ghost-dim hover:text-copper-light transition-colors">
                Xem tất cả →
              </Link>
            </div>

            {/* Top 4 rank strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-8">
              {hotGames.slice(0, 4).map((g, i) => (
                <Link
                  key={g.id}
                  href={`/games/${g.slug}`}
                  className="flex items-center gap-3 p-3 bg-surface border border-border rounded-lg hover:border-copper/40 transition-colors group"
                  aria-label={`#${i + 1} ${g.title} – ${formatNumber(g.download_count)} lượt tải`}
                >
                  <span className="font-cinzel text-xl sm:text-2xl font-bold text-copper/35 group-hover:text-copper transition-colors shrink-0 w-8 text-right" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ghost truncate group-hover:text-copper-light transition-colors">{g.title}</p>
                    <p className="text-xs text-muted">↓ {formatNumber(g.download_count)}</p>
                  </div>
                </Link>
              ))}
            </div>

            {/* Game cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {hotGames.slice(0, 8).map((g, i) => (
                <GameCard
                  key={g.id}
                  game={g}
                  rank={i + 1}
                  className="stagger-child"
                  style={{ '--stagger-index': i } as CSSProperties}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Featured ────────────────────────────────────── */}
        {featuredGames.length > 0 && (
          <section className="max-w-7xl mx-auto px-4 pb-14 sm:pb-16 w-full" aria-labelledby="featured-heading">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1" aria-hidden="true">
                  <span className="w-5 h-px bg-copper" />
                  <span className="text-xs uppercase tracking-widest text-copper-light font-semibold">Đặc Sắc</span>
                </div>
                <h2 id="featured-heading" className="font-heading text-xl sm:text-2xl font-bold text-ghost">Được Chọn Lọc</h2>
              </div>
              <Link href="/games?featured=true" className="text-sm text-ghost-dim hover:text-copper-light transition-colors">
                Xem thêm →
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {featuredGames.map((g, i) => (
                <GameCard
                  key={g.id}
                  game={g}
                  className="stagger-child"
                  style={{ '--stagger-index': i } as CSSProperties}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── New Arrivals ────────────────────────────────── */}
        {newGames.length > 0 && (
          <section className="max-w-7xl mx-auto px-4 pb-14 sm:pb-16 w-full" aria-labelledby="new-heading">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1" aria-hidden="true">
                  <span className="w-5 h-px bg-copper" />
                  <span className="text-xs uppercase tracking-widest text-copper-light font-semibold">Mới Cập Nhật</span>
                </div>
                <h2 id="new-heading" className="font-heading text-xl sm:text-2xl font-bold text-ghost">Mới Thêm Vào Kho</h2>
              </div>
              <Link href="/games?sort=created_at" className="text-sm text-ghost-dim hover:text-copper-light transition-colors">
                Xem tất cả →
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {newGames.map((g, i) => (
                <GameCard
                  key={g.id}
                  game={g}
                  className="stagger-child"
                  style={{ '--stagger-index': i } as CSSProperties}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Empty state ─────────────────────────────────── */}
        {hotGames.length === 0 && featuredGames.length === 0 && newGames.length === 0 && (
          <section className="max-w-7xl mx-auto px-4 py-24 text-center" aria-labelledby="empty-heading">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-copper/10 mb-6" aria-hidden="true">
              <Image src="/logo.png" alt="" width={40} height={40} className="opacity-60" />
            </div>
            <h2 id="empty-heading" className="font-heading text-2xl font-bold text-ghost mb-3">Kho Báu Đang Được Xây Dựng</h2>
            <p className="text-ghost-dim mb-6">Chưa có game nào được đăng. Admin hãy thêm game đầu tiên!</p>
            <Link href="/admin" className="btn-ghost text-sm">Admin Panel →</Link>
          </section>
        )}

        {/* ── CTA Banner ──────────────────────────────────── */}
        <section
          className="relative overflow-hidden border-y border-border/40"
          aria-labelledby="cta-heading"
          style={{ background: 'linear-gradient(135deg, rgba(184,115,51,0.08) 0%, transparent 60%)' }}
        >
          <div className="max-w-7xl mx-auto px-4 py-14 sm:py-16">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="max-w-md">
                <h2 id="cta-heading" className="font-heading text-xl sm:text-2xl font-bold text-ghost mb-3">
                  Muốn Ủng Hộ Website?
                </h2>
                <p className="text-ghost-dim text-sm leading-relaxed">
                  Mỗi khoản ủng hộ nhỏ đều giúp duy trì server và tạo động lực để ra thêm nhiều bản dịch chất lượng cao.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 shrink-0">
                <Link href="/donate" className="btn-copper">❤ Ủng Hộ Ngay</Link>
                <Link href="/requests" className="btn-ghost">Đề Xuất Game</Link>
              </div>
            </div>
          </div>
      </section>
    </main>
  );
}

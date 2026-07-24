import { notFound } from 'next/navigation';
import { cache } from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { Game, Platform } from '@/types';
import {
  statusLabel, statusColor, engineLabel,
  platformLabel, formatNumber, formatDate, safeJsonLd, canOptimizeImage,
} from '@/lib/utils';
import DownloadButton from '@/components/games/DownloadButton';
import BookmarkButton from '@/components/games/BookmarkButton';
import ReportLinkButton from '@/components/games/ReportLinkButton';
import DetailTabs from '@/components/games/DetailTabs';
import { getGameBySlug, isBookmarkedByUser, bumpGameViewCount } from '@/lib/queries';
import { getSession } from '@/lib/jwt';

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
interface Props { params: Promise<{ slug: string }> }
const getGame = cache(async (slug: string) => getGameBySlug(slug));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) return { title: 'Không tìm thấy game', robots: { index: false } };
  const desc = game.description?.replace(/\s+/g, ' ').slice(0, 160) ?? `"${game.title}" được Việt hóa tại VNSVault.`;
  const image = game.cover_url || game.banner_url;
  const url = `${BASE}/games/${slug}`;
  return {
    title: game.title, description: desc,
    keywords: [game.title, 'visual novel', 'việt hóa', game.engine ?? '', ...(game.genres?.map(g => g.name) ?? [])],
    alternates: { canonical: url },
    openGraph: { type: 'article', url, title: `${game.title} | VNSVault`, description: desc, locale: 'vi_VN', siteName: 'VNSVault',
      images: image ? [{ url: image, width: 600, height: 900, alt: `Ảnh bìa ${game.title}` }] : [{ url: '/og-default.png', width: 1200, height: 630 }],
      publishedTime: game.created_at, modifiedTime: game.updated_at, tags: game.genres?.map(g => g.name) },
    twitter: { card: 'summary_large_image', title: `${game.title} | VNSVault`, description: desc, images: image ? [image] : ['/og-default.png'] },
  };
}


function GameJsonLd({ game, slug }: { game: Game; slug: string }) {
  const url = `${BASE}/games/${slug}`;
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd({ '@context': 'https://schema.org', '@type': 'VideoGame', name: game.title, description: game.description?.slice(0, 500) ?? '', url, image: game.cover_url ?? undefined, genre: game.genres?.map(g => g.name) ?? [], applicationCategory: 'Game', inLanguage: 'vi', offers: { '@type': 'Offer', price: '0', priceCurrency: 'VND', availability: 'https://schema.org/InStock' }, datePublished: game.created_at, dateModified: game.updated_at, publisher: { '@type': 'Organization', name: 'VNSVault', url: BASE } }) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Trang chủ', item: BASE }, { '@type': 'ListItem', position: 2, name: 'Thư Viện', item: `${BASE}/games` }, { '@type': 'ListItem', position: 3, name: game.title, item: url }] }) }} />
    </>
  );
}

export default async function GameDetailPage({ params }: Props) {
  const { slug } = await params;
  const [game, session] = await Promise.all([getGame(slug), getSession()]);
  if (!game) notFound();

  const loggedIn = Boolean(session);
  // Runs alongside the bookmark check below rather than after it — both are
  // awaited together so the view-count write can't add its own sequential
  // latency to the page, while still completing before the function
  // returns (an un-awaited promise here could get cut off once the
  // response is sent).
  const [userBookmarked] = await Promise.all([
    loggedIn ? isBookmarkedByUser(game.id, session!.userId) : Promise.resolve(false),
    bumpGameViewCount(game.id),
  ]);

  // SECURITY: the real download URL is never sent to the browser anymore,
  // logged in or not — DownloadButton only needs `id` now, and links to
  // /api/games/[slug]/download/[id], which resolves the real URL
  // server-side and redirects (wrapping it through the "vượt link"
  // service unless the viewer is VIP). Stripping `url` here means it
  // can never leak into the RSC payload / page source in the first place.
  const downloads = (game.downloads ?? []).map(d => ({ ...d, url: '' }));
  const byPlatform = downloads.reduce<Record<string, typeof downloads>>((acc, d) => {
    if (!acc[d.platform]) acc[d.platform] = [];
    acc[d.platform].push(d);
    return acc;
  }, {});
  // Distinct version strings across every link, in original (newest-first)
  // order — shown once in the sidebar instead of repeated on every link row.
  const versions = Array.from(new Set(downloads.map(d => d.version).filter(Boolean)));

  /* ── Intro tab ── */
  const introNode = (
    <div>
      <h2 className="font-heading text-xl font-bold text-ghost mb-4">Chi tiết tác phẩm</h2>
      {game.description
        ? game.description.split('\n').filter(Boolean).map((p, i) => <p key={i} className="text-ghost-dim leading-relaxed mb-3">{p}</p>)
        : <p className="text-muted italic">Chưa có mô tả.</p>}
      {game.translator_note && (
        <div className="mt-5 p-4 bg-copper/5 border border-copper/20 rounded-xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-copper mb-2">Ghi Chú Nhóm Dịch</p>
          <p className="text-ghost-dim text-sm leading-relaxed">{game.translator_note}</p>
        </div>
      )}
    </div>
  );

  /* ── Download tab ── */
  const downloadNode = (
    <div>
      <h2 className="font-heading text-xl font-bold text-ghost mb-1">Liên Kết Tải Bản Việt Hóa</h2>
      <p className="text-sm text-ghost-dim mb-5 leading-relaxed">
        Mọi liên kết tải xuống đều được kiểm tra và cam kết an toàn.{' '}
        {!loggedIn && <><Link href={`/login?redirect=/games/${slug}`} className="text-copper-light underline hover:text-copper">Đăng nhập</Link> để truy cập link tải.</>}
      </p>

      {downloads.length === 0 ? (
        <div className="text-center py-10 text-ghost-dim"><p className="text-4xl mb-3">📦</p><p className="text-sm">Chưa có link tải. Quay lại sau nhé.</p></div>
      ) : (
        <div className="space-y-3 mb-8">
          {Object.entries(byPlatform).map(([platform, links]) => (
            <div key={platform}>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-2">{platformLabel(platform as Platform)}</p>
              <div className="space-y-2">
                {links.map(link => (
                  <div key={link.id} className="flex items-center gap-3 p-3.5 bg-surface border border-border rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ghost">{link.label?.trim() || 'Link tải'}</p>
                      <p className="text-xs text-muted">Phiên bản {link.version}</p>
                    </div>
                    <DownloadButton gameSlug={game.slug} platform={platform as Platform} link={link} gameTitle={game.title} loggedIn={loggedIn} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Install guide */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-ghost mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-copper" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          HƯỚNG DẪN CÀI ĐẶT &amp; CHƠI
        </h3>
        <ol className="space-y-2 text-sm text-ghost-dim">
          {['Dùng WinRAR hoặc 7-Zip để giải nén tệp game/patch đã tải.', `Mật khẩu giải nén: Đính kèm trong link tải (nếu có).`, 'Bản patch rời: Copy toàn bộ nội dung dán đè vào thư mục cài gốc chứa file `.exe`.', 'Bản Android: Cài file `.apk` hoặc dùng ứng dụng hỗ trợ phù hợp.'].map((step, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="shrink-0 w-5 h-5 rounded-full bg-copper/15 text-copper-light text-xs flex items-center justify-center mt-0.5 font-semibold">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );

  return (
    <>
      <GameJsonLd game={game} slug={slug} />
      <main className="pt-16 flex-1" id="main-content">

        {/* ── HERO ── */}
        <div className="relative">
          {/* Banner */}
          <div className="relative h-48 sm:h-72 md:h-96 overflow-hidden bg-vault">
            {game.banner_url || game.cover_url ? (
              <Image src={(game.banner_url ?? game.cover_url)!} alt="" fill priority unoptimized={!canOptimizeImage(game.banner_url ?? game.cover_url)} className="object-cover object-top opacity-50" sizes="100vw" aria-hidden="true" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-copper/5 via-vault to-obsidian" aria-hidden="true" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/60 to-transparent" aria-hidden="true" />
            <div className="absolute inset-0 bg-gradient-to-r from-obsidian/80 via-obsidian/20 to-transparent" aria-hidden="true" />
          </div>

          {/* Hero content overlapping banner */}
          <div className="max-w-7xl mx-auto px-4">
            <div className="relative -mt-24 sm:-mt-40 md:-mt-52 pb-6">
              <Link href="/games" className="inline-flex items-center gap-1.5 text-xs text-ghost-dim hover:text-copper-light transition-colors mb-4 group">
                <svg className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                QUAY LẠI DANH SÁCH
              </Link>

              <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
                {/* Cover */}
                <div className="shrink-0 flex justify-center lg:justify-start">
                  <div className="relative w-36 sm:w-44 md:w-52 aspect-[3/4] rounded-xl overflow-hidden border border-border/60 shadow-2xl shadow-black/80">
                    {game.cover_url ? (
                      <Image src={game.cover_url} alt={`Ảnh bìa ${game.title}`} fill unoptimized={!canOptimizeImage(game.cover_url)} className="object-cover" sizes="(max-width:640px) 144px,(max-width:768px) 176px,208px" priority />
                    ) : (
                      <div className="absolute inset-0 bg-surface flex items-center justify-center">
                        <span className="font-cinzel text-5xl text-dim" aria-hidden="true">VN</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Info + actions */}
                <div className="flex-1 min-w-0 flex flex-col lg:flex-row gap-4 lg:gap-6">
                  {/* Title block */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className={`badge ${statusColor(game.status)}`}>{statusLabel(game.status)}</span>
                      {game.engine && <span className="badge bg-dim/30 text-ghost-dim border-dim/40 uppercase tracking-wider text-[10px]">{engineLabel(game.engine)}</span>}
                      {game.age_rating !== 'all' && <span className="badge bg-orange-500/20 text-orange-400 border-orange-500/30 font-bold">{game.age_rating}</span>}
                    </div>
                    <h1 className="font-heading text-xl sm:text-2xl lg:text-3xl font-bold text-ghost leading-tight mb-3">{game.title}</h1>
                    {game.translator?.name && (
                      <p className="text-sm text-ghost-dim mb-4">
                        Dự án Việt ngữ thuộc sở hữu và dịch thuật bởi cộng đồng <span className="text-copper-light font-medium">{game.translator.name}</span>.
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-4 text-sm text-ghost-dim">
                      <span className="flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        <strong className="text-ghost">{formatNumber(game.view_count)}</strong> lượt xem
                      </span>
                      <span className="flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        <strong className="text-ghost">{formatNumber(game.download_count)}</strong> lượt tải
                      </span>
                      {(game.bookmark_count ?? 0) > 0 && (
                        <span className="flex items-center gap-1.5">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" /></svg>
                          <strong className="text-ghost">{formatNumber(game.bookmark_count!)}</strong> thích
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col sm:flex-row lg:flex-col gap-2 lg:w-52 shrink-0">
                    <a href="#game-tabs" className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-emerald-900/30">
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      TẢI GAME BẢN DỊCH
                    </a>
                    <BookmarkButton gameSlug={slug} initialBookmarked={userBookmarked} loggedIn={loggedIn} />
                    <ReportLinkButton gameSlug={game.slug} gameTitle={game.title} downloads={downloads.map(d => ({ id: d.id, version: d.version, platform: d.platform, label: d.label }))} variant="button" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── BODY: tabs + sidebar ── */}
        <div className="max-w-7xl mx-auto px-4 pb-16">
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">

            {/* Tabs */}
            <div className="flex-1 min-w-0 order-2 lg:order-1">
              <DetailTabs id="game-tabs" introNode={introNode} downloadNode={downloadNode} />
            </div>

            {/* Sidebar */}
            <aside className="order-1 lg:order-2 lg:w-72 shrink-0 space-y-5" aria-label="Thông tin game">

              {/* THÔNG TIN CƠ BẢN */}
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted px-4 py-3 border-b border-border">THÔNG TIN CƠ BẢN</p>
                <dl>
                  {[
                    { label: 'Ngôn ngữ', value: statusLabel(game.status) },
                    { label: 'Phiên bản', value: versions.length > 0 ? versions.join(', ') : null },
                    { label: 'Dịch giả', value: game.translator?.name ?? null },
                    { label: 'Engine phát triển', value: game.engine ? engineLabel(game.engine) : null },
                    { label: 'Hệ điều hành', value: Object.keys(byPlatform).length > 0 ? Object.keys(byPlatform).map(p => platformLabel(p as Platform)).join(', ') : null },
                    { label: 'Độ tuổi đề nghị', value: game.age_rating === 'all' ? 'Tất cả' : game.age_rating, highlight: game.age_rating !== 'all' },
                    { label: 'Đơn vị phát triển', value: game.developer },
                    { label: 'Đăng tải lúc', value: formatDate(game.created_at) },
                  ].filter(r => r.value).map(row => (
                    <div key={row.label} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/40 last:border-0 even:bg-vault/40">
                      <dt className="text-xs text-muted w-28 shrink-0">{row.label}</dt>
                      <dd className={`text-sm font-medium ${row.highlight ? 'text-orange-400' : 'text-ghost'}`}>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* THỂ LOẠI */}
              {game.genres && game.genres.length > 0 && (
                <div className="bg-surface border border-border rounded-xl p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">THỂ LOẠI TRÒ CHƠI</p>
                  <div className="flex flex-wrap gap-2" role="list" aria-label="Thể loại">
                    {game.genres.map(g => (
                      <Link key={g.id} href={`/games?genre=${g.slug}`} role="listitem" className="px-3 py-1 text-xs bg-vault border border-border rounded-full text-ghost-dim hover:border-copper/40 hover:text-copper-light transition-colors whitespace-nowrap">{g.name}</Link>
                    ))}
                  </div>
                </div>
              )}

              {/* THƯƠNG HIỆU VIỆT HÓA */}
              {game.translator && (
                <div className="bg-surface border border-border rounded-xl p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">THƯƠNG HIỆU VIỆT HÓA</p>
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-lg bg-copper/15 border border-copper/25 flex items-center justify-center shrink-0 overflow-hidden">
                      {game.translator.avatar_url
                        ? <Image src={game.translator.avatar_url} alt={game.translator.name} width={44} height={44} unoptimized className="object-cover w-full h-full" />
                        : <span className="font-cinzel text-sm font-bold text-copper-light">{game.translator.name.slice(0, 2).toUpperCase()}</span>}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ghost truncate">{game.translator.name}</p>
                      {game.translator.discord_url && <a href={game.translator.discord_url} target="_blank" rel="noopener noreferrer" className="text-xs text-copper-light hover:text-copper transition-colors">Discord</a>}
                    </div>
                  </div>
                  {game.translator.bio && <p className="text-xs text-ghost-dim mt-3 leading-relaxed line-clamp-3">{game.translator.bio}</p>}
                </div>
              )}
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}

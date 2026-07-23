'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import GameCard from '@/components/games/GameCard';
import { SkeletonCardGrid } from '@/components/ui/SkeletonCard';
import Link from 'next/link';
import type { Game } from '@/types';

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'completed', label: 'Việt Hoá' },
  { value: 'in_progress', label: 'Tiếng Nhật' },
  { value: 'paused', label: 'Tiếng Trung' },
  { value: 'demo', label: 'Tiếng Anh' },
];
const ENGINE_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'renpy', label: "Ren'Py" },
  { value: 'kirikiri', label: 'KiriKiri' },
  { value: 'unity', label: 'Unity' },
  { value: 'rpgmaker', label: 'RPG Maker' },
  { value: 'tyranobuild', label: 'TyranoBuild' },
  { value: 'godot', label: 'Godot' },
  { value: 'wolfrpg', label: 'Wolf RPG' },
  { value: 'unreal', label: 'Unreal Engine' },
  { value: 'artemis', label: 'Artemis' },
  { value: 'catsystem2', label: 'Cat System 2' },
  { value: 'other', label: 'Khác' },
];
const SORT_OPTIONS = [
  { value: 'updated_at', label: 'Mới cập nhật' },
  { value: 'download_count', label: 'Tải nhiều nhất' },
  { value: 'view_count', label: 'Xem nhiều nhất' },
  { value: 'created_at', label: 'Mới thêm' },
];

function FilterGroup({ label, options, value, onChange }: { label: string; options: typeof STATUS_OPTIONS; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-2.5">{label}</p>
      <div className="flex flex-col gap-0.5">
        {options.map(o => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
              value === o.value
                ? 'bg-copper/15 text-copper-light border border-copper/30'
                : 'text-ghost-dim hover:bg-surface hover:text-ghost border border-transparent'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TagFilter({ allGenres, selected, onToggle }: {
  allGenres: { id: number; name: string; slug: string }[];
  selected: string[];
  onToggle: (slug: string) => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = q
    ? allGenres.filter(g => g.name.toLowerCase().includes(q) || g.slug.includes(q)).slice(0, 24)
    : [];

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-2.5">Tìm Theo Tag</p>
      <div className="relative mb-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="VD: Fantasy, Yuri, RPG..."
          className="w-full bg-vault border border-border rounded-lg px-3 py-2 text-sm text-ghost placeholder:text-muted focus:outline-none focus:border-copper/60 transition-colors"
        />
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map(slug => {
            const g = allGenres.find(x => x.slug === slug);
            return (
              <button
                key={slug}
                onClick={() => onToggle(slug)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs bg-copper/15 text-copper-light border border-copper/30 rounded-full hover:bg-copper/25 transition-colors whitespace-nowrap"
              >
                {g?.name ?? slug}
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            );
          })}
        </div>
      )}
      {q && (
        <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
          {matches.length === 0 ? (
            <p className="text-xs text-muted italic px-0.5">Không tìm thấy tag phù hợp.</p>
          ) : matches.map(g => (
            <button
              key={g.id}
              onClick={() => onToggle(g.slug)}
              className={`px-2.5 py-1 text-xs rounded-full border whitespace-nowrap transition-colors ${
                selected.includes(g.slug)
                  ? 'bg-copper/15 text-copper-light border-copper/30'
                  : 'bg-vault text-ghost-dim border-border hover:border-copper/30'
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarContent({ status, engine, tags, allGenres, onStatus, onEngine, onToggleTag, onReset, hasFilters }: {
  status: string; engine: string; tags: string[];
  allGenres: { id: number; name: string; slug: string }[];
  onStatus: (v: string) => void; onEngine: (v: string) => void; onToggleTag: (slug: string) => void;
  onReset: () => void; hasFilters: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="font-heading text-sm font-semibold text-ghost flex items-center gap-2">
          <svg className="w-4 h-4 text-copper" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
          Bộ Lọc
        </p>
        {hasFilters && (
          <button onClick={onReset} className="text-xs text-copper-light hover:text-copper transition-colors">
            Xóa tất cả
          </button>
        )}
      </div>
      <FilterGroup label="Ngôn ngữ" options={STATUS_OPTIONS} value={status} onChange={onStatus} />
      <div className="border-t border-border/40" />
      <FilterGroup label="Game Engine" options={ENGINE_OPTIONS} value={engine} onChange={onEngine} />
      <div className="border-t border-border/40" />
      <TagFilter allGenres={allGenres} selected={tags} onToggle={onToggleTag} />
    </div>
  );
}

function GamesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [allGenres, setAllGenres] = useState<{ id: number; name: string; slug: string }[]>([]);
  const loadingRef = useRef(false);

  useEffect(() => {
    fetch('/api/genres')
      .then(r => r.json())
      .then(d => { if (d.success) setAllGenres(d.data); })
      .catch(() => { /* tag search just shows no suggestions */ });
  }, []);

  const q        = searchParams.get('q') ?? '';
  const status   = searchParams.get('status') ?? '';
  const engine   = searchParams.get('engine') ?? '';
  const sort     = searchParams.get('sort') ?? 'updated_at';
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const featured = searchParams.get('featured') ?? '';
  const genre    = searchParams.get('genre') ?? '';
  const tagsRaw  = searchParams.get('tags') ?? '';
  const tags     = useMemo(() => (tagsRaw ? tagsRaw.split(',').filter(Boolean) : []), [tagsRaw]);

  const hasFilters = !!(status || engine || genre || tags.length > 0);

  const pushParam = useCallback((key: string, value: string) => {
    const p = new URLSearchParams(searchParams.toString());
    if (value) p.set(key, value); else p.delete(key);
    p.delete('page');
    router.push(`/games?${p.toString()}`);
    setDrawerOpen(false);
  }, [searchParams, router]);

  const toggleTag = useCallback((slug: string) => {
    const next = tags.includes(slug) ? tags.filter(t => t !== slug) : [...tags, slug];
    pushParam('tags', next.join(','));
  }, [tags, pushParam]);

  const resetFilters = () => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (sort !== 'updated_at') p.set('sort', sort);
    router.push(`/games?${p.toString()}`);
  };

  const goPage = (n: number) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set('page', String(n));
    router.push(`/games?${p.toString()}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    const params = new URLSearchParams();
    if (q)        params.set('q', q);
    if (status)   params.set('status', status);
    if (engine)   params.set('engine', engine);
    if (sort)     params.set('sort', sort);
    if (featured) params.set('featured', featured);
    if (genre)    params.set('genre', genre);
    if (tags.length) params.set('tags', tags.join(','));
    params.set('page', String(page));
    params.set('pageSize', '12');

    fetch(`/api/games?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.success) {
          setGames(d.data.items ?? []);
          setTotal(d.data.total ?? 0);
          setTotalPages(d.data.totalPages ?? 1);
          setFetchError(false);
        } else {
          // Either the request failed (non-2xx) or the API responded with
          // success:false — both mean "couldn't load games", which should
          // look different from "the catalog is genuinely empty".
          setFetchError(true);
        }
      })
      .catch(() => setFetchError(true))
      .finally(() => { setLoading(false); loadingRef.current = false; });
  }, [q, status, engine, sort, featured, genre, tagsRaw, tags, page, retryNonce]);

  // Pagination range
  const pageRange = () => {
    const delta = 2;
    const range: (number | '...')[] = [];
    for (let i = Math.max(2, page - delta); i <= Math.min(totalPages - 1, page + delta); i++) range.push(i);
    if (page - delta > 2) range.unshift('...');
    if (page + delta < totalPages - 1) range.push('...');
    if (totalPages > 1) { range.unshift(1); if (totalPages > 1) range.push(totalPages); }
    return range;
  };

  return (
    <>
      <main className="pt-16 flex-1" id="main-content">
        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Breadcrumb */}
          <nav className="breadcrumb mb-5" aria-label="Breadcrumb">
            <Link href="/">Trang chủ</Link>
            <span aria-hidden="true">›</span>
            <span className="text-ghost-dim text-sm">Thư Viện Game</span>
          </nav>

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="font-heading text-2xl sm:text-3xl font-bold text-ghost">
                {q ? `Kết quả: "${q}"` : featured === 'true' ? 'Game Đặc Sắc' : 'Thư Viện Game'}
              </h1>
              <p className="text-ghost-dim text-sm mt-1" aria-live="polite">
                {loading ? 'Đang tải...' : `Hiển thị ${total.toLocaleString('vi-VN')} tựa game`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Mobile filter button */}
              <button
                onClick={() => setDrawerOpen(true)}
                className="lg:hidden btn-ghost gap-2 text-sm py-2"
                aria-label="Mở bộ lọc"
                aria-expanded={drawerOpen}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
                Bộ lọc{hasFilters && <span className="w-2 h-2 rounded-full bg-copper" aria-label="Đang có bộ lọc" />}
              </button>
              <label htmlFor="sort-select" className="sr-only">Sắp xếp theo</label>
              <select
                id="sort-select"
                value={sort}
                onChange={e => pushParam('sort', e.target.value)}
                className="input-base w-auto text-sm py-2"
              >
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Active filter chips */}
          {hasFilters && (
            <div className="flex flex-wrap gap-2 mb-5" role="group" aria-label="Bộ lọc đang áp dụng">
              {status && (
                <button onClick={() => pushParam('status', '')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-copper/15 text-copper-light border border-copper/30 rounded-full hover:bg-copper/25 transition-colors whitespace-nowrap">
                  {STATUS_OPTIONS.find(o => o.value === status)?.label}
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
              {engine && (
                <button onClick={() => pushParam('engine', '')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-copper/15 text-copper-light border border-copper/30 rounded-full hover:bg-copper/25 transition-colors whitespace-nowrap">
                  {ENGINE_OPTIONS.find(o => o.value === engine)?.label}
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
              {tags.map(slug => (
                <button key={slug} onClick={() => toggleTag(slug)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-copper/15 text-copper-light border border-copper/30 rounded-full hover:bg-copper/25 transition-colors whitespace-nowrap">
                  #{allGenres.find(g => g.slug === slug)?.name ?? slug}
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-6">
            {/* ── Desktop sidebar ── */}
            <aside className="w-56 shrink-0 hidden lg:block" aria-label="Bộ lọc">
              <div className="sticky top-24 bg-surface border border-border rounded-xl p-4">
                <SidebarContent status={status} engine={engine} tags={tags} allGenres={allGenres} onStatus={v => pushParam('status', v)} onEngine={v => pushParam('engine', v)} onToggleTag={toggleTag} onReset={resetFilters} hasFilters={hasFilters} />
              </div>
            </aside>

            {/* ── Game grid ── */}
            <section className="flex-1 min-w-0" aria-label="Danh sách game">
              {loading ? (
                <SkeletonCardGrid count={12} />
              ) : games.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                    {games.map((g, i) => <GameCard key={g.id} game={g} rank={sort === 'download_count' ? i + 1 + (page - 1) * 12 : undefined} />)}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <nav className="flex items-center justify-center gap-1.5 mt-10" aria-label="Phân trang">
                      <button
                        onClick={() => goPage(page - 1)}
                        disabled={page === 1}
                        className="btn-ghost px-3 py-2 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Trang trước"
                      >
                        ←
                      </button>
                      {pageRange().map((p, i) =>
                        p === '...' ? (
                          <span key={`e${i}`} className="px-2 text-muted text-sm">…</span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => goPage(p as number)}
                            aria-label={`Trang ${p}`}
                            aria-current={p === page ? 'page' : undefined}
                            className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                              p === page
                                ? 'bg-copper text-obsidian'
                                : 'text-ghost-dim hover:bg-surface hover:text-ghost border border-border'
                            }`}
                          >
                            {p}
                          </button>
                        )
                      )}
                      <button
                        onClick={() => goPage(page + 1)}
                        disabled={page === totalPages}
                        className="btn-ghost px-3 py-2 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
                        aria-label="Trang sau"
                      >
                        →
                      </button>
                    </nav>
                  )}
                </>
              ) : fetchError ? (
                <div className="text-center py-24 fade-in">
                  <div className="text-5xl mb-4" aria-hidden="true">⚠️</div>
                  <h2 className="font-heading text-xl font-bold text-ghost mb-2">Không thể tải danh sách game</h2>
                  <p className="text-ghost-dim mb-6">Đã có lỗi xảy ra khi kết nối tới server. Vui lòng thử lại.</p>
                  <button onClick={() => setRetryNonce(n => n + 1)} className="btn-copper">Thử lại</button>
                </div>
              ) : (
                <div className="text-center py-24 fade-in">
                  <div className="text-5xl mb-4" aria-hidden="true">📚</div>
                  <h2 className="font-heading text-xl font-bold text-ghost mb-2">Không tìm thấy game</h2>
                  <p className="text-ghost-dim mb-6">Thử điều chỉnh bộ lọc hoặc từ khóa tìm kiếm.</p>
                  {hasFilters && (
                    <button onClick={resetFilters} className="btn-copper">Xóa bộ lọc</button>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      {/* ── Mobile filter drawer ── */}
      {drawerOpen && (
        <>
          <div className="drawer-overlay lg:hidden" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <div
            className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-vault border-r border-border overflow-y-auto slide-up lg:hidden"
            role="dialog"
            aria-label="Bộ lọc game"
            aria-modal="true"
          >
            <div className="flex items-center justify-between p-4 border-b border-border/60">
              <h2 className="font-heading font-semibold text-ghost">Bộ lọc</h2>
              <button onClick={() => setDrawerOpen(false)} className="p-2 text-ghost-dim hover:text-ghost rounded-lg" aria-label="Đóng bộ lọc">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4">
              <SidebarContent status={status} engine={engine} tags={tags} allGenres={allGenres} onStatus={v => pushParam('status', v)} onEngine={v => pushParam('engine', v)} onToggleTag={toggleTag} onReset={resetFilters} hasFilters={hasFilters} />
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default function GamesPage() {
  return (
    <Suspense fallback={
      <div className="pt-16 flex-1 max-w-7xl mx-auto px-4 py-8">
        <SkeletonCardGrid count={12} />
      </div>
    }>
      <GamesContent />
    </Suspense>
  );
}

import Link from 'next/link';
import Image from 'next/image';
import type { Game, Platform } from '@/types';
import { statusLabel, statusColor, engineLabel, platformIcon, formatNumber } from '@/lib/utils';

interface Props { game: Game; rank?: number; className?: string; style?: React.CSSProperties; }

export default function GameCard({ game, rank, className, style }: Props) {
  // Derive unique platforms from typed downloads — avoids `as any` cast.
  const platforms = game.downloads
    ? [...new Set(game.downloads.map(d => d.platform))]
    : undefined;

  return (
    <article className={className} style={style}>
      <Link
        href={`/games/${game.slug}`}
        className="group relative flex flex-col bg-surface border border-border rounded-xl overflow-hidden transition-all duration-300 hover:border-copper/40 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40 h-full"
        aria-label={`${game.title} – ${statusLabel(game.status)}`}
      >
        {/* ── Cover image ── */}
        <div className="vault-overlay relative aspect-[3/4] bg-vault overflow-hidden flex-shrink-0">
          {game.cover_url ? (
            <Image
              src={game.cover_url}
              alt={`Ảnh bìa ${game.title}`}
              fill
              unoptimized
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-vault to-obsidian">
              <span className="font-cinzel text-3xl text-dim select-none" aria-hidden="true">VN</span>
            </div>
          )}

          {/* Rank badge */}
          {rank && (
            <span
              className="absolute top-2 left-2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-copper/90 text-obsidian text-xs font-bold font-cinzel shadow-lg"
              aria-label={`Hạng ${rank}`}
            >
              {rank}
            </span>
          )}

          {/* Age rating */}
          {game.age_rating !== 'all' && (
            <span className="absolute top-2 right-2 z-10 px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-600/90 text-white shadow" aria-label={`Độ tuổi ${game.age_rating}`}>
              {game.age_rating}
            </span>
          )}

          {/* Platform strip */}
          {platforms && platforms.length > 0 && (
            <div className="absolute bottom-2 left-2 z-10 flex gap-1" aria-label={`Hệ điều hành: ${platforms.join(', ')}`}>
              {platforms.slice(0, 3).map(p => (
                <span key={p} title={p} className="text-sm drop-shadow-lg" aria-hidden="true">
                  {platformIcon(p as Platform)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Card body ── */}
        <div className="p-3 flex flex-col gap-1.5 flex-1">
          <h3 className="font-heading text-sm font-medium text-ghost leading-snug line-clamp-2 group-hover:text-copper-light transition-colors">
            {game.title}
          </h3>

          {/* Status + engine */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`badge ${statusColor(game.status)}`}>
              {statusLabel(game.status)}
            </span>
            {game.engine && (
              <span className="badge bg-dim/30 text-ghost-dim border-dim/50">
                {engineLabel(game.engine)}
              </span>
            )}
          </div>

          {/* Genres */}
          {game.genres && game.genres.length > 0 && (
            <div className="flex flex-wrap gap-1" aria-label="Thể loại">
              {game.genres.slice(0, 3).map(g => (
                <span key={g.id} className="text-[10px] text-muted">
                  {g.name}{game.genres!.indexOf(g) < Math.min(game.genres!.length, 3) - 1 ? ',' : ''}
                </span>
              ))}
            </div>
          )}

          {/* Stats */}
          <div className="mt-auto pt-2 flex items-center justify-between text-xs text-muted border-t border-border/50">
            <span title="Lượt tải" className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {formatNumber(game.download_count)}
            </span>
            <span title="Lượt xem" className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              {formatNumber(game.view_count)}
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

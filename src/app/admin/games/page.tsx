'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { statusLabel, statusColor, formatNumber, formatDate } from '@/lib/utils';
import type { Game } from '@/types';

export default function AdminGamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/admin/games')
      .then(r => r.json())
      .then(d => d.success && setGames(d.data))
      .finally(() => setLoading(false));
  }, []);

  const togglePublish = async (game: Game) => {
    const r = await fetch(`/api/admin/games/${game.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published: !game.published }),
    });
    if (r.ok) setGames(prev => prev.map(g => g.id === game.id ? { ...g, published: !g.published } : g));
  };

  const deleteGame = async (id: string, title: string) => {
    if (!confirm(`Xóa game "${title}"? Hành động này không thể hoàn tác.`)) return;
    setDeleting(id);
    const r = await fetch(`/api/admin/games/${id}`, { method: 'DELETE' });
    if (r.ok) setGames(prev => prev.filter(g => g.id !== id));
    setDeleting(null);
  };

  const filtered = games.filter(g =>
    g.title.toLowerCase().includes(search.toLowerCase()) ||
    (g.developer ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ghost">Quản Lý Game</h1>
          <p className="text-ghost-dim text-sm mt-0.5">{games.length} tựa game</p>
        </div>
        <Link href="/admin/games/new"
          className="px-4 py-2.5 bg-copper text-obsidian font-semibold rounded-lg hover:bg-copper-light transition-colors text-sm shrink-0">
          + Thêm Game Mới
        </Link>
      </div>

      {/* Search */}
      <div className="mb-5">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Tìm theo tên game, developer..."
          className="w-full max-w-sm bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-ghost placeholder:text-muted focus:outline-none focus:border-copper/60"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 bg-surface border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-ghost-dim">{games.length === 0 ? 'Chưa có game nào.' : 'Không tìm thấy.'}</p>
          <Link href="/admin/games/new" className="inline-block mt-3 text-sm text-copper-light hover:underline">
            Thêm game đầu tiên →
          </Link>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border/80 text-left">
                <th className="px-4 py-3 text-xs uppercase tracking-wider text-muted font-semibold">Game</th>
                <th className="px-4 py-3 text-xs uppercase tracking-wider text-muted font-semibold hidden md:table-cell">Trạng thái</th>
                <th className="px-4 py-3 text-xs uppercase tracking-wider text-muted font-semibold hidden lg:table-cell">Tải</th>
                <th className="px-4 py-3 text-xs uppercase tracking-wider text-muted font-semibold hidden lg:table-cell">Ngày tạo</th>
                <th className="px-4 py-3 text-xs uppercase tracking-wider text-muted font-semibold">Công khai</th>
                <th className="px-4 py-3 text-xs uppercase tracking-wider text-muted font-semibold text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.map(g => (
                <tr key={g.id} className="hover:bg-vault/40 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-ghost line-clamp-1">{g.title}</p>
                      <p className="text-xs text-muted mt-0.5 truncate max-w-[220px]">/{g.slug}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColor(g.status)}`}>
                      {statusLabel(g.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ghost-dim hidden lg:table-cell">
                    {formatNumber(g.download_count)}
                  </td>
                  <td className="px-4 py-3 text-ghost-dim hidden lg:table-cell">
                    {formatDate(g.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => togglePublish(g)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        g.published ? 'bg-emerald-500' : 'bg-dim'
                      }`}>
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                        g.published ? 'translate-x-4' : 'translate-x-1'
                      }`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/games/${g.slug}`} target="_blank"
                        className="text-xs px-2.5 py-1.5 border border-border rounded-lg text-ghost-dim hover:text-ghost hover:border-copper/40 transition-colors">
                        Xem
                      </Link>
                      <Link href={`/admin/games/${g.id}/edit`}
                        className="text-xs px-2.5 py-1.5 border border-border rounded-lg text-ghost-dim hover:text-copper-light hover:border-copper/40 transition-colors">
                        Sửa
                      </Link>
                      <button onClick={() => deleteGame(g.id, g.title)}
                        disabled={deleting === g.id}
                        className="text-xs px-2.5 py-1.5 border border-red-500/30 rounded-lg text-red-400/70 hover:text-red-400 hover:border-red-500/60 transition-colors disabled:opacity-40">
                        {deleting === g.id ? '...' : 'Xóa'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

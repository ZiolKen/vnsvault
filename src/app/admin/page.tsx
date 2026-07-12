import Link from 'next/link';
import { db } from '@/lib/db';

async function getStats() {
  try {
    // COUNT/SUM only aggregate within each shard's own data — sum the
    // per-shard results together for the true global total.
    const [total, published, requests, downloads, pendingRequests, openReports] = await Promise.all([
      db.aggregate('SELECT COUNT(*) AS count FROM games', undefined, 'count'),
      db.aggregate('SELECT COUNT(*) AS count FROM games WHERE published=TRUE', undefined, 'count'),
      db.aggregate('SELECT COUNT(*) AS count FROM game_requests', undefined, 'count'),
      db.aggregate('SELECT COALESCE(SUM(download_count),0) AS sum FROM games', undefined, 'sum'),
      db.aggregate("SELECT COUNT(*) AS count FROM game_requests WHERE status='pending'", undefined, 'count'),
      db.aggregate("SELECT COUNT(*) AS count FROM link_reports WHERE status='open'", undefined, 'count'),
    ]);
    return { total, published, requests, downloads, pendingRequests, openReports, error: false };
  } catch (e) {
    // db.aggregate/fanOut only throws when EVERY shard failed — a real
    // outage, not "the catalog happens to be empty". Surface that instead
    // of quietly showing 0 (which would look identical to an empty
    // catalog and mislead whoever's looking at this dashboard).
    console.error('[AdminDashboard] getStats failed:', e);
    return { total: 0, published: 0, requests: 0, downloads: 0, pendingRequests: 0, openReports: 0, error: true };
  }
}

interface RecentGame {
  id: string; title: string; slug: string; status: string;
  published: boolean; download_count: number; created_at: string;
}

async function getRecentGames() {
  try {
    // Games can be on any shard — fan out, merge, then sort + limit in app
    // code (ORDER BY/LIMIT only apply within each shard's own results).
    const games = await db.fanOut<RecentGame>(
      'SELECT id, title, slug, status, published, download_count, created_at FROM games'
    );
    games.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { games: games.slice(0, 5), error: false };
  } catch (e) {
    console.error('[AdminDashboard] getRecentGames failed:', e);
    return { games: [] as RecentGame[], error: true };
  }
}

export default async function AdminDashboard() {
  const [stats, recentGamesResult] = await Promise.all([getStats(), getRecentGames()]);
  const recentGames = recentGamesResult.games;
  const dbError = stats.error || recentGamesResult.error;

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <div className="mb-8">
        <h1 className="font-cinzel text-2xl font-bold text-ghost">Dashboard</h1>
        <p className="text-ghost-dim text-sm mt-1">Tổng quan VNSVault</p>
      </div>

      {dbError && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">
          <span className="text-xl">⚠️</span>
          <span>
            Không thể kết nối tới một hoặc nhiều cơ sở dữ liệu (shard). Số liệu dưới đây
            <strong> có thể không đầy đủ</strong> — đây không phải kho game đang trống, hãy kiểm tra lại kết nối DB.
          </span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Tổng Game', value: stats.total, icon: '🎮', color: 'text-copper-light' },
          { label: 'Đã Xuất Bản', value: stats.published, icon: '✅', color: 'text-emerald-400' },
          { label: 'Đề Xuất', value: stats.requests, icon: '📋', color: 'text-sky-400' },
          { label: 'Tổng Lượt Tải', value: stats.downloads, icon: '↓', color: 'text-violet-400' },
        ].map(s => (
          <div key={s.label} className="bg-surface border border-border rounded-xl p-5">
            <p className="text-2xl mb-1">{s.icon}</p>
            <p className={`font-cinzel text-3xl font-bold ${s.color}`}>{s.value.toLocaleString()}</p>
            <p className="text-xs text-muted mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Link href="/admin/games/new"
          className="flex items-center gap-4 p-5 bg-copper/10 border border-copper/30 rounded-xl hover:border-copper/60 transition-colors group">
          <span className="text-3xl">➕</span>
          <div>
            <p className="font-semibold text-copper-light group-hover:text-copper">Thêm Game Mới</p>
            <p className="text-sm text-ghost-dim">Đăng tựa game mới vào thư viện</p>
          </div>
        </Link>
        <Link href="/admin/games"
          className="flex items-center gap-4 p-5 bg-surface border border-border rounded-xl hover:border-copper/30 transition-colors group">
          <span className="text-3xl">📝</span>
          <div>
            <p className="font-semibold text-ghost group-hover:text-copper-light">Quản Lý Game</p>
            <p className="text-sm text-ghost-dim">Chỉnh sửa, ẩn hoặc xóa game</p>
          </div>
        </Link>
        <Link href="/admin/requests"
          className="relative flex items-center gap-4 p-5 bg-surface border border-border rounded-xl hover:border-sky-500/40 transition-colors group">
          {stats.pendingRequests > 0 && (
            <span className="absolute top-3 right-3 text-xs font-bold bg-sky-500 text-obsidian rounded-full w-6 h-6 flex items-center justify-center">
              {stats.pendingRequests}
            </span>
          )}
          <span className="text-3xl">💬</span>
          <div>
            <p className="font-semibold text-ghost group-hover:text-sky-400">Đề Xuất Game</p>
            <p className="text-sm text-ghost-dim">{stats.pendingRequests} đang chờ duyệt</p>
          </div>
        </Link>
        <Link href="/admin/reports"
          className="relative flex items-center gap-4 p-5 bg-surface border border-border rounded-xl hover:border-orange-500/40 transition-colors group">
          {stats.openReports > 0 && (
            <span className="absolute top-3 right-3 text-xs font-bold bg-orange-500 text-obsidian rounded-full w-6 h-6 flex items-center justify-center">
              {stats.openReports}
            </span>
          )}
          <span className="text-3xl">🚩</span>
          <div>
            <p className="font-semibold text-ghost group-hover:text-orange-400">Báo Lỗi Link</p>
            <p className="text-sm text-ghost-dim">{stats.openReports} báo cáo đang mở</p>
          </div>
        </Link>
        <Link href="/admin/users"
          className="flex items-center gap-4 p-5 bg-surface border border-border rounded-xl hover:border-copper/30 transition-colors group">
          <span className="text-3xl">👑</span>
          <div>
            <p className="font-semibold text-ghost group-hover:text-copper-light">Quản Lý VIP</p>
            <p className="text-sm text-ghost-dim">Nâng cấp tài khoản, gia hạn hoặc thu hồi VIP</p>
          </div>
        </Link>
      </div>

      {/* Recent games */}
      <div className="bg-surface border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-base font-bold text-ghost">Game Mới Nhất</h2>
          <Link href="/admin/games" className="text-xs text-copper-light hover:underline">Xem tất cả →</Link>
        </div>
        {recentGames.length === 0 ? (
          <p className="text-ghost-dim text-sm py-4 text-center">
            {dbError ? 'Không thể tải danh sách game.' : 'Chưa có game nào. Hãy thêm game đầu tiên!'}
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {recentGames.map(g => (
              <div key={g.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-ghost">{g.title}</p>
                  <p className="text-xs text-muted">/{g.slug} · ↓ {g.download_count}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                    g.published
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                  }`}>
                    {g.published ? 'Công khai' : 'Ẩn'}
                  </span>
                  <Link href={`/admin/games/${g.id}/edit`}
                    className="text-xs px-2 py-1 bg-surface border border-border rounded hover:border-copper/40 text-ghost-dim hover:text-copper-light transition-colors">
                    Sửa
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

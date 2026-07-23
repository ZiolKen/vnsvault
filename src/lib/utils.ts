import type { GameStatus, GameEngine, Platform, RequestStatus, ReportStatus } from '@/types';

/**
 * UUID v4 format regex — use to validate dynamic route params before querying DB.
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(id: string): boolean {
  return UUID_RE.test(id);
}

/**
 * Slugify — handles Vietnamese diacritics via NFD decomposition.
 * "đ" is handled separately (no NFD decomposition).
 * Returns null if the result is empty (e.g. pure CJK title).
 */
export function slugify(str: string): string {
  const slug = str
    .toLowerCase()
    .trim()
    .replace(/đ/g, 'd')          // Vietnamese đ → d (doesn't decompose via NFD)
    .normalize('NFD')             // Decompose: "ắ" → "a" + combining marks
    .replace(/[\u0300-\u036f]/g, '') // Strip all combining diacritics
    .replace(/[^\w\s-]/g, '')    // Strip non-word, non-space, non-dash
    .replace(/[\s_-]+/g, '-')    // Spaces/underscores → single dash
    .replace(/^-+|-+$/g, '');    // Trim leading/trailing dashes
  return slug;
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function statusLabel(s: GameStatus): string {
  const map: Record<GameStatus, string> = {
    completed: 'Việt Hoá',
    in_progress: 'Tiếng Nhật',
    paused: 'Tiếng Trung',
    demo: 'Tiếng Anh',
  };
  return map[s] ?? s;
}

export function statusColor(s: GameStatus): string {
  const map: Record<GameStatus, string> = {
    completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    in_progress: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    paused: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    demo: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  };
  return map[s] ?? 'bg-gray-500/20 text-gray-400';
}

export function engineLabel(e: GameEngine): string {
  const map: Record<GameEngine, string> = {
    renpy: "Ren'Py",
    kirikiri: 'KiriKiri',
    unity: 'Unity',
    rpgmaker: 'RPG Maker',
    tyranobuild: 'TyranoBuild',
    godot: 'Godot',
    wolfrpg: 'Wolf RPG',
    unreal: 'Unreal Engine',
    artemis: 'Artemis',
    catsystem2: 'Cat System 2',
    other: 'Khác',
  };
  return map[e] ?? e;
}

/**
 * Best-effort host name for a download link's URL, used ONLY as a
 * fallback when the admin left the link's `label` blank when posting the
 * game — the label itself should normally be typed by hand (e.g. "Google
 * Drive", "Pixeldrain"). Never call this client-side against a game's
 * real download URLs: those are stripped before the page reaches the
 * browser (see games/[slug]/page.tsx), so this only ever runs server-side
 * or in the admin form where the real URL is legitimately visible.
 */
export function hostLabelFromUrl(url: string): string {
  const KNOWN: Record<string, string> = {
    'drive.google.com': 'Google Drive',
    'pixeldrain.com': 'Pixeldrain',
    'mediafire.com': 'MediaFire',
    'mega.nz': 'MEGA',
    'mega.co.nz': 'MEGA',
    '1drv.ms': 'OneDrive',
    'onedrive.live.com': 'OneDrive',
    'dropbox.com': 'Dropbox',
    'gofile.io': 'Gofile',
    'fshare.vn': 'Fshare',
    'workupload.com': 'Workupload',
    'send.cm': 'Send.cm',
    'krakenfiles.com': 'KrakenFiles',
  };
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return KNOWN[host] ?? host;
  } catch {
    return 'Link tải';
  }
}

export function platformLabel(p: Platform): string {
  const map: Record<Platform, string> = {
    windows: 'Windows',
    android: 'Android',
    macos: 'macOS',
    ios: 'iOS',
    linux: 'Linux',
    webhtml5: 'Web',
  };
  return map[p] ?? p;
}

export function platformIcon(p: Platform): string {
  const map: Record<Platform, string> = {
    windows: '🖥️',
    android: '📱',
    macos: '🍎',
    ios: '📱',
    linux: '🐧',
    webhtml5: '🌐',
  };
  return map[p] ?? '💾';
}

export function requestStatusLabel(s: RequestStatus): string {
  const map: Record<RequestStatus, string> = {
    pending: 'Chờ Duyệt',
    approved: 'Đã Duyệt',
    in_progress: 'Đang Dịch',
    rejected: 'Đã Từ Chối',
  };
  return map[s] ?? s;
}

export function requestStatusColor(s: RequestStatus): string {
  const map: Record<RequestStatus, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    approved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    in_progress: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return map[s] ?? 'bg-gray-500/20 text-gray-400';
}

export function reportStatusLabel(s: ReportStatus): string {
  return s === 'resolved' ? 'Đã Xử Lý' : 'Đang Mở';
}

export function reportStatusColor(s: ReportStatus): string {
  return s === 'resolved'
    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    : 'bg-orange-500/20 text-orange-400 border-orange-500/30';
}

/**
 * Serialize a value for safe embedding inside a `<script type="application/ld+json">`
 * tag. Plain `JSON.stringify` does NOT escape the sequence `</`, so a value
 * containing `</script>` (e.g. an admin-entered game title/description) would
 * close the tag early and let anything after it execute as HTML/JS — a
 * classic JSON-in-<script> XSS vector. Escaping `<` to `\u003c` neutralizes
 * this while staying valid, semantically-identical JSON.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/**
 * True only for absolute http(s) URLs. Use to whitelist any URL that will
 * later be used as an href/src an end user can click/load (download links,
 * cover/banner images, avatars) — without this, a `javascript:` or `data:`
 * URI could be stored and executed in another user's browser when they
 * interact with it (stored XSS via non-http protocol).
 */
export function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * True if next/image can run its optimization pipeline on this URL without
 * throwing "hostname not configured" — i.e. its host matches an entry in
 * next.config.ts's `images.remotePatterns`. Everything else must render
 * with the `unoptimized` prop instead, since admin-pasted cover/banner/
 * avatar URLs can point at arbitrary hosts and next/image hard-errors on
 * any host not in that allowlist.
 *
 * ⚠️ Keep this list in sync with next.config.ts's remotePatterns by hand —
 * there's no way to import next.config.ts's values into a component
 * (client or server) at runtime, so this is a deliberate duplication, not
 * an oversight. `*.supabase.co` covers every uploaded image (see
 * lib/storage.ts) since that's what actually made "use Next Image
 * Optimize" worth doing — the rest were already-safe hosts that happened
 * to be forced through the unoptimized path anyway.
 */
const OPTIMIZABLE_HOSTS = [
  'i.imgur.com',
  'imgur.com',
  'cdn.discordapp.com',
  'media.discordapp.net',
  'i.ibb.co',
  'res.cloudinary.com',
];
const OPTIMIZABLE_SUFFIX = '.supabase.co';

export function canOptimizeImage(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return OPTIMIZABLE_HOSTS.includes(host) || host.endsWith(OPTIMIZABLE_SUFFIX);
  } catch {
    return false; // relative paths (e.g. preset avatars under /avatars/*.svg) — Next handles those fine unoptimized
  }
}

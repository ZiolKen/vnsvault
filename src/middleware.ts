/**
 * Edge Middleware — everything it imports has to be Edge-safe: jwt.ts
 * (Edge-safe, no bcryptjs) and rateLimit.ts, which now also pulls in
 * redis.ts's Upstash client — that client is fetch-based (REST API, no
 * TCP), so it works from here the same way it works from Node routes.
 *
 * Responsibilities:
 *  1. Block requests to well-known probe/scanner paths before they reach
 *     any route handler (dotfiles, config files, WordPress/phpMyAdmin
 *     scanners, etc.) — cheap, no DB/auth involved.
 *  2. Reject cross-site writes to /api (CSRF-style defense: unsafe methods
 *     must be same-origin or have no Origin header at all, e.g. curl/server-
 *     to-server).
 *  3. Rate-limit the auth endpoints that don't have Turnstile in front of
 *     every request path (logout/me) and add a floor under login/register
 *     even though Turnstile already covers those forms.
 *  4. Gate /admin and /myaccount on a valid session (existing behavior),
 *     and mark private routes non-cacheable / non-indexable.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/jwt';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
import { isMaintenanceOn } from '@/lib/maintenance';

const PROTECTED = ['/admin', '/myaccount'];

// Never gated by maintenance mode, even while it's ON:
//  - /maintenance itself (avoid a rewrite loop)
//  - /admin + /api/admin: an admin must still be able to log in, reach the
//    dashboard, and flip the toggle back off
//  - /api/auth: same reason — login has to keep working for an admin
//  - /api/internal: cron-job.org's shard-check/keep-alive schedulers
//    shouldn't start failing just because the site is in maintenance
//  - /api/health: uptime monitors should keep seeing real status
const MAINTENANCE_EXEMPT_PREFIXES = [
  '/maintenance',
  '/admin',
  '/api/admin',
  '/api/auth',
  '/api/internal',
  '/api/health',
];

// Paths that serve no legitimate purpose on this app and are almost always
// automated scanners/exploit probes. Matched against the raw pathname
// before any auth/DB work happens.
const BLOCKED_PATH_PATTERNS: RegExp[] = [
  /^\/\.env/i,
  /^\/\.git(?:\/|$)/i,
  /^\/\.next(?:\/|$)/i,
  /^\/\.vercel(?:\/|$)/i,
  /^\/\.aws(?:\/|$)/i,
  /^\/\.ssh(?:\/|$)/i,
  /^\/docker-compose\.ya?ml$/i,
  /^\/Dockerfile$/i,
  /^\/middleware\.ts$/i,
  /^\/next\.config\.(?:js|mjs|ts)$/i,
  /^\/package(?:-lock)?\.json$/i,
  /^\/tsconfig(?:\.tsbuildinfo)?\.json$/i,
  /^\/src(?:\/|$)/i,
  /^\/scripts(?:\/|$)/i,
  /^\/wp-admin/i,
  /^\/wp-login\.php/i,
  /^\/wp-content/i,
  /^\/phpmyadmin/i,
  /^\/pma/i,
  /^\/xmlrpc\.php/i,
  /^\/\.well-known\/(?!security\.txt$)/i, // allow /.well-known/security.txt, block probing the rest
  /^\/server-status/i,
  /^\/vendor\/phpunit/i,
];

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Per-route rate limits, keyed by matcher prefix. Checked in order —
// first match wins. Everything else under /api falls back to a generous
// default so normal browsing traffic never gets caught.
const API_RATE_LIMITS: { prefix: string; windowMs: number; max: number }[] = [
  { prefix: '/api/auth/login', windowMs: 60_000, max: 10 },
  { prefix: '/api/auth/register', windowMs: 60_000, max: 5 },
  { prefix: '/api/auth/forgot-password', windowMs: 60_000, max: 4 },
  { prefix: '/api/auth/reset-password', windowMs: 60_000, max: 10 },
  // Tighter than the generic /api rule: each request here carries a
  // multipart file body and writes to Supabase Storage — worth a lower
  // ceiling than plain JSON API calls even though the caller is already
  // admin-gated (requireFreshAdmin runs inside the route itself, after
  // this check). Must stay listed before the generic '/api/games' and
  // '/api' rules below since the first matching prefix wins.
  { prefix: '/api/admin/upload', windowMs: 60_000, max: 20 },
  { prefix: '/api/games', windowMs: 60_000, max: 120 }, // POST/PATCH/DELETE from admin panel
  { prefix: '/api', windowMs: 60_000, max: 240 },
];

function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  // No Origin header at all = not a browser cross-site request (curl,
  // server-to-server, same-tab navigation) — nothing to compare, allow it.
  if (!origin) return true;
  try {
    return new URL(origin).host === req.nextUrl.host;
  } catch {
    return false;
  }
}

function withPrivateHeaders(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store, max-age=0');
  res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (BLOCKED_PATH_PATTERNS.some(pattern => pattern.test(pathname))) {
    return new NextResponse(null, { status: 404 });
  }

  // ── Maintenance mode ────────────────────────────────────────────────
  // Checked before rate limiting/auth so a flipped-on flag takes effect
  // immediately, and before spending a Node function invocation on
  // anything DB-related. An admin session bypasses it entirely (so an
  // admin can browse/verify the live site while it's "down" for everyone
  // else); everyone else gets a rewrite to /maintenance for page requests,
  // or a 503 JSON body for API requests.
  if (!MAINTENANCE_EXEMPT_PREFIXES.some(p => pathname.startsWith(p)) && await isMaintenanceOn()) {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const session = token ? await verifyToken(token) : null;

    if (session?.role !== 'admin') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { success: false, error: 'Website đang bảo trì, vui lòng quay lại sau.' },
          { status: 503, headers: { 'Retry-After': '3600' } }
        );
      }
      const url = req.nextUrl.clone();
      url.pathname = '/maintenance';
      // Not passing `{ status: 503 }` to rewrite() here — Next.js has had
      // open bugs where a status override on rewrite() doesn't actually
      // propagate (vercel/next.js#50155). The page still renders correctly
      // as a 200; Retry-After is set as a best-effort hint for anything
      // that reads it, but this isn't relied on for correctness.
      const res = NextResponse.rewrite(url);
      res.headers.set('Retry-After', '3600');
      return withPrivateHeaders(res);
    }
  }

  const isApiRoute = pathname.startsWith('/api/');

  if (isApiRoute && UNSAFE_METHODS.has(req.method) && !isSameOrigin(req)) {
    return NextResponse.json({ success: false, error: 'Nguồn yêu cầu không hợp lệ.' }, { status: 403 });
  }

  if (isApiRoute) {
    const limitRule = API_RATE_LIMITS.find(rule => pathname.startsWith(rule.prefix));
    if (limitRule) {
      const ip = getClientIp(req.headers);
      const { success, retryAfterSeconds } = await rateLimit(`${limitRule.prefix}:${ip}`, {
        windowMs: limitRule.windowMs,
        max: limitRule.max,
      });
      if (!success) {
        return NextResponse.json(
          { success: false, error: 'Quá nhiều yêu cầu, vui lòng thử lại sau.' },
          { status: 429, headers: retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : undefined }
        );
      }
    }
  }

  const isProtected = PROTECTED.some(p => pathname.startsWith(p));
  if (!isProtected) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;

  if (!session) {
    const redirect = NextResponse.redirect(new URL(`/login?redirect=${encodeURIComponent(pathname)}`, req.url));
    return withPrivateHeaders(redirect);
  }

  // Admin-only paths
  if (pathname.startsWith('/admin') && session.role !== 'admin') {
    const redirect = NextResponse.redirect(new URL('/', req.url));
    return withPrivateHeaders(redirect);
  }

  return withPrivateHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/myaccount/:path*',
    '/api/:path*',
    // Cheap probe-blocking net cast wide, excluding static assets and
    // Next internals so we don't add latency to every image/js/css request.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)',
  ],
};

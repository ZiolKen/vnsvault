/**
 * Edge Middleware — only imports from jwt.ts (Edge-safe, no bcryptjs).
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

const PROTECTED = ['/admin', '/myaccount'];

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

  const isApiRoute = pathname.startsWith('/api/');

  if (isApiRoute && UNSAFE_METHODS.has(req.method) && !isSameOrigin(req)) {
    return NextResponse.json({ success: false, error: 'Nguồn yêu cầu không hợp lệ.' }, { status: 403 });
  }

  if (isApiRoute) {
    const limitRule = API_RATE_LIMITS.find(rule => pathname.startsWith(rule.prefix));
    if (limitRule) {
      const ip = getClientIp(req.headers);
      const { success, retryAfterSeconds } = rateLimit(`${limitRule.prefix}:${ip}`, {
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

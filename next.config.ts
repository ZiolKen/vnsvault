import type { NextConfig } from 'next';

// Content-Security-Policy is NOT set here anymore: it now needs a fresh
// nonce per request (see src/lib/csp.ts), which a static next.config
// header can't provide. src/middleware.ts builds and sets it on every
// response instead — setting it both here (static, 'unsafe-inline') and
// there (per-request, nonced) would just leave two conflicting
// Content-Security-Policy headers on the response.
const SECURITY_HEADERS = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options',        value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Wildcard https hostname turns /_next/image into an open proxy that
      // will fetch+resize any URL on the internet — bandwidth/CPU abuse and
      // a soft SSRF probe. Game covers are admin-entered URLs, so this list
      // only needs to cover hosts admins actually paste links from. Add
      // more specific hostnames here as needed rather than widening back to '**'.
      { protocol: 'https', hostname: 'i.imgur.com' },
      { protocol: 'https', hostname: 'imgur.com' },
      { protocol: 'https', hostname: 'cdn.discordapp.com' },
      { protocol: 'https', hostname: 'media.discordapp.net' },
      { protocol: 'https', hostname: 'i.ibb.co' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'cdn.vnsvault.qzz.io' },
      // Kept for images uploaded before the CDN_BASE_URL switch — their
      // stored URL is still the raw Supabase one and won't be rewritten
      // retroactively. Safe to drop once those rows are backfilled/expired.
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'http',  hostname: 'localhost' },
    ],
    formats:         ['image/avif', 'image/webp'],
    minimumCacheTTL: 86_400,
    deviceSizes:     [390, 640, 750, 1080, 1200, 1920],
    imageSizes:      [48, 96, 192, 256, 384],
  },

  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },

  // Keep pg + bcryptjs out of the Edge bundle entirely
  serverExternalPackages: ['pg', 'pg-native', 'bcryptjs'],

  async redirects() {
    return [
      { source: '/home',    destination: '/',      permanent: true },
      { source: '/library', destination: '/games', permanent: true },
    ];
  },

  async headers() {
    return [
      {
        // Security headers on every response
        source: '/(.*)',
        headers: SECURITY_HEADERS,
      },
      {
        // No-store for all API routes
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

export default nextConfig;

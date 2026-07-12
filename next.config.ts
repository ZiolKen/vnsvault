import type { NextConfig } from 'next';

const CSP = [
  "default-src 'self'",
  // Next.js needs 'unsafe-inline' for styled-jsx/inline bootstrap scripts
  // unless we move to a nonce-based CSP via middleware.
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "frame-src https://challenges.cloudflare.com",
  "connect-src 'self' https://www.google-analytics.com https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "upgrade-insecure-requests",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options',        value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: CSP },
];

const nextConfig: NextConfig = {
  // Limit parallel static-page workers during `next build`.
  // Each worker spawns its own ShardedDb pools; too many workers
  // simultaneously opening connections exhausts Aiven's max_connections.
  experimental: {
    cpus: 3,
  },

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

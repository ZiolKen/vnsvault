/**
 * Content-Security-Policy — nonce-based script-src.
 *
 * Previously script-src carried 'unsafe-inline', which lets the browser
 * execute ANY inline <script> regardless of how it got into the DOM —
 * so the manual escaping in download/[downloadId]/route.ts and
 * layout.tsx (escapeHtmlAttr/toScriptLiteral/safeJsonLd) was the only
 * real defense against stored XSS; the CSP added nothing on top of it.
 *
 * A fresh nonce is generated per-request in middleware.ts, forwarded to
 * the app via the `x-nonce` request header (read with next/headers'
 * `headers()` in Server Components, or `req.headers` in Route Handlers),
 * and stamped into every inline <script>/<Script nonce=...> the app
 * renders itself. Next.js also auto-applies this nonce to the inline
 * scripts it generates internally (hydration/streaming), because the
 * nonce is forwarded on both the request headers AND the response's
 * Content-Security-Policy header — see the "Content Security Policy"
 * guide in the Next.js docs.
 *
 * We rely on host-based allowlisting ('self', google-analytics, etc.) 
 * without 'strict-dynamic', so that Cloudflare's injected external scripts
 * (like email-decode.min.js) can still load from 'self' or Cloudflare domains
 * without needing a nonce.
 */
const FALLBACK_ORIGIN = (process.env.NEXT_PUBLIC_FALLBACK_ORIGIN ?? '').replace(/\/$/, '');

export function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://www.googletagmanager.com https://www.google-analytics.com https://challenges.cloudflare.com https://static.cloudflareinsights.com`,
    // style-src is unchanged for now (still 'unsafe-inline') — this fix is
    // scoped to script-src, which is the directive that actually gates
    // script execution / stored-XSS impact.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    "frame-src https://challenges.cloudflare.com",
    `connect-src 'self' https://www.google-analytics.com https://challenges.cloudflare.com https://cloudflareinsights.com https://static.cloudflareinsights.com${FALLBACK_ORIGIN ? ` ${FALLBACK_ORIGIN}` : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/**
 * 128-bit random nonce, base64-encoded. Built from Web Crypto
 * (`crypto.getRandomValues`) + `btoa` rather than Node's `Buffer` —
 * both are guaranteed-available Web APIs in the Edge Runtime middleware
 * actually executes in, whereas Buffer support there is a polyfill
 * detail we shouldn't depend on.
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

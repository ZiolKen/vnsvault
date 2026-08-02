/**
 * Trusted cross-origin allowlist — ONLY for the primary ↔ backup deployment
 * pair (two separate Vercel accounts running the same codebase, see
 * docs/FALLBACK_DEPLOYMENT.md). Everyone else on the internet is still
 * blocked exactly like before; this does not open the API to arbitrary
 * cross-site callers.
 *
 * Set on BOTH deployments:
 *   TRUSTED_API_ORIGINS=https://vnsvault.com,https://api-backup.vnsvault.com
 * (comma-separated, no trailing slash, scheme+host only — matches the
 * `Origin` header browsers send verbatim.)
 */
const raw = process.env.TRUSTED_API_ORIGINS ?? '';

export const TRUSTED_ORIGINS: ReadonlySet<string> = new Set(
  raw.split(',').map(s => s.trim()).filter(Boolean)
);

export function isTrustedOrigin(origin: string | null): origin is string {
  return !!origin && TRUSTED_ORIGINS.has(origin);
}

/** Headers to echo back on any response the browser must be allowed to read cross-origin. */
export function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

export const CORS_PREFLIGHT_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

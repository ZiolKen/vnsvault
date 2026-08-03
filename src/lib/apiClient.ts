/**
 * Drop-in replacement for `fetch(path, init)` on every `/api/...` call in
 * the app. Tries the primary deployment (same-origin, relative path — no
 * CORS involved, behaves exactly like a plain fetch always has). If that
 * fails in a way that looks like a PLATFORM outage — not a normal app
 * error — it retries the same request against the backup deployment
 * (separate Vercel account, same codebase, see docs/FALLBACK_DEPLOYMENT.md).
 *
 * Deliberately does NOT fall back on ordinary app responses (400/401/403/
 * 404/422 with our usual `{ success: false, error }` JSON body) — those
 * are real, correct answers from a healthy backend. Retrying those against
 * the mirror would just duplicate side effects (e.g. re-submitting a login
 * attempt) for zero benefit and mask real bugs as "the primary is down".
 *
 * Requires on the CLIENT (both deployments, values differ):
 *   NEXT_PUBLIC_FALLBACK_ORIGIN=https://api-backup.vnsvault.com
 * Requires on the SERVER (both deployments, same value):
 *   TRUSTED_API_ORIGINS=https://vnsvault.com,https://api-backup.vnsvault.com
 *   COOKIE_DOMAIN=.vnsvault.com
 *   JWT_SECRET=<identical on both>
 * Leave NEXT_PUBLIC_FALLBACK_ORIGIN unset to run as a normal single
 * deployment — apiFetch then behaves as a transparent passthrough.
 */

const FALLBACK_ORIGIN = (process.env.NEXT_PUBLIC_FALLBACK_ORIGIN ?? '').replace(/\/$/, '');
const PRIMARY_TIMEOUT_MS = 8_000;

/**
 * Manual override for which origin `apiFetch` targets, set from the "Primary
 * / Fallback" switch in the Admin Dashboard. Lets an admin deliberately
 * point every `/api/...` call at the mirror (to verify it's healthy before
 * relying on it) or pin calls to the primary (to rule out the mirror while
 * debugging) without waiting for `looksLikePlatformFailure` to trigger on
 * its own.
 *
 * Stored in Redis (see lib/apiOrigin.ts + PUT /api/admin/api-origin) so the
 * switch is GLOBAL — same idea as the maintenance-mode toggle: one admin
 * flips it, every visitor's browser picks it up, not just the admin's own
 * tab/device. Each tab keeps a short-TTL in-memory cache of the last read
 * (mirroring lib/maintenance.ts's Edge-side cache) so this doesn't cost a
 * Redis round trip on every single `/api/...` call — only once per
 * `OVERRIDE_CACHE_TTL_MS` per tab.
 */
export type ApiOriginMode = 'auto' | 'primary' | 'fallback';
const OVERRIDE_CACHE_TTL_MS = 5_000;
let overrideCache: { mode: ApiOriginMode; expiresAt: number } | null = null;

async function fetchApiOriginMode(): Promise<ApiOriginMode> {
  try {
    // Plain fetch — always same-origin, deliberately NOT routed through
    // apiFetch/fetchFromFallback itself (that would be self-referential,
    // and would mean a broken fallback could never be read/turned back
    // off once selected). Any failure here just fails open to 'auto',
    // which still leaves the normal automatic failover below intact.
    const res = await fetch('/api/api-origin', { cache: 'no-store' });
    if (!res.ok) return 'auto';
    const body = await res.json() as { success?: boolean; data?: { mode?: unknown } };
    const mode = body?.data?.mode;
    return mode === 'primary' || mode === 'fallback' ? mode : 'auto';
  } catch {
    return 'auto';
  }
}

async function getApiOriginOverride(): Promise<ApiOriginMode> {
  if (typeof window === 'undefined') return 'auto';
  if (overrideCache && overrideCache.expiresAt > Date.now()) return overrideCache.mode;
  const mode = await fetchApiOriginMode();
  overrideCache = { mode, expiresAt: Date.now() + OVERRIDE_CACHE_TTL_MS };
  return mode;
}

/**
 * Lets the Admin Dashboard's toggle apply its own change to THIS tab
 * immediately after a successful PUT, instead of waiting out
 * OVERRIDE_CACHE_TTL_MS — purely a same-tab UX nicety; other tabs/users
 * still pick it up via the TTL above once Redis has the new value.
 */
export function primeApiOriginOverride(mode: ApiOriginMode): void {
  overrideCache = { mode, expiresAt: Date.now() + OVERRIDE_CACHE_TTL_MS };
}

/**
 * Statuses that, on THIS app's API, only ever come from Vercel's own edge
 * (a paused/exhausted deployment) rather than a route handler — none of
 * our routes intentionally return these. 402/403 cover Vercel's own
 * "deployment paused" pages; 5xx covers crashes/timeouts; 429 here means
 * Vercel-level throttling, NOT our own rate limiter (that one already
 * returns a proper `{ success:false }` JSON body — see the JSON-shape
 * check below, which lets a real rate-limit response through untouched).
 */
const PLATFORM_FAILURE_STATUSES = new Set([402, 403, 429, 500, 502, 503, 504]);

function withTimeout(ms: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(id) };
}

/** True if `res` looks like a Vercel platform error page rather than a real app response. */
async function looksLikePlatformFailure(res: Response): Promise<boolean> {
  if (!PLATFORM_FAILURE_STATUSES.has(res.status)) return false;
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return true; // HTML/plaintext = not our route
  try {
    const body = await res.clone().json();
    // Every route in this app answers errors as { success: false, ... }.
    // If that shape is missing, this JSON didn't come from our code.
    return typeof body?.success !== 'boolean';
  } catch {
    return true; // unparseable body — definitely not our JSON
  }
}

async function fetchFromFallback(path: string, init: RequestInit): Promise<Response> {
  if (typeof window !== 'undefined') {
    console.warn(`[apiClient] primary unreachable — falling back to ${FALLBACK_ORIGIN}${path}`);
  }
  return fetch(`${FALLBACK_ORIGIN}${path}`, {
    ...init,
    credentials: 'include', // cross-origin: cookie only rides along with this explicit opt-in
  });
}

/**
 * @param path Always a root-relative `/api/...` path — never a full URL.
 *             (Keeping the primary call relative is what lets it stay a
 *             plain same-origin request with zero CORS overhead.)
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!FALLBACK_ORIGIN) {
    // No mirror configured — behave exactly like a normal fetch.
    return fetch(path, init);
  }

  // Manual override wins over automatic detection: 'fallback' skips the
  // primary call entirely (so a broken primary can't still eat the
  // timeout first), 'primary' skips the automatic failover so a flaky
  // mirror can be ruled out while debugging.
  const override = await getApiOriginOverride();
  if (override === 'fallback') {
    return fetchFromFallback(path, init);
  }
  if (override === 'primary') {
    return fetch(path, init);
  }

  const { signal, cancel } = withTimeout(PRIMARY_TIMEOUT_MS);
  try {
    const res = await fetch(path, { ...init, signal });
    cancel();
    if (await looksLikePlatformFailure(res)) {
      return fetchFromFallback(path, init);
    }
    return res;
  } catch {
    // Network error, DNS failure, or our own timeout abort — all read the
    // same as "primary deployment isn't answering right now".
    cancel();
    return fetchFromFallback(path, init);
  }
}

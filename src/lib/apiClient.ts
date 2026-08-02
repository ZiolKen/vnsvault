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

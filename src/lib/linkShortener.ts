/**
 * "Vượt link" ad-monetization integration (bbmkts.com).
 *
 * Real download URLs (`game_downloads.url`) are never sent to the browser
 * — see /api/games/[slug]/download/[downloadId]/route.ts. Instead, that
 * route resolves the real URL server-side, wraps it through bbmkts here,
 * and redirects the browser to the wrapped link. VIP accounts skip the
 * wrap entirely (see the same route).
 *
 * bbmkts.com's own dapi endpoint takes the ORIGINAL url as a query param
 * (`longurl`) and returns the wrapped url as raw text. On any failure it
 * returns an empty body — there is no error payload to parse, so "empty
 * or not http(s)" is treated as failure here.
 */

const BBMKTS_ENDPOINT = 'https://bbmkts.com/dapi';
// Token is a secret in principle — override with BBMKTS_TOKEN in
// production. Falls back to the token already in use so this works
// out of the box.
const DEFAULT_TOKEN = '867bc5213c2306e9662cb445';

let warnedAboutDefaultToken = false;

function getToken(): string {
  const fromEnv = process.env.BBMKTS_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  // The fallback below is committed in source, so it's effectively public.
  // It's an ad-network affiliate token, not an auth secret for this app —
  // worst case of it leaking/being reused is bbmkts revenue attribution,
  // not an account/data compromise — so this warns rather than refusing to
  // start (unlike JWT_SECRET/NEXT_PUBLIC_BASE_URL). Warn once per instance
  // instead of on every download click so it doesn't drown out real errors
  // in the logs.
  if (process.env.NODE_ENV === 'production' && !warnedAboutDefaultToken) {
    warnedAboutDefaultToken = true;
    console.warn('[linkShortener] BBMKTS_TOKEN not set in production — using the committed default token.');
  }
  return DEFAULT_TOKEN;
}

/**
 * Wrap `longUrl` through bbmkts. Returns the wrapped `https://bbmkts.com/go/...`
 * URL, or null if the service errored / timed out / returned something
 * that isn't a usable http(s) URL. Never throws.
 */
export async function wrapDownloadUrl(longUrl: string): Promise<string | null> {
  const token = getToken();
  const api = `${BBMKTS_ENDPOINT}?token=${encodeURIComponent(token)}&longurl=${encodeURIComponent(longUrl)}&format=text`;

  try {
    const res = await fetch(api, {
      method: 'GET',
      // bbmkts is a third-party service outside our control — don't let a
      // slow/hanging response block the user's download click forever.
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const text = (await res.text()).trim();
    // "Lỗi thì nó sẽ không trả về gì" — an empty body is the documented
    // failure mode. Also guard against anything that isn't a plain
    // http(s) URL (HTML error page, JSON error object, etc.) so we never
    // redirect a user's browser to garbage.
    if (!text) return null;
    const parsed = new URL(text);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch (e) {
    console.error('[linkShortener] wrapDownloadUrl failed:', e);
    return null;
  }
}

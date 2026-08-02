/**
 * JWT utilities — Edge Runtime safe (jose only, NO bcryptjs).
 * Used by: middleware, all API routes for token creation/verification.
 */
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import type { SessionPayload } from '@/types';

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  if (process.env.NODE_ENV === 'production') {
    // The fallback below is committed in source, so it's effectively
    // public. Running with it in production would let anyone forge a
    // valid admin JWT. Refuse to start rather than warn-and-continue.
    throw new Error('[FATAL] JWT_SECRET environment variable is not set. Refusing to start.');
  }
  console.warn('[jwt] JWT_SECRET not set — using insecure dev default. NEVER use in production.');
}

const SECRET = new TextEncoder().encode(
  jwtSecret ?? 'vnsvault-dev-secret-change-in-production'
);

export const COOKIE_NAME = 'vnsvault_session';
export const EXPIRES_IN  = 7 * 24 * 60 * 60; // 7 days in seconds

// Set to a shared parent domain (e.g. '.vnsvault.com') on BOTH the primary
// and backup deployments so the session cookie is sent to whichever origin
// the browser is calling — required for the cross-account API fallback
// (see docs/FALLBACK_DEPLOYMENT.md). Leave unset for normal single-deploy
// operation: the cookie then defaults to the exact host, same as before.
// Subdomains of the same registrable domain are "same-site" (SameSite=Lax
// still sends the cookie there), so this alone does NOT require SameSite
// to be loosened to 'none' — only CORS (see middleware.ts) needs handling
// separately, since same-site ≠ same-origin.
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;

export async function createToken(payload: Omit<SessionPayload, 'exp'>): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${EXPIRES_IN}s`)
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function setSessionCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   EXPIRES_IN,
    path:     '/',
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  });
  return res;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  // Deliberately NOT res.cookies.delete() — deletion only works if the
  // Domain attribute matches the cookie being cleared exactly. When
  // COOKIE_DOMAIN is set, delete() would issue a host-only clear that the
  // browser won't match against the domain-scoped cookie, leaving a
  // logged-out user still holding a live session cookie.
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   0,
    path:     '/',
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  });
  return res;
}

export function requireAdmin(s: SessionPayload | null): s is SessionPayload & { role: 'admin' } {
  return s?.role === 'admin';
}

export function requireAuth(s: SessionPayload | null): s is SessionPayload {
  return s !== null;
}

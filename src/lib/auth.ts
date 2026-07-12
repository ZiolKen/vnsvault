/**
 * auth.ts — backward-compatible re-export barrel.
 * Existing imports of '@/lib/auth' continue to work.
 * Middleware MUST only use verifyToken/getSession (Edge-safe functions from jwt.ts).
 */
export {
  COOKIE_NAME, EXPIRES_IN,
  createToken, verifyToken,
  getSession, getSessionFromRequest,
  setSessionCookie, clearSessionCookie,
  requireAdmin, requireAuth,
} from './jwt';

// NOTE: hashPassword / comparePassword intentionally NOT re-exported here
// to prevent them from being bundled by the Edge middleware.
// Import directly from '@/lib/password' in API routes.

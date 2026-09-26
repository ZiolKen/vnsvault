'use client';
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { apiFetch } from '@/lib/apiClient';

interface AuthState {
  loggedIn: boolean;
  /** True once the client-side auth check has completed. */
  ready: boolean;
}

const Ctx = createContext<AuthState>({ loggedIn: false, ready: false });

/**
 * Exposes the viewer's auth state inside ISR-cached game detail pages.
 *
 * /games/[slug] is statically rendered (revalidate = 120s) — there's no
 * server-side session available at render time, so per-user concerns
 * (bookmark status, download links) hydrate on the client after a fast
 * `/api/auth/me` check.  Components that consume `useGameAuth()` render
 * the logged-out fallback on first paint (which is what bots and the
 * edge-cached HTML show), then upgrade to the authenticated UI once
 * `ready` flips to true.
 *
 * When no `GameAuthProvider` wraps a component (e.g. BookmarkButton on
 * /myaccount where the server already knows the session), the default
 * context value `{ loggedIn: false, ready: false }` is inert — those
 * call sites pass an explicit `loggedIn={true}` prop that takes priority.
 */
export function GameAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ loggedIn: false, ready: false });

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return;
        setState({
          loggedIn: Boolean(d?.success && d.data?.username),
          ready: true,
        });
      })
      .catch(() => { if (!cancelled) setState(s => ({ ...s, ready: true })); });
    return () => { cancelled = true; };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useGameAuth() { return useContext(Ctx); }

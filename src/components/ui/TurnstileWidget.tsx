'use client';
import { useEffect, useRef, useCallback } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, opts: TurnstileOpts) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
      execute: (widgetId: string) => void;
      getResponse: (widgetId: string) => string | undefined;
    };
  }
}

interface TurnstileOpts {
  sitekey: string;
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact' | 'invisible';
  appearance?: 'always' | 'execute' | 'interaction-only';
  execution?: 'render' | 'execute';
}

interface TurnstileWidgetProps {
  /** Called with a fresh token whenever one is issued */
  onToken: (token: string) => void;
  /** Called when the token expires (user must re-verify) */
  onExpire?: () => void;
  /**
   * invisible — renders nothing visible; executes automatically.
   * Normal mode shows the CF checkbox widget.
   */
  invisible?: boolean;
  className?: string;
}

const CF_SCRIPT_ID = 'cf-turnstile-script';
const CF_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

export function TurnstileWidget({ onToken, onExpire, invisible = false, className }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef  = useRef<string | null>(null);
  const onTokenRef   = useRef(onToken);
  const onExpireRef  = useRef(onExpire);

  // Keep callbacks fresh without re-running the effect
  onTokenRef.current  = onToken;
  onExpireRef.current = onExpire;

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const renderWidget = useCallback(() => {
    if (!containerRef.current || widgetIdRef.current || !window.turnstile || !siteKey) return;
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey:           siteKey,
      theme:             'dark',
      callback:          (token: string) => onTokenRef.current(token),
      'expired-callback': () => { onExpireRef.current?.(); },
      ...(invisible
        ? { size: 'invisible', appearance: 'interaction-only', execution: 'render' }
        : { size: 'normal' }),
    });
  }, [siteKey, invisible]);

  useEffect(() => {
    if (!siteKey) return; // Site key not configured — skip silently

    if (window.turnstile) {
      renderWidget();
      return;
    }

    // Load CF script once
    if (!document.getElementById(CF_SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id    = CF_SCRIPT_ID;
      script.src   = CF_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = renderWidget;
      document.head.appendChild(script);
    } else {
      // Script already in DOM but not yet ready — poll
      const timer = setInterval(() => {
        if (window.turnstile) { clearInterval(timer); renderWidget(); }
      }, 80);
      return () => clearInterval(timer);
    }
  }, [renderWidget, siteKey]);

  useEffect(() => {
    return () => {
      if (widgetIdRef.current) {
        window.turnstile?.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, []);

  if (!siteKey) return null;

  return (
    <div
      ref={containerRef}
      className={className}
      aria-hidden={invisible}
    />
  );
}

/**
 * Exposes imperative reset so parent can request a fresh token
 * after the previous one was consumed (e.g. after a vote).
 */
export function useTurnstileReset(widgetIdRef: React.RefObject<string | null>) {
  return useCallback(() => {
    if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
  }, [widgetIdRef]);
}

'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  label: string; // aria-label fallback when there's no visible title
  children: ReactNode;
  maxWidthClassName?: string; // e.g. 'max-w-sm', 'max-w-lg'
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Shared modal primitive. Compared to the ad-hoc modal pattern previously
 * duplicated per-feature (VoteModal, etc.), this adds the three a11y/UX
 * gaps that pattern was missing:
 *   - Escape key closes it
 *   - focus is trapped inside while open, and restored to the trigger on close
 *   - body scroll is locked while open (no background scroll on mobile)
 * Exit is animated by delaying unmount until the `.scale-out` animation
 * finishes, instead of vanishing instantly.
 */
export default function Modal({ open, onClose, title, label, children, maxWidthClassName = 'max-w-sm' }: ModalProps) {
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      setRendered(true);
      setClosing(false);
    } else if (rendered) {
      setClosing(true);
      const t = setTimeout(() => {
        setRendered(false);
        (triggerRef.current as HTMLElement | null)?.focus?.();
      }, 150); // matches .scale-out duration
      return () => clearTimeout(t);
    }
  }, [open, rendered]);

  useEffect(() => {
    if (!rendered) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    firstFocusable?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;

      const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [rendered, onClose]);

  if (!rendered) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title ? undefined : label}>
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm ${closing ? '' : 'fade-in'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        className={`relative w-full ${maxWidthClassName} glass rounded-2xl p-6 ${closing ? 'scale-out' : 'scale-in'}`}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 text-muted hover:text-ghost-dim rounded-lg transition-colors press-scale"
          aria-label="Đóng"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {title && <h2 className="font-heading text-base font-bold text-ghost mb-4 pr-6">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

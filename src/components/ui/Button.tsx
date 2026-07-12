'use client';
import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'copper' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  loadingText?: string;
  fullWidth?: boolean;
}

const VARIANT_CLASS: Record<Variant, string> = {
  copper: 'btn-copper',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

/**
 * Shared button primitive — consolidates the spinner markup that used to
 * be copy-pasted into every form (login, register, VoteModal, GameForm...)
 * and adds consistent press feedback (`.press-scale`) without pulling in
 * an animation library.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'copper', loading = false, loadingText, fullWidth, className = '', children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={[
        VARIANT_CLASS[variant],
        'press-scale justify-center',
        fullWidth ? 'w-full' : '',
        (disabled || loading) ? 'opacity-60 cursor-not-allowed' : '',
        className,
      ].filter(Boolean).join(' ')}
      {...rest}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {loadingText ?? children}
        </span>
      ) : children}
    </button>
  );
});

export default Button;

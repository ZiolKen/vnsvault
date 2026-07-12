'use client';
import { InputHTMLAttributes, forwardRef, useId } from 'react';

interface FormFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  /** Rendered inside the input's right edge, e.g. a show/hide-password toggle. */
  trailing?: React.ReactNode;
}

/**
 * Standardizes the label + input + error pattern that was previously
 * hand-rolled slightly differently in login/register/GameForm (different
 * spacing, some missing aria-invalid/aria-describedby wiring for screen
 * readers). Error text slides in with `.slide-up` instead of just
 * appearing, matching the rest of the app's motion language.
 */
const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { label, error, hint, trailing, id, className = '', ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  return (
    <div>
      <label htmlFor={inputId} className="text-xs text-muted mb-1.5 block uppercase tracking-wider">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={['input-base', trailing ? 'pr-10' : '', className].filter(Boolean).join(' ')}
          {...rest}
        />
        {trailing && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</div>
        )}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="slide-up text-xs text-red-400 mt-1.5">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-dim mt-1.5">{hint}</p>
      ) : null}
    </div>
  );
});

export default FormField;

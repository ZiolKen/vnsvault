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
 *
 * `required` (a normal <input> attribute, already part of
 * InputHTMLAttributes) doubles as the trigger for an auto-rendered red "*"
 * after the label — pass `required` and the asterisk shows up for free.
 * Don't also hand-type "*" into `label` for a required field; that would
 * render two.
 */
const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { label, error, hint, trailing, id, className = '', required, 'aria-describedby': externalDescribedBy, ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  // A caller can pass its own aria-describedby (e.g. register's password-
  // strength meter) alongside error/hint. Merge rather than let whichever
  // one applies last silently win — `{...rest}` below spreads after this
  // element's own attributes, so without pulling aria-describedby out of
  // rest first, a caller-supplied value would clobber errorId/hintId
  // (or vice versa) instead of both being announced.
  const internalDescribedBy = error ? errorId : hint ? hintId : undefined;
  const describedBy = [internalDescribedBy, externalDescribedBy].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <label htmlFor={inputId} className="text-xs text-muted mb-1.5 block uppercase tracking-wider">
        {label}
        {required && <span className="text-red-400" aria-hidden="true"> *</span>}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={['input-base', trailing ? 'has-trailing' : '', className].filter(Boolean).join(' ')}
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

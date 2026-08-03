'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Prints the standard "Self-XSS" console warning (the same idea Facebook,
 * Google, etc. show) so anyone tricked into pasting attacker-supplied code
 * into DevTools sees a big red flag first. Lives in the root layout, which
 * only mounts once — the `pathname` dependency re-fires the effect on
 * every client-side navigation too, so it's not just a one-time boot log.
 */
export default function SelfXssWarning() {
  const pathname = usePathname();

  useEffect(() => {
    console.log(
      '%c%s',
      'color: red; background: yellow; font-size: 24px;',
      'WARNING!'
    );
    console.log(
      '%c%s',
      'font-size: 18px;',
      'Using this console may allow attackers to impersonate you and steal your information using an attack called Self-XSS.\nDo not enter or paste code that you do not understand.'
    );
  }, [pathname]);

  return null;
}

'use client';
import { useEffect } from 'react';
import Link from 'next/link';

// NOTE: Navbar lives in the root layout and persists across navigations —
// do NOT mount another one here. A second instance would start with
// `user = null` and briefly look like a fake logout (see app/layout.tsx).
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[Error boundary]', error); }, [error]);

  return (
    <main className="flex-1 pt-16 flex items-center justify-center px-4">
      <div className="text-center max-w-md fade-in">
        <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="font-heading text-2xl font-bold text-ghost mb-3">Đã xảy ra lỗi</h1>
        <p className="text-ghost-dim mb-2">Có gì đó không ổn. Vui lòng thử lại.</p>
        {error.digest && <p className="text-xs text-muted font-mono mb-6">ID: {error.digest}</p>}
        <div className="flex gap-3 justify-center">
          <button onClick={reset} className="btn-copper">Thử lại</button>
          <Link href="/" className="btn-ghost">Trang chủ</Link>
        </div>
      </div>
    </main>
  );
}

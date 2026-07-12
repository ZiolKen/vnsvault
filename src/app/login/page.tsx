'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { TurnstileWidget } from '@/components/ui/TurnstileWidget';
import FormField from '@/components/ui/FormField';
import Button from '@/components/ui/Button';

function LoginForm() {
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [tsToken, setTsToken] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, tsToken }),
      });
      const d = await r.json();
      if (d.success) {
        // Only follow redirect if it's a same-site path — a bare "starts
        // with /" check still lets through "//evil.com" (browsers treat
        // that as protocol-relative), so explicitly reject it too.
        const destination =
          redirectTo && redirectTo.startsWith('/') && !redirectTo.startsWith('//')
            ? redirectTo
            : '/';
        router.push(destination);
        router.refresh();
      }
      else setError(d.error ?? 'Đăng nhập thất bại');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-[100svh] flex items-center justify-center px-4 py-10">
      <div className="absolute inset-0" aria-hidden="true">
        <Image src="/bg.jpg" alt="" fill className="object-cover opacity-20" sizes="100vw" />
        <div className="absolute inset-0 bg-obsidian/75" />
      </div>

      <div className="relative z-10 w-full max-w-sm slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex flex-col items-center gap-2 press-scale" aria-label="VNSVault – Về trang chủ">
            <Image src="/logo.png" alt="VNSVault logo" width={56} height={56} className="drop-shadow-lg" />
            <span className="font-cinzel text-xl font-semibold text-copper-light">VNSVault</span>
          </Link>
        </div>

        <div className="glass rounded-2xl p-6 sm:p-8">
          <h1 className="font-heading text-xl font-bold text-ghost mb-1 text-center">Đăng Nhập</h1>
          <p className="text-sm text-ghost-dim text-center mb-6">Chào mừng bạn trở lại</p>

          {error && (
            <div role="alert" className="slide-up mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4" noValidate>
            <FormField
              label="Email hoặc Tên tài khoản"
              id="login-id"
              value={form.identifier}
              onChange={e => setForm(f => ({ ...f, identifier: e.target.value }))}
              placeholder="Email hoặc username..."
              autoComplete="username"
              required
            />

            <FormField
              label="Mật Khẩu"
              id="login-pw"
              type={showPw ? 'text' : 'password'}
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPw(s => !s)}
                  className="text-muted hover:text-ghost-dim transition-colors p-1 press-scale"
                  aria-label={showPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    {showPw
                      ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
                    }
                  </svg>
                </button>
              }
            />

            {/* Turnstile */}
            <TurnstileWidget
              onToken={setTsToken}
              onExpire={() => setTsToken('')}
              className="flex justify-center"
            />

            <Button type="submit" loading={loading} loadingText="Đang đăng nhập..." fullWidth className="mt-1">
              Đăng Nhập
            </Button>
          </form>

          <p className="text-center text-sm text-ghost-dim mt-6">
            Chưa có tài khoản?{' '}
            <Link href="/register" className="text-copper-light hover:underline underline-offset-2">Đăng ký miễn phí</Link>
          </p>
          <div className="text-center mt-3">
            <Link href="/" className="text-xs text-muted hover:text-ghost-dim transition-colors">← Về trang chủ</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams() (read inside LoginForm) requires a Suspense boundary,
  // otherwise Next.js bails the whole route out of static rendering at
  // build time.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

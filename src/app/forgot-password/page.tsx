'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { TurnstileWidget } from '@/components/ui/TurnstileWidget';
import FormField from '@/components/ui/FormField';
import Button from '@/components/ui/Button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [tsToken, setTsToken] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, tsToken }),
      });
      const d = await r.json();
      if (d.success) setSent(true);
      else setError(d.error ?? 'Đã xảy ra lỗi, vui lòng thử lại.');
    } catch {
      setError('Đã xảy ra lỗi, vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100svh] flex items-center justify-center px-4 py-10">
      <div className="absolute inset-0" aria-hidden="true">
        <Image src="/bg.jpg" alt="" fill className="object-cover opacity-20" sizes="100vw" />
        <div className="absolute inset-0 bg-obsidian/75" />
      </div>

      <div className="relative z-10 w-full max-w-sm slide-up">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex flex-col items-center gap-2 press-scale" aria-label="VNSVault – Về trang chủ">
            <Image src="/logo.png" alt="VNSVault logo" width={56} height={56} className="drop-shadow-lg" />
            <span className="font-cinzel text-xl font-semibold text-copper-light">VNSVault</span>
          </Link>
        </div>

        <div className="glass rounded-2xl p-6 sm:p-8">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-copper/15 text-copper-light">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="font-heading text-xl font-bold text-ghost mb-2">Kiểm tra email của bạn</h1>
              <p className="text-sm text-ghost-dim mb-6">
                Nếu email tồn tại trong hệ thống, chúng tôi đã gửi liên kết đặt lại mật khẩu. Vui lòng kiểm tra hộp thư, kể cả mục Spam.
              </p>
              <Link href="/login" className="text-sm text-copper-light hover:underline underline-offset-2">
                ← Quay lại đăng nhập
              </Link>
            </div>
          ) : (
            <>
              <h1 className="font-heading text-xl font-bold text-ghost mb-1 text-center">Quên Mật Khẩu</h1>
              <p className="text-sm text-ghost-dim text-center mb-6">
                Nhập email của bạn để nhận liên kết đặt lại mật khẩu.
              </p>

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
                  label="Địa chỉ Email"
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="example@domain.com"
                  autoComplete="email"
                  required
                />

                <TurnstileWidget
                  onToken={setTsToken}
                  onExpire={() => setTsToken('')}
                  className="flex justify-center"
                />

                <Button type="submit" loading={loading} loadingText="Đang gửi..." fullWidth className="mt-1">
                  Gửi liên kết đặt lại
                </Button>
              </form>

              <p className="text-center text-sm text-ghost-dim mt-6">
                Nhớ mật khẩu rồi?{' '}
                <Link href="/login" className="text-copper-light hover:underline underline-offset-2">Đăng nhập</Link>
              </p>
              <div className="text-center mt-3">
                <Link href="/" className="text-xs text-muted hover:text-ghost-dim transition-colors">← Về trang chủ</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { TurnstileWidget } from '@/components/ui/TurnstileWidget';
import FormField from '@/components/ui/FormField';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

function ResetPasswordForm() {
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [tsToken, setTsToken] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const token = searchParams.get('token') ?? '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!token) {
      setError('Liên kết không hợp lệ. Vui lòng yêu cầu liên kết mới.');
      return;
    }
    if (form.password.length < 6) {
      setError('Mật khẩu cần ít nhất 6 ký tự');
      return;
    }
    if (form.password !== form.confirm) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }
    setLoading(true);
    try {
      const r = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: form.password, tsToken }),
      });
      const d = await r.json();
      if (d.success) {
        toast.push('Đặt lại mật khẩu thành công! Vui lòng đăng nhập.', 'success');
        router.push('/login');
      } else {
        setError(d.error ?? 'Không thể đặt lại mật khẩu.');
      }
    } catch {
      setError('Đã xảy ra lỗi, vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const pwStrength = form.password.length === 0 ? 0 : form.password.length < 6 ? 1 : form.password.length < 10 ? 2 : 3;
  const pwColors = ['', 'bg-red-500', 'bg-yellow-500', 'bg-emerald-500'];
  const pwLabels = ['', 'Yếu', 'Trung bình', 'Mạnh'];

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
          <h1 className="font-heading text-xl font-bold text-ghost mb-1 text-center">Đặt Lại Mật Khẩu</h1>
          <p className="text-sm text-ghost-dim text-center mb-6">Nhập mật khẩu mới cho tài khoản của bạn</p>

          {error && (
            <div role="alert" className="slide-up mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          {!token && (
            <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-300">
              Liên kết thiếu mã xác thực. Hãy mở đúng liên kết trong email, hoặc{' '}
              <Link href="/forgot-password" className="text-copper-light hover:underline underline-offset-2">yêu cầu liên kết mới</Link>.
            </div>
          )}

          <form onSubmit={submit} className="space-y-4" noValidate>
            <div>
              <FormField
                label="Mật khẩu mới"
                id="reset-pw"
                type={showPw ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Tối thiểu 6 ký tự"
                autoComplete="new-password"
                required
                minLength={6}
                aria-describedby={form.password ? 'reset-pw-strength' : undefined}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPw(s => !s)}
                    className="text-muted hover:text-ghost-dim transition-colors p-1 press-scale"
                    aria-label={showPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                }
              />
              {form.password && (
                <div id="reset-pw-strength" className="mt-2" aria-live="polite">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3].map(level => (
                      <div key={level} className={`h-1 flex-1 rounded-full transition-colors ${pwStrength >= level ? pwColors[pwStrength] : 'bg-border'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-muted">Độ mạnh: <span className={pwStrength === 1 ? 'text-red-400' : pwStrength === 2 ? 'text-yellow-400' : 'text-emerald-400'}>{pwLabels[pwStrength]}</span></p>
                </div>
              )}
            </div>

            <FormField
              label="Xác nhận mật khẩu"
              id="reset-pw-confirm"
              type={showPw ? 'text' : 'password'}
              value={form.confirm}
              onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
              placeholder="Nhập lại mật khẩu mới"
              autoComplete="new-password"
              required
              minLength={6}
            />

            <TurnstileWidget
              onToken={setTsToken}
              onExpire={() => setTsToken('')}
              className="flex justify-center"
            />

            <Button type="submit" loading={loading} loadingText="Đang đặt lại..." fullWidth className="mt-1" disabled={!token}>
              Đặt Lại Mật Khẩu
            </Button>
          </form>

          <div className="text-center mt-6">
            <Link href="/login" className="text-sm text-copper-light hover:underline underline-offset-2">← Quay lại đăng nhập</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  // useSearchParams() (read inside ResetPasswordForm) requires a Suspense
  // boundary, otherwise Next.js bails the whole route out of static
  // rendering at build time — same pattern as the login page.
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

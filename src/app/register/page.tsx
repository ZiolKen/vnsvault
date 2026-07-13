'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { TurnstileWidget } from '@/components/ui/TurnstileWidget';
import FormField from '@/components/ui/FormField';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

export default function RegisterPage() {
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [tsToken, setTsToken] = useState('');
  const router = useRouter();
  const toast = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) { setError('Mật khẩu cần ít nhất 6 ký tự'); return; }
    setLoading(true);
    try {
      const r = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, tsToken }),
      });
      const d = await r.json();
      if (d.success) {
        // Toast confirmation matters here specifically because the very
        // next line navigates away — without it there'd be no visible
        // sign the registration actually succeeded before the homepage
        // replaces this whole form.
        toast.push(`Chào mừng ${form.username}! Tài khoản đã được tạo.`, 'success');
        router.push('/');
        router.refresh();
      }
      else setError(d.error ?? 'Đăng ký thất bại');
    } finally { setLoading(false); }
  };

  const pwStrength = form.password.length === 0 ? 0 : form.password.length < 6 ? 1 : form.password.length < 10 ? 2 : 3;
  const pwColors   = ['', 'bg-red-500', 'bg-yellow-500', 'bg-emerald-500'];
  const pwLabels   = ['', 'Yếu', 'Trung bình', 'Mạnh'];

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
          <h1 className="font-heading text-xl font-bold text-ghost mb-1 text-center">Tạo Tài Khoản</h1>
          <p className="text-sm text-ghost-dim text-center mb-6">Tham gia cộng đồng VNSVault</p>

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
              label="Tên hiển thị"
              id="reg-username"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              placeholder="vd: vault_fan_2026"
              autoComplete="username"
              required
              minLength={3}
            />

            <FormField
              label="Địa chỉ Email"
              id="reg-email"
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="example@domain.com"
              autoComplete="email"
              required
            />

            <div>
              <FormField
                label="Mật khẩu"
                id="reg-pw"
                type={showPw ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Tối thiểu 6 ký tự"
                autoComplete="new-password"
                required
                minLength={6}
                aria-describedby={form.password ? 'pw-strength' : undefined}
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
                <div id="pw-strength" className="mt-2" aria-live="polite">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3].map(level => (
                      <div key={level} className={`h-1 flex-1 rounded-full transition-colors ${pwStrength >= level ? pwColors[pwStrength] : 'bg-border'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-muted">Độ mạnh: <span className={pwStrength === 1 ? 'text-red-400' : pwStrength === 2 ? 'text-yellow-400' : 'text-emerald-400'}>{pwLabels[pwStrength]}</span></p>
                </div>
              )}
            </div>

            {/* Turnstile */}
            <TurnstileWidget
              onToken={setTsToken}
              onExpire={() => setTsToken('')}
              className="flex justify-center"
            />

            <Button type="submit" loading={loading} loadingText="Đang tạo tài khoản..." fullWidth className="mt-1">
              Đăng Ký Tài Khoản
            </Button>
          </form>

          <p className="text-center text-xs text-ghost-dim mt-5">
            Bằng cách đăng ký, bạn đồng ý với{' '}
            <Link href="/terms" className="text-copper-light hover:text-copper transition-colors underline underline-offset-2">
              điều khoản sử dụng
            </Link>{' '}
            của VNSVault.
          </p>
          <p className="text-center text-sm text-ghost-dim mt-3">
            Đã có tài khoản?{' '}
            <Link href="/login" className="text-copper-light hover:underline underline-offset-2">Đăng nhập</Link>
          </p>
          <div className="text-center mt-2">
            <Link href="/" className="text-xs text-muted hover:text-ghost-dim transition-colors">← Về trang chủ</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

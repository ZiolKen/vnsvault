'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/apiClient';
import type { VipPlan, VipOrder } from '@/types';

// ─── Plan definitions (mirrored from server, kept minimal) ──────────
const PLANS: VipPlan[] = [
  { id: '1m',  label: 'Gói 1 Tháng',  months: 1,  price: 19_000 },
  { id: '12m', label: 'Gói 1 Năm',    months: 12, price: 199_000 },
];

type CheckoutState =
  | { step: 'select' }
  | { step: 'paying'; order: VipOrder & { qrUrl: string }; secondsLeft: number }
  | { step: 'success'; order: VipOrder }
  | { step: 'error'; message: string };

export default function DonateVipClient({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [state, setState] = useState<CheckoutState>({ step: 'select' });
  const [creating, setCreating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const startCheckout = useCallback(async (planId: string) => {
    if (!isLoggedIn) return;
    setCreating(true);
    try {
      const res = await apiFetch('/api/account/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setState({ step: 'error', message: data.error ?? 'Lỗi tạo đơn hàng' });
        return;
      }

      const order = data.data as VipOrder & { qrUrl: string };
      const expiresMs = new Date(order.expires_at).getTime() - Date.now();
      const secondsLeft = Math.max(0, Math.floor(expiresMs / 1000));

      setState({ step: 'paying', order, secondsLeft });

      // Start countdown
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = setInterval(() => {
        setState(prev => {
          if (prev.step !== 'paying') return prev;
          const next = prev.secondsLeft - 1;
          if (next <= 0) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            if (pollRef.current) clearInterval(pollRef.current);
            return { step: 'select' };
          }
          return { ...prev, secondsLeft: next };
        });
      }, 1000);

      // Start polling for payment confirmation
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const r = await apiFetch(`/api/account/orders/${order.id}`);
          const d = await r.json();
          if (d.success && d.data.status === 'paid') {
            if (pollRef.current) clearInterval(pollRef.current);
            if (countdownRef.current) clearInterval(countdownRef.current);
            setState({ step: 'success', order: d.data });
          } else if (d.success && (d.data.status === 'expired' || d.data.status === 'cancelled')) {
            if (pollRef.current) clearInterval(pollRef.current);
            if (countdownRef.current) clearInterval(countdownRef.current);
            setState({ step: 'select' });
          }
        } catch { /* ignore polling errors */ }
      }, 3000);
    } catch {
      setState({ step: 'error', message: 'Lỗi kết nối' });
    } finally {
      setCreating(false);
    }
  }, [isLoggedIn]);

  const cancelOrder = useCallback(async (orderId: string) => {
    try {
      await apiFetch(`/api/account/orders/${orderId}/cancel`, { method: 'POST' });
    } catch { /* ignore */ }
    if (pollRef.current) clearInterval(pollRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setState({ step: 'select' });
  }, []);

  // ── Render: Plan selection ──────────────────────────────────────────
  if (state.step === 'select' || state.step === 'error') {
    return (
      <div id="vip-pricing" className="bg-gradient-to-br from-copper/10 via-surface to-surface border border-copper/30 rounded-xl p-5 scroll-mt-24">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl" aria-hidden="true">👑</span>
          <h2 className="font-heading text-base font-bold text-ghost">Đăng Ký VIP</h2>
        </div>
        <p className="text-sm text-ghost-dim mb-4">
          Tài khoản VIP tải game <strong className="text-copper-light">trực tiếp, không cần vượt link</strong> quảng cáo.
        </p>

        {state.step === 'error' && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 mb-4">
            {state.message}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          {PLANS.map(plan => (
            <button
              key={plan.id}
              type="button"
              disabled={creating || !isLoggedIn}
              onClick={() => startCheckout(plan.id)}
              className={`bg-surface border rounded-xl p-4 text-center transition-all hover:border-copper/60 hover:shadow-lg hover:shadow-copper/10 disabled:opacity-50 disabled:cursor-not-allowed ${
                plan.id === '12m' ? 'relative border-2 border-copper/50' : 'border-border'
              }`}
            >
              {plan.id === '12m' && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] px-2 py-0.5 bg-copper text-obsidian rounded-full font-bold whitespace-nowrap">
                  Tiết kiệm hơn
                </span>
              )}
              <p className="text-xs text-muted uppercase tracking-wider mb-1.5">{plan.label}</p>
              <p className="font-cinzel text-2xl font-bold text-copper-light leading-none">
                {(plan.price / 1000).toFixed(0)}K<span className="text-xs text-muted font-sans font-normal">₫</span>
              </p>
              <p className="text-xs text-muted mt-1">/ {plan.months === 1 ? 'tháng' : 'năm'}</p>
            </button>
          ))}
        </div>

        {!isLoggedIn && (
          <div className="bg-vault/60 border border-border rounded-lg p-3.5 text-xs text-ghost-dim leading-relaxed mb-4">
            <strong className="text-copper-light">⚠ Bạn cần đăng nhập</strong> để mua gói VIP.{' '}
            <Link href="/login?redirect=/donate" className="text-copper-light underline">Đăng nhập ngay</Link>
          </div>
        )}

        {isLoggedIn && (
          <div className="bg-vault/60 border border-border rounded-lg p-3.5 text-xs text-ghost-dim leading-relaxed mb-4">
            Bấm vào gói bạn muốn mua. Hệ thống sẽ tạo mã QR riêng cho bạn — quét bằng <strong className="text-ghost">MoMo, VietQR</strong> hoặc bất kỳ ứng dụng ngân hàng nào. VIP sẽ được <strong className="text-ghost">kích hoạt tự động</strong> trong vài giây sau khi chuyển khoản.
          </div>
        )}

        <p className="text-xs text-muted text-center">
          Cần hỗ trợ? Liên hệ qua{' '}
          <a href="mailto:contact@ziolken.qzz.io" target="_blank" rel="noopener noreferrer" className="text-copper-light underline">Email</a>{' '}
          hoặc{' '}
          <a href="https://t.me/ZiolKen" target="_blank" rel="noopener noreferrer" className="text-copper-light underline">Telegram</a>.
        </p>
      </div>
    );
  }

  // ── Render: Paying (QR + countdown + polling) ──────────────────────
  if (state.step === 'paying') {
    const { order, secondsLeft } = state;
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;

    return (
      <div id="vip-pricing" className="bg-gradient-to-br from-copper/10 via-surface to-surface border border-copper/30 rounded-xl p-5 scroll-mt-24">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl" aria-hidden="true">📱</span>
          <h2 className="font-heading text-base font-bold text-ghost">Quét Mã QR Để Thanh Toán</h2>
        </div>
        <p className="text-sm text-ghost-dim mb-4">
          <span className="font-medium text-ghost">{order.months} tháng VIP</span> —{' '}
          <span className="text-copper-light font-semibold">{order.expected_amount.toLocaleString('vi-VN')}₫</span>
        </p>

        {/* QR Code */}
        <div className="flex flex-col items-center gap-4 mb-5">
          <div className="bg-white rounded-2xl p-3 shadow-xl shadow-black/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={order.qrUrl}
              alt="Mã QR thanh toán VIP VNSVault"
              width={260}
              height={300}
              className="rounded-lg"
            />
          </div>

          {/* Countdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Hết hạn trong:</span>
            <span className={`font-mono text-sm font-bold ${secondsLeft < 120 ? 'text-red-400' : 'text-copper-light'}`}>
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </span>
          </div>

          {/* Waiting animation */}
          <div className="flex items-center gap-2 text-xs text-ghost-dim">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-copper/60 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-copper" />
            </span>
            Đang chờ thanh toán...
          </div>
        </div>

        <div className="bg-vault/60 border border-border rounded-lg p-3 text-xs text-ghost-dim leading-relaxed mb-4">
          <p className="mb-1">Mã đơn hàng: <code className="text-copper-light font-mono">{order.order_code}</code></p>
          <p>Quét mã QR bằng <strong className="text-ghost">MoMo, VietQR, hoặc app ngân hàng</strong>. Sau khi chuyển khoản, VIP sẽ được kích hoạt tự động — <strong className="text-ghost">không cần thoát trang này</strong>.</p>
        </div>

        <button
          type="button"
          onClick={() => cancelOrder(order.id)}
          className="w-full py-2.5 text-sm text-muted border border-border rounded-xl hover:text-red-400 hover:border-red-500/30 transition-colors"
        >
          Hủy giao dịch
        </button>
      </div>
    );
  }

  // ── Render: Success ────────────────────────────────────────────────
  if (state.step === 'success') {
    return (
      <div id="vip-pricing" className="bg-gradient-to-br from-emerald-500/10 via-surface to-surface border border-emerald-500/30 rounded-xl p-5 scroll-mt-24">
        <div className="text-center py-6">
          <p className="text-5xl mb-4" aria-hidden="true">🎉</p>
          <h2 className="font-heading text-xl font-bold text-ghost mb-2">Đăng Ký VIP Thành Công!</h2>
          <p className="text-sm text-ghost-dim mb-1">
            Bạn đã được cộng <strong className="text-emerald-400">{state.order.months} tháng VIP</strong>.
          </p>
          <p className="text-xs text-muted mb-6">Bây giờ bạn có thể tải game trực tiếp, không cần vượt link quảng cáo.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/games" className="btn-copper text-sm">Khám phá thư viện</Link>
            <Link href="/myaccount" className="btn-ghost text-sm">Xem tài khoản</Link>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

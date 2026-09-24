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

// Keep in sync with MAX_LINE_QUANTITY in the orders API route.
const MAX_LINE_QUANTITY = 20;

interface CartLine {
  plan: VipPlan;
  quantity: number;
}

// The checkout popup: clicking a plan opens/adds to `review` (a real cart —
// multiple plans, editable quantities, no order created yet). The
// "Thanh Toán" button inside it creates the order and moves to `paying`
// (QR code), which resolves to `success` once the webhook confirms the
// transfer.
type ModalState =
  | { step: 'closed' }
  | { step: 'review' }
  | { step: 'creating' }
  | { step: 'paying'; order: VipOrder & { qrUrl: string }; secondsLeft: number }
  | { step: 'success'; order: VipOrder };

export default function DonateVipClient({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [modal, setModal] = useState<ModalState>({ step: 'closed' });
  const [cart, setCart] = useState<CartLine[]>([]);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Whenever the popup closes — for any reason (manual close, cancel,
  // auto-expiry) — the cart resets, so the next plan click starts a fresh
  // checkout rather than resuming a stale one.
  useEffect(() => {
    if (modal.step === 'closed') setCart([]);
  }, [modal.step]);

  // Extra safety net on top of the on-screen warning: while a payment is
  // actually in flight, warn on tab close/refresh/navigate-away so people
  // don't lose track of an order mid-transfer.
  useEffect(() => {
    if (modal.step !== 'paying') return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [modal.step]);

  const addToCart = useCallback((plan: VipPlan) => {
    if (!isLoggedIn) return;
    setError('');
    setCart(prev => {
      const idx = prev.findIndex(l => l.plan.id === plan.id);
      if (idx === -1) return [...prev, { plan, quantity: 1 }];
      const next = [...prev];
      next[idx] = { ...next[idx], quantity: Math.min(MAX_LINE_QUANTITY, next[idx].quantity + 1) };
      return next;
    });
    setModal(m => (m.step === 'closed' ? { step: 'review' } : m));
  }, [isLoggedIn]);

  const changeQuantity = useCallback((planId: string, delta: number) => {
    setCart(prev =>
      prev
        .map(l => (l.plan.id === planId ? { ...l, quantity: Math.min(MAX_LINE_QUANTITY, l.quantity + delta) } : l))
        .filter(l => l.quantity > 0)
    );
  }, []);

  const removeLine = useCallback((planId: string) => {
    setCart(prev => prev.filter(l => l.plan.id !== planId));
  }, []);

  const closeModal = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setModal({ step: 'closed' });
  }, []);

  const startCheckout = useCallback(async () => {
    if (cart.length === 0) return;
    setModal({ step: 'creating' });
    try {
      const res = await apiFetch('/api/account/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(l => ({ planId: l.plan.id, quantity: l.quantity })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Lỗi tạo đơn hàng');
        setModal({ step: 'closed' });
        return;
      }

      const order = data.data as VipOrder & { qrUrl: string };
      const expiresMs = new Date(order.expires_at).getTime() - Date.now();
      const secondsLeft = Math.max(0, Math.floor(expiresMs / 1000));

      setModal({ step: 'paying', order, secondsLeft });

      // Start countdown
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = setInterval(() => {
        setModal(prev => {
          if (prev.step !== 'paying') return prev;
          const next = prev.secondsLeft - 1;
          if (next <= 0) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            if (pollRef.current) clearInterval(pollRef.current);
            return { step: 'closed' };
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
            setModal({ step: 'success', order: d.data });
          } else if (d.success && (d.data.status === 'expired' || d.data.status === 'cancelled')) {
            if (pollRef.current) clearInterval(pollRef.current);
            if (countdownRef.current) clearInterval(countdownRef.current);
            setModal({ step: 'closed' });
          }
        } catch { /* ignore polling errors */ }
      }, 3000);
    } catch {
      setError('Lỗi kết nối');
      setModal({ step: 'closed' });
    }
  }, [cart]);

  const cancelOrder = useCallback(async (orderId: string) => {
    try {
      await apiFetch(`/api/account/orders/${orderId}/cancel`, { method: 'POST' });
    } catch { /* ignore */ }
    if (pollRef.current) clearInterval(pollRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setModal({ step: 'closed' });
  }, []);

  const cartTotal = cart.reduce((sum, l) => sum + l.plan.price * l.quantity, 0);

  return (
    <>
      {/* ── Plan selection panel ───────────────────────────────────────── */}
      <div id="vip-pricing" className="bg-gradient-to-br from-copper/10 via-surface to-surface border border-copper/30 rounded-xl p-5 scroll-mt-24">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl" aria-hidden="true">👑</span>
          <h2 className="font-heading text-base font-bold text-ghost">Đăng Ký VIP</h2>
        </div>
        <p className="text-sm text-ghost-dim mb-4">
          Tài khoản VIP tải game <strong className="text-copper-light">trực tiếp, không cần vượt link</strong> quảng cáo.
        </p>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 mb-4">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          {PLANS.map(plan => (
            <button
              key={plan.id}
              type="button"
              disabled={!isLoggedIn}
              onClick={() => addToCart(plan)}
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
            Bấm vào gói bạn muốn mua để xem giỏ hàng — có thể chỉnh số lượng hoặc thêm gói khác trước khi thanh toán. VIP sẽ được <strong className="text-ghost">kích hoạt tự động</strong> trong vài giây sau khi chuyển khoản.
          </div>
        )}

        <p className="text-xs text-muted text-center">
          Cần hỗ trợ? Liên hệ qua{' '}
          <a href="mailto:contact@ziolken.qzz.io" target="_blank" rel="noopener noreferrer" className="text-copper-light underline">Email</a>{' '}
          hoặc{' '}
          <a href="https://t.me/ZiolKen" target="_blank" rel="noopener noreferrer" className="text-copper-light underline">Telegram</a>.
        </p>
      </div>

      {/* ── Checkout popup ─────────────────────────────────────────────── */}
      {modal.step !== 'closed' && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => {
            // Only the "review" (cart) step can be dismissed by clicking
            // outside — once payment has actually started, closing must be
            // a deliberate action (the "Hủy giao dịch" button below),
            // matching the do-not-leave-the-page warning shown there.
            if (modal.step === 'review') closeModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="vip-checkout-title"
            className={`w-full bg-surface border border-copper/30 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden ${
              modal.step === 'paying' ? 'max-w-2xl' : 'max-w-sm'
            }`}
            onClick={e => e.stopPropagation()}
          >
            {/* Step 1: cart — line items, editable quantity, add more plans */}
            {modal.step === 'review' && (
              <>
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <h3 id="vip-checkout-title" className="font-heading text-base font-bold text-ghost">Giỏ Hàng</h3>
                  <button type="button" onClick={closeModal} aria-label="Đóng"
                    className="text-ghost-dim hover:text-ghost text-lg leading-none w-7 h-7 flex items-center justify-center rounded-lg hover:bg-vault transition-colors">
                    ✕
                  </button>
                </div>

                <div className="max-h-[45vh] overflow-y-auto">
                  {cart.length === 0 ? (
                    <p className="px-5 py-6 text-sm text-ghost-dim text-center">Giỏ hàng trống — chọn gói bên dưới để thêm.</p>
                  ) : (
                    cart.map(line => (
                      <div key={line.plan.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 px-5 py-3 border-b border-border last:border-b-0">
                        <div className="flex items-center gap-3 flex-1 min-w-[150px]">
                          <span className="w-9 h-9 rounded-lg bg-copper/15 flex items-center justify-center text-base shrink-0" aria-hidden="true">👑</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-ghost truncate">{line.plan.label}</p>
                            <p className="text-xs text-muted">{line.plan.price.toLocaleString('vi-VN')}₫ / gói</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between w-full sm:w-auto gap-3">
                          <div className="flex items-center gap-1.5 shrink-0 pl-12 sm:pl-0">
                            <button type="button" onClick={() => changeQuantity(line.plan.id, -1)}
                              aria-label={`Giảm số lượng ${line.plan.label}`}
                              className="w-6 h-6 rounded-md border border-border text-ghost-dim hover:text-ghost hover:border-copper/40 flex items-center justify-center text-sm leading-none transition-colors">
                              −
                            </button>
                            <span className="w-5 text-center text-sm text-ghost tabular-nums">{line.quantity}</span>
                            <button type="button" onClick={() => changeQuantity(line.plan.id, 1)}
                              disabled={line.quantity >= MAX_LINE_QUANTITY}
                              aria-label={`Tăng số lượng ${line.plan.label}`}
                              className="w-6 h-6 rounded-md border border-border text-ghost-dim hover:text-ghost hover:border-copper/40 flex items-center justify-center text-sm leading-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                              +
                            </button>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <p className="text-sm font-semibold text-ghost-dim whitespace-nowrap text-right shrink-0">
                              {(line.plan.price * line.quantity).toLocaleString('vi-VN')}₫
                            </p>
                            <button type="button" onClick={() => removeLine(line.plan.id)}
                              aria-label={`Xóa ${line.plan.label} khỏi giỏ hàng`}
                              className="text-ghost-dim hover:text-red-400 text-sm leading-none shrink-0 transition-colors">
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Add another package */}
                <div className="px-5 pt-3 pb-1 flex flex-wrap gap-2">
                  {PLANS.map(plan => (
                    <button key={plan.id} type="button" onClick={() => addToCart(plan)}
                      className="text-xs px-3 py-1.5 rounded-full border border-border text-ghost-dim hover:text-copper-light hover:border-copper/40 transition-colors">
                      + {plan.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between px-5 py-4 mt-2 border-t border-border">
                  <p className="text-sm font-medium text-ghost">Tổng cộng</p>
                  <p className="font-cinzel text-xl font-bold text-copper-light">
                    {cartTotal.toLocaleString('vi-VN')}₫
                  </p>
                </div>

                <div className="px-5 pb-5">
                  <button type="button" onClick={startCheckout} disabled={cart.length === 0}
                    className="btn-copper w-full justify-center py-3 disabled:opacity-50 disabled:cursor-not-allowed">
                    Thanh Toán
                  </button>
                </div>
              </>
            )}

            {/* Brief loading state while the order is created */}
            {modal.step === 'creating' && (
              <div className="flex flex-col items-center gap-3 px-5 py-14">
                <span className="w-6 h-6 border-2 border-copper/40 border-t-copper rounded-full animate-spin" aria-hidden="true" />
                <p className="text-sm text-ghost-dim">Đang tạo đơn hàng...</p>
              </div>
            )}

            {/* Step 2: QR + countdown + polling */}
            {modal.step === 'paying' && (() => {
              const { order, secondsLeft } = modal;
              const mins = Math.floor(secondsLeft / 60);
              const secs = secondsLeft % 60;
              return (
                <>
                  <div className="px-5 py-4 border-b border-border">
                    <h3 id="vip-checkout-title" className="font-heading text-base font-bold text-ghost flex items-center gap-2">
                      <span aria-hidden="true">📱</span> Quét Mã QR Để Thanh Toán
                    </h3>
                  </div>

                  <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left Column: QR Code & Status */}
                    <div className="flex flex-col items-center justify-center">
                      <p className="text-sm text-ghost-dim mb-4 text-center">
                        <span className="font-medium text-ghost">{order.months} tháng VIP</span> —{' '}
                        <span className="text-copper-light font-semibold">{order.expected_amount.toLocaleString('vi-VN')}₫</span>
                      </p>

                      <div className="bg-white rounded-2xl p-3 shadow-xl shadow-black/40 mb-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={order.qrUrl}
                          alt="Mã QR thanh toán VIP VNSVault"
                          width={220}
                          height={260}
                          className="rounded-lg"
                        />
                      </div>

                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-muted">Hết hạn trong:</span>
                        <span className={`font-mono text-sm font-bold ${secondsLeft < 120 ? 'text-red-400' : 'text-copper-light'}`}>
                          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-ghost-dim">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-copper/60 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-copper" />
                        </span>
                        Đang chờ thanh toán...
                      </div>
                    </div>

                    {/* Right Column: Info & Warning & Action */}
                    <div className="flex flex-col">
                      <div className="bg-vault/60 border border-border rounded-lg p-3 text-sm text-ghost-dim leading-relaxed mb-4">
                        <p className="mb-2">Mã đơn hàng: <code className="text-copper-light font-mono bg-black/20 px-1 py-0.5 rounded">{order.order_code}</code></p>
                        <p>Quét mã QR bằng <strong className="text-ghost">MoMo, VietQR, hoặc app ngân hàng</strong>. VIP sẽ được kích hoạt tự động sau khi chuyển khoản.</p>
                      </div>

                      {/* Do-not-close-the-page warning */}
                      <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm text-amber-300 leading-relaxed mb-6">
                        <span aria-hidden="true" className="mt-0.5">⚠️</span>
                        <p><strong>Không tắt hoặc rời khỏi trang này</strong> cho đến khi thanh toán hoàn tất.</p>
                      </div>

                      <div className="mt-auto">
                        <button
                          type="button"
                          onClick={() => cancelOrder(order.id)}
                          className="w-full py-2.5 text-sm text-muted border border-border rounded-xl hover:text-red-400 hover:border-red-500/30 transition-colors"
                        >
                          Hủy giao dịch
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}

            {/* Step 3: success */}
            {modal.step === 'success' && (
              <div className="text-center px-5 py-8">
                <p className="text-5xl mb-4" aria-hidden="true">🎉</p>
                <h3 id="vip-checkout-title" className="font-heading text-lg font-bold text-ghost mb-2">Đăng Ký VIP Thành Công!</h3>
                <p className="text-sm text-ghost-dim mb-1">
                  Bạn đã được cộng <strong className="text-emerald-400">{modal.order.months} tháng VIP</strong>.
                </p>
                <p className="text-xs text-muted mb-6">Thông tin đơn hàng đã được gửi qua email của bạn.</p>
                <div className="flex gap-3 justify-center flex-wrap">
                  <Link href="/games" className="btn-copper text-sm" onClick={closeModal}>Khám phá thư viện</Link>
                  <Link href="/myaccount" className="btn-ghost text-sm" onClick={closeModal}>Xem tài khoản</Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

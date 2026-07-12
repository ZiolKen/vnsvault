'use client';
import { useState } from 'react';
import { TurnstileWidget } from '@/components/ui/TurnstileWidget';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

interface Props {
  requestTitle: string;
  alreadyVoted: boolean;
  onConfirm: (tsToken: string) => Promise<{ success: boolean; error?: string }>;
  onClose: () => void;
}

/**
 * Click Vote → this modal opens → user completes the visible Turnstile
 * challenge → a "Xác Nhận" button lights up → user clicks it to actually
 * cast the vote.
 *
 * Now built on the shared <Modal> primitive, which adds Escape-to-close,
 * a focus trap, and body-scroll lock — none of which the original
 * hand-rolled version had.
 *
 * ★ Explicit confirm step ★
 * Solving the checkbox used to call onConfirm() the instant a token was
 * issued — one click on a captcha and the vote was already cast, with no
 * moment to back out. Turnstile now only stores the token; the actual vote
 * only happens when the person clicks the confirm button.
 */
export default function VoteModal({ requestTitle, alreadyVoted, onConfirm, onClose }: Props) {
  const [tsToken, setTsToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    if (!tsToken || submitting) return;
    setError('');
    setSubmitting(true);
    const res = await onConfirm(tsToken);
    setSubmitting(false);
    if (res.success) {
      onClose();
    } else {
      setError(res.error ?? 'Xác minh thất bại, vui lòng thử lại.');
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      label="Xác minh bình chọn"
      maxWidthClassName="max-w-sm"
    >
      <div className="text-center mb-5">
        <div className="w-12 h-12 rounded-full bg-copper/15 flex items-center justify-center mx-auto mb-3" aria-hidden="true">
          <svg className="w-5 h-5 text-copper-light" fill={alreadyVoted ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </div>
        <h2 className="font-heading text-base font-bold text-ghost mb-1">
          {alreadyVoted ? 'Bỏ bình chọn?' : 'Xác minh để bình chọn'}
        </h2>
        <p className="text-sm text-ghost-dim line-clamp-2">{requestTitle}</p>
      </div>

      {error && (
        <div role="alert" className="slide-up mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex justify-center min-h-[65px] items-center">
        <TurnstileWidget onToken={setTsToken} onExpire={() => setTsToken('')} />
      </div>

      <Button
        type="button"
        onClick={handleConfirm}
        disabled={!tsToken}
        loading={submitting}
        loadingText="Đang xác nhận..."
        fullWidth
      >
        {alreadyVoted ? 'Xác Nhận Bỏ Vote' : 'Xác Nhận Bình Chọn'}
      </Button>

      <p className="text-xs text-dim text-center mt-3">
        {tsToken ? `Bấm nút trên để ${alreadyVoted ? 'bỏ' : 'gửi'} bình chọn.` : 'Hoàn thành xác minh bên trên trước.'}
      </p>
    </Modal>
  );
}

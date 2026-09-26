'use client';
import Link from 'next/link';
import { useGameAuth } from '@/components/games/GameAuthProvider';

export default function DownloadAuthMessage({ slug }: { slug: string }) {
  const { loggedIn, ready } = useGameAuth();

  // If not ready yet, we assume logged out to match SSR and prevent layout shift.
  // Once ready and logged in, we hide the login prompt.
  if (ready && loggedIn) {
    return (
      <p className="text-sm text-ghost-dim mb-5 leading-relaxed">
        Mọi liên kết tải xuống đều được kiểm tra và cam kết an toàn.
      </p>
    );
  }

  return (
    <p className="text-sm text-ghost-dim mb-5 leading-relaxed">
      Mọi liên kết tải xuống đều được kiểm tra và cam kết an toàn.{' '}
      <Link href={`/login?redirect=/games/${slug}`} className="text-copper-light underline hover:text-copper">
        Đăng nhập
      </Link>{' '}
      để truy cập link tải.
    </p>
  );
}

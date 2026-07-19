import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Đang Bảo Trì | VNSVault',
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-obsidian">
      <div className="max-w-md w-full text-center">
        <div className="text-6xl mb-6" aria-hidden="true">🚧</div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold text-ghost mb-3">
          VNSVault đang bảo trì
        </h1>
        <p className="text-ghost-dim mb-2">
          Bọn mình đang cập nhật hệ thống. Trang sẽ hoạt động trở lại trong ít phút nữa.
        </p>
        <p className="text-muted text-sm">
          Cảm ơn bạn đã kiên nhẫn chờ đợi 💛
        </p>
      </div>
    </main>
  );
}

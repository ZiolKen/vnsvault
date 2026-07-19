'use client';
import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

export default function MaintenanceToggle() {
  const toast = useToast();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/admin/maintenance')
      .then(r => r.json())
      .then(d => { if (d.success) setEnabled(d.data.enabled); })
      .catch(() => toast.push('Không thể tải trạng thái bảo trì', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async () => {
    const next = !enabled;
    setSaving(true);
    try {
      const r = await fetch('/api/admin/maintenance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.success) {
        setEnabled(next);
        toast.push(next ? 'Đã BẬT chế độ bảo trì' : 'Đã TẮT chế độ bảo trì', 'success');
      } else {
        toast.push(d?.error ?? 'Lỗi cập nhật', 'error');
      }
    } catch {
      toast.push('Lỗi kết nối', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="font-cinzel text-2xl font-bold text-ghost">Chế Độ Bảo Trì</h1>
        <p className="text-ghost-dim text-sm mt-1">
          Khi bật, mọi người dùng thường (không phải admin) sẽ thấy trang bảo trì thay vì nội dung thật.
          Admin vẫn xem/thao tác được bình thường để kiểm tra trước khi tắt lại.
        </p>
      </div>

      <div className={`flex items-center justify-between p-5 rounded-xl border ${
        enabled ? 'bg-red-500/10 border-red-500/30' : 'bg-surface border-border'
      }`}>
        <div>
          <p className={`font-semibold ${enabled ? 'text-red-400' : 'text-ghost'}`}>
            {loading ? 'Đang tải...' : enabled ? '🚧 Đang BẬT bảo trì' : '✅ Website đang hoạt động bình thường'}
          </p>
          <p className="text-xs text-ghost-dim mt-1">
            {enabled
              ? 'Toàn bộ trang công khai (games, trang chủ, tài khoản...) đang trả về trang bảo trì.'
              : 'Người dùng đang truy cập bình thường.'}
          </p>
        </div>
        <Button
          onClick={toggle}
          disabled={loading || saving}
          variant={enabled ? 'danger' : 'copper'}
        >
          {saving ? 'Đang lưu...' : enabled ? 'Tắt bảo trì' : 'Bật bảo trì'}
        </Button>
      </div>

      <p className="text-xs text-muted mt-4">
        Lưu ý: trạng thái này lưu ở Redis, có hiệu lực gần như ngay lập tức (tối đa ~5 giây trễ do cache
        nhẹ ở tầng middleware) — không cần redeploy.
      </p>
    </div>
  );
}

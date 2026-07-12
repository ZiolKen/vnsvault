import type { Metadata } from 'next';
import Link from 'next/link';

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://vnsvault.vercel.app';
const LAST_UPDATED = '18/06/2026';

export const metadata: Metadata = {
  title: 'Điều Khoản Sử Dụng',
  description: 'Điều khoản sử dụng VNSVault — quy định về tài khoản, nội dung bản dịch, link tải và trách nhiệm khi sử dụng nền tảng.',
  alternates: { canonical: `${BASE}/terms` },
  robots: { index: true },
};

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: '1. Giới thiệu',
    body: (
      <p>
        VNSVault là nền tảng phi lợi nhuận, chia sẻ các bản Việt hóa Visual Novel do cộng đồng dịch giả
        thực hiện. Bằng việc tạo tài khoản hoặc sử dụng website, bạn đồng ý với các điều khoản dưới đây.
        Nếu không đồng ý, vui lòng không tiếp tục sử dụng dịch vụ.
      </p>
    ),
  },
  {
    title: '2. Tài khoản người dùng',
    body: (
      <ul className="list-disc pl-5 space-y-1.5">
        <li>Bạn chịu trách nhiệm bảo mật thông tin đăng nhập và mọi hoạt động diễn ra dưới tài khoản của mình.</li>
        <li>Không tạo tài khoản giả, không mạo danh người khác, không dùng tài khoản để spam hoặc phá hoại bình chọn/đề xuất game.</li>
        <li>VNSVault có quyền khóa hoặc xóa tài khoản vi phạm các điều khoản này mà không cần báo trước.</li>
      </ul>
    ),
  },
  {
    title: '3. Bản chất nội dung & bản quyền',
    body: (
      <ul className="list-disc pl-5 space-y-1.5">
        <li>
          Các bản Việt hóa được đăng tải là sản phẩm do cộng đồng dịch giả thực hiện trên nền game gốc của
          nhà phát triển/nhà phát hành tương ứng. VNSVault <strong>không</strong> sở hữu và không tuyên bố
          sở hữu bản quyền đối với nội dung, hình ảnh, nhân vật hay cốt truyện gốc của các game này.
        </li>
        <li>Việc đăng tải nhằm mục đích phi thương mại, chia sẻ cộng đồng. VNSVault không thu phí tải game hoặc bản dịch.</li>
        <li>
          Nếu bạn là chủ sở hữu bản quyền và muốn yêu cầu gỡ một bản dịch/link cụ thể, vui lòng liên hệ qua
          thông tin ở cuối trang — yêu cầu hợp lệ sẽ được xử lý trong thời gian sớm nhất.
        </li>
      </ul>
    ),
  },
  {
    title: '4. Link tải & độ chính xác',
    body: (
      <ul className="list-disc pl-5 space-y-1.5">
        <li>Link tải do dịch giả hoặc quản trị viên cung cấp, có thể trỏ đến dịch vụ lưu trữ của bên thứ ba (Google Drive, Mega, F95Zone…).</li>
        <li>VNSVault không kiểm soát được tính khả dụng lâu dài của các dịch vụ bên thứ ba này — link có thể hết hạn hoặc bị gỡ ngoài ý muốn.</li>
        <li>Nếu phát hiện link lỗi, hỏng hoặc sai, vui lòng dùng nút <em>“Báo cáo tại đây”</em> trên trang chi tiết game để báo cho quản trị viên.</li>
        <li>Luôn quét virus file đã tải trước khi chạy. VNSVault không chịu trách nhiệm với thiệt hại phát sinh từ file tải về từ link do bên thứ ba lưu trữ.</li>
      </ul>
    ),
  },
  {
    title: '5. Phân loại độ tuổi nội dung',
    body: (
      <p>
        Một số Visual Novel trên VNSVault được gắn nhãn 16+ hoặc 18+ theo nội dung gốc của game (bạo lực,
        yếu tố tình dục, ngôn từ nhạy cảm…). Bạn tự chịu trách nhiệm tuân thủ quy định pháp luật về độ tuổi
        tại khu vực mình sinh sống trước khi tải hoặc chơi các nội dung này.
      </p>
    ),
  },
  {
    title: '6. Đề xuất & bình chọn game',
    body: (
      <p>
        Tính năng đề xuất/bình chọn dùng để cộng đồng cùng quyết định game nào nên được ưu tiên Việt hóa.
        VNSVault không đảm bảo mọi đề xuất sẽ được thực hiện — việc dịch phụ thuộc vào thời gian và nguồn
        lực thực tế của các dịch giả tham gia.
      </p>
    ),
  },
  {
    title: '7. Ủng hộ / donate',
    body: (
      <p>
        Mọi khoản ủng hộ là hoàn toàn tự nguyện, dùng để duy trì chi phí vận hành (server, domain) và động
        viên dịch giả. Donate không phải là giao dịch mua bán và không tạo ra quyền sở hữu hay đặc quyền
        truy cập nội dung nào trên VNSVault.
      </p>
    ),
  },
  {
    title: '8. Thay đổi điều khoản',
    body: (
      <p>
        VNSVault có thể cập nhật điều khoản này khi cần thiết để phản ánh thay đổi về tính năng hoặc quy
        định pháp lý. Ngày cập nhật gần nhất được ghi ở đầu trang. Việc tiếp tục sử dụng dịch vụ sau khi
        điều khoản được cập nhật đồng nghĩa bạn chấp nhận các thay đổi đó.
      </p>
    ),
  },
  {
    title: '9. Liên hệ',
    body: (
      <p>
        Mọi thắc mắc về điều khoản, yêu cầu gỡ nội dung hoặc báo cáo vi phạm, vui lòng liên hệ qua{' '}
        <a href="https://t.me/ZiolKen" target="_blank" rel="noopener noreferrer" className="text-copper-light hover:text-copper underline underline-offset-2">
          Telegram
        </a>{' '}
        hoặc{' '}
        <a href="mailto:contact@ziolken.qzz.io" className="text-copper-light hover:text-copper underline underline-offset-2">
          email
        </a>.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <main className="pt-16 flex-1" id="main-content">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Breadcrumb */}
        <nav className="breadcrumb mb-6" aria-label="Breadcrumb">
          <Link href="/">Trang chủ</Link>
          <span aria-hidden="true">›</span>
          <span className="text-ghost-dim text-sm">Điều Khoản Sử Dụng</span>
        </nav>

        <div className="mb-10">
          <div className="flex items-center gap-2 mb-3" aria-hidden="true">
            <span className="w-5 h-px bg-copper" />
            <span className="text-xs uppercase tracking-widest text-copper-light font-semibold">Pháp lý</span>
          </div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-ghost mb-2">Điều Khoản Sử Dụng</h1>
          <p className="text-sm text-muted">Cập nhật lần cuối: {LAST_UPDATED}</p>
        </div>

        <div className="space-y-8">
          {SECTIONS.map(s => (
            <section key={s.title} className="bg-surface border border-border rounded-xl p-5 sm:p-6">
              <h2 className="font-heading text-base font-bold text-ghost mb-3">{s.title}</h2>
              <div className="text-sm text-ghost-dim leading-relaxed [&_strong]:text-ghost [&_em]:text-copper-light [&_em]:not-italic">
                {s.body}
              </div>
            </section>
          ))}
        </div>

        <p className="text-xs text-muted text-center mt-10">
          Tài liệu này mang tính thông tin chung, không phải tư vấn pháp lý chính thức.
        </p>
      </div>
    </main>
  );
}

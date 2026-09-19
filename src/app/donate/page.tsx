import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getSession } from '@/lib/jwt';
import DonateVipClient from './DonateVipClient';

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://vnsvault.vercel.app';

export const metadata: Metadata = {
  title: 'Ủng Hộ Website',
  description: 'Ủng hộ VNSVault để giữ link tải game, cập nhật bản mới và ra thêm nhiều bản dịch Visual Novel tiếng Việt. Miễn phí, không ép buộc.',
  alternates: { canonical: `${BASE}/donate` },
  openGraph: {
    title: 'Ủng Hộ Website | VNSVault',
    description: 'Ủng hộ VNSVault để duy trì kho Visual Novel Việt hóa miễn phí.',
    url: `${BASE}/donate`,
    images: [{ url: '/donate-qr.jpeg', width: 400, height: 450, alt: 'QR Donate VNSVault' }],
  },
};

const BENEFITS = [
  { icon: '🔗', title: 'Link luôn sạch', desc: 'Có thêm thời gian kiểm tra link lỗi, mirror hỏng và phản hồi báo cáo game nhanh hơn.' },
  { icon: '⚡', title: 'Cập nhật nhanh hơn', desc: 'Bản dịch được theo dõi và cập nhật theo phiên bản mới của nhà phát triển.' },
  { icon: '🔍', title: 'Kiểm tra kỹ hơn', desc: 'Lỗi chính tả, lỗi dịch và lỗi font được xử lý cẩn thận hơn.' },
  { icon: '📚', title: 'Thêm game mới', desc: 'Mỗi khoản ủng hộ giúp mở rộng danh sách game được Việt hóa.' },
  { icon: '💖', title: 'Bản dịch sống lâu', desc: 'Các bản Việt hóa được duy trì và không bị xóa vì thiếu động lực.' },
  { icon: '🚀', title: 'Server tốc độ cao', desc: 'Đảm bảo tốc độ tải game nhanh và ổn định cho toàn bộ cộng đồng.' },
];

export default async function DonatePage() {
  const session = await getSession();
  const isLoggedIn = !!session;

  return (
    <main className="pt-16 flex-1" id="main-content">
        {/* ── Hero banner ── */}
        <div className="relative overflow-hidden py-16 sm:py-24 border-b border-border/60">
          <div className="absolute inset-0" aria-hidden="true">
            <Image src="/bg.jpg" alt="" fill className="object-cover opacity-15" sizes="100vw" />
            <div className="absolute inset-0 bg-gradient-to-t from-obsidian to-transparent" />
          </div>
          <div className="relative z-10 max-w-3xl mx-auto px-4 text-center">
            <nav className="breadcrumb justify-center mb-6" aria-label="Breadcrumb">
              <Link href="/">Trang chủ</Link>
              <span aria-hidden="true">›</span>
              <span className="text-ghost-dim text-sm">Ủng Hộ</span>
            </nav>
            <div className="flex items-center gap-2 justify-center mb-4" aria-hidden="true">
              <span className="w-8 h-px bg-copper" />
              <span className="text-xs uppercase tracking-widest text-copper-light font-semibold">Tự nguyện</span>
              <span className="w-8 h-px bg-copper" />
            </div>
            <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold text-ghost mb-5">
              Ủng Hộ Website
            </h1>
            <p className="text-ghost-dim leading-relaxed max-w-xl mx-auto">
              Nếu bạn tìm được nhiều game thú vị tại VNSVault, một lời cảm ơn hoặc khoản ủng hộ nhỏ sẽ giúp dịch giả có thêm động lực giữ link, cập nhật bản mới và tiếp tục ra thêm nhiều bản dịch.
            </p>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 py-14 sm:py-16">
          {/* ── VIP notice ── */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-10 p-4 sm:p-5 bg-copper/10 border border-copper/30 rounded-2xl">
            <span className="text-2xl shrink-0" aria-hidden="true">👑</span>
            <p className="text-sm text-ghost-dim flex-1">
              <span className="text-copper-light font-semibold">Đã có gói VIP!</span>{' '}
              Đăng ký để tải game <strong className="text-ghost">trực tiếp, không cần vượt link quảng cáo</strong> — chọn gói phù hợp bên dưới. VIP được kích hoạt <strong className="text-ghost">tự động</strong> sau khi chuyển khoản.
            </p>
            <a href="#vip-pricing" className="btn-copper text-sm shrink-0 justify-center">Mua VIP ngay ↓</a>
          </div>

          {/* ── Main content grid ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
            {/* QR Code card — static donation */}
            <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8 flex flex-col items-center gap-5">
              <div>
                <h2 className="font-heading text-xl font-bold text-ghost text-center mb-1">Quét QR Để Ủng Hộ</h2>
                <p className="text-sm text-ghost-dim text-center">Hỗ trợ MoMo, VietQR, Napas 247 và tất cả ứng dụng ngân hàng</p>
              </div>

              <div className="bg-white rounded-2xl p-4 shadow-xl shadow-black/40" role="img" aria-label="Mã QR ủng hộ VNSVault qua MoMo, VietQR, Napas247">
                <Image
                  src="/donate-qr.jpeg"
                  alt="QR Code Ủng Hộ VNSVault – quét bằng MoMo, VietQR hoặc ứng dụng ngân hàng"
                  width={260}
                  height={300}
                  className="rounded-lg"
                  priority
                />
              </div>

              <p className="text-xs text-muted text-center">
                Quét bằng ứng dụng ngân hàng, MoMo, ZaloPay, VietQR...
              </p>

              {/* Payment logos */}
              <div className="flex items-center gap-3 text-xs text-muted">
                <span className="px-2 py-1 bg-vault border border-border rounded text-[10px] font-medium">MoMo</span>
                <span className="px-2 py-1 bg-vault border border-border rounded text-[10px] font-medium">VietQR</span>
                <span className="px-2 py-1 bg-vault border border-border rounded text-[10px] font-medium">Napas 247</span>
              </div>
            </div>

            {/* VIP pricing + purchase — interactive */}
            <div className="flex flex-col gap-5">
              {/* Thank you message */}
              <div className="bg-copper/5 border border-copper/25 rounded-xl p-5">
                <h2 className="font-heading text-base font-bold text-ghost mb-2 flex items-center gap-2">
                  <span className="text-copper" aria-hidden="true">✦</span> Lời Cảm Ơn
                </h2>
                <p className="text-sm text-ghost-dim leading-relaxed">
                  Cảm ơn bạn đã nghĩ đến việc ủng hộ. Mỗi khoản đóng góp bất kể lớn nhỏ đều là nguồn động lực to lớn giúp nhóm dịch duy trì hoạt động và ra thêm nhiều tựa game chất lượng. VNSVault trân trọng mọi sự ủng hộ của bạn! ❤
                </p>
              </div>

              {/* Interactive VIP purchase component */}
              <DonateVipClient isLoggedIn={isLoggedIn} />
            </div>
          </div>

          {/* ── Full benefits section ── */}
          <section aria-labelledby="benefits-heading">
            <div className="text-center mb-8">
              <h2 id="benefits-heading" className="font-heading text-xl sm:text-2xl font-bold text-ghost mb-2">
                Khoản Ủng Hộ Của Bạn Giúp Gì?
              </h2>
              <p className="text-ghost-dim text-sm">Mỗi đồng đóng góp đều có ý nghĩa với cộng đồng VNSVault</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {BENEFITS.map(b => (
                <div key={b.title} className="bg-surface border border-border rounded-xl p-5 hover:border-copper/30 transition-colors">
                  <span className="text-2xl mb-3 block" aria-hidden="true">{b.icon}</span>
                  <h3 className="font-heading text-sm font-semibold text-ghost mb-2">{b.title}</h3>
                  <p className="text-xs text-ghost-dim leading-relaxed">{b.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── CTA back to games ── */}
          <div className="mt-14 text-center">
            <p className="text-ghost-dim text-sm mb-4">Hoặc nếu bạn chưa muốn ủng hộ, hãy khám phá thư viện game nhé!</p>
            <Link href="/games" className="btn-ghost">← Quay lại thư viện game</Link>
          </div>
        </div>
    </main>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://vnsvault.vercel.app';
const LAST_UPDATED = '23/09/2026';

export const metadata: Metadata = {
  title: 'Điều Khoản Sử Dụng',
  description: 'Điều khoản sử dụng VNSVault — quy định chi tiết về tài khoản, nội dung bản dịch, link tải, gói VIP, thanh toán, bản quyền và trách nhiệm khi sử dụng nền tảng.',
  alternates: { canonical: `${BASE}/terms` },
  robots: { index: true },
};

const CONTACT_BLOCK = (
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
);

const SECTIONS: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: 'gioi-thieu',
    title: '1. Giới thiệu & phạm vi áp dụng',
    body: (
      <>
        <p>
          VNSVault (&ldquo;chúng tôi&rdquo;, &ldquo;nền tảng&rdquo;, &ldquo;website&rdquo;) là một dự án phi lợi
          nhuận, vận hành bởi cộng đồng, nơi các bản Việt hóa Visual Novel do dịch giả tự nguyện thực hiện được
          tổng hợp và chia sẻ miễn phí. Điều khoản này áp dụng cho toàn bộ nội dung, tính năng và dịch vụ được
          cung cấp tại VNSVault, bao gồm nhưng không giới hạn ở: thư viện game, hệ thống tài khoản, tính năng đề
          xuất/bình chọn, báo cáo lỗi link, gói VIP và trang ủng hộ (donate).
        </p>
        <p className="mt-3">
          Bằng việc truy cập website, tạo tài khoản, hoặc thực hiện bất kỳ giao dịch nào (kể cả donate hoặc mua
          VIP), bạn xác nhận đã đọc, hiểu và đồng ý chịu sự ràng buộc của các điều khoản này cũng như mọi phiên
          bản cập nhật sau đó. Nếu không đồng ý với bất kỳ nội dung nào, vui lòng ngừng sử dụng dịch vụ ngay lập
          tức.
        </p>
      </>
    ),
  },
  {
    id: 'dinh-nghia',
    title: '2. Định nghĩa thuật ngữ',
    body: (
      <ul className="list-disc pl-5 space-y-1.5">
        <li><strong>&ldquo;Nền tảng&rdquo; / &ldquo;Dịch vụ&rdquo;</strong>: website VNSVault và toàn bộ tính năng liên quan.</li>
        <li><strong>&ldquo;Nội dung&rdquo;</strong>: bao gồm bản Việt hóa, hình ảnh bìa/banner, mô tả game, bình luận, đề xuất, báo cáo và mọi dữ liệu hiển thị trên nền tảng.</li>
        <li><strong>&ldquo;Bản Việt hóa&rdquo; / &ldquo;Bản dịch&rdquo;</strong>: bản vá (patch) ngôn ngữ do dịch giả tạo ra, chạy trên nền game gốc của nhà phát triển/nhà phát hành.</li>
        <li><strong>&ldquo;Dịch giả&rdquo;</strong>: cá nhân hoặc nhóm thực hiện bản dịch, có thể là thành viên cộng đồng độc lập, không nhất thiết là nhân sự chính thức của VNSVault.</li>
        <li><strong>&ldquo;Link tải&rdquo;</strong>: liên kết trỏ đến file game/bản dịch, thường được lưu trữ tại dịch vụ của bên thứ ba.</li>
        <li><strong>&ldquo;Tài khoản VIP&rdquo;</strong>: gói trả phí có thời hạn, mở khóa tính năng tải trực tiếp không qua trang trung gian/quảng cáo.</li>
        <li><strong>&ldquo;Bạn&rdquo; / &ldquo;Người dùng&rdquo;</strong>: bất kỳ cá nhân truy cập hoặc sử dụng nền tảng, có hoặc không có tài khoản.</li>
      </ul>
    ),
  },
  {
    id: 'dieu-kien-su-dung',
    title: '3. Điều kiện sử dụng & độ tuổi',
    body: (
      <ul className="list-disc pl-5 space-y-1.5">
        <li>Để tạo tài khoản, mua gói VIP hoặc thực hiện donate, bạn cần có đủ năng lực hành vi dân sự theo quy định pháp luật tại nơi bạn cư trú.</li>
        <li>VNSVault khuyến nghị người dùng từ 16 tuổi trở lên. Người dùng dưới độ tuổi này cần có sự đồng ý và giám sát của cha mẹ/người giám hộ hợp pháp khi sử dụng dịch vụ.</li>
        <li>
          Với các game/bản dịch được gắn nhãn 18+ (xem Mục 9), bạn xác nhận đã đủ tuổi truy cập nội dung người
          lớn theo pháp luật khu vực mình. VNSVault <strong>không</strong> thực hiện xác minh tuổi kỹ thuật —
          trách nhiệm tuân thủ hoàn toàn thuộc về người dùng.
        </li>
        <li>Bạn không được tạo tài khoản mới nếu tài khoản trước đó của bạn đã bị khóa vĩnh viễn vì vi phạm điều khoản.</li>
      </ul>
    ),
  },
  {
    id: 'tai-khoan',
    title: '4. Tài khoản người dùng',
    body: (
      <ul className="list-disc pl-5 space-y-1.5">
        <li>Thông tin đăng ký (tên hiển thị, email, mật khẩu) phải chính xác và thuộc quyền sở hữu hợp pháp của bạn — không sử dụng thông tin của người khác hoặc thông tin giả mạo.</li>
        <li>Bạn chịu trách nhiệm bảo mật thông tin đăng nhập và toàn bộ hoạt động diễn ra dưới tài khoản của mình, kể cả khi thông tin bị lộ do lỗi bảo mật thuộc về bạn (dùng lại mật khẩu, chia sẻ tài khoản…).</li>
        <li>Mỗi cá nhân chỉ nên sử dụng một tài khoản. Việc tạo nhiều tài khoản nhằm lách giới hạn hệ thống, gian lận bình chọn, hoặc né tránh lệnh khóa trước đó đều bị coi là vi phạm.</li>
        <li>Không mạo danh người khác (bao gồm dịch giả, quản trị viên VNSVault), không dùng tài khoản để spam hoặc phá hoại tính năng đề xuất/bình chọn game.</li>
        <li>Khôi phục mật khẩu được thực hiện qua email đã đăng ký — hãy giữ email của bạn luôn còn hoạt động và có thể truy cập.</li>
        <li>
          VNSVault có quyền tạm khóa, hạn chế hoặc xóa tài khoản vi phạm các điều khoản này mà không cần báo
          trước, đặc biệt trong trường hợp gian lận, phá hoại hệ thống hoặc vi phạm pháp luật. Xem thêm về hệ
          quả với gói VIP đang hoạt động tại Mục 12.
        </li>
      </ul>
    ),
  },
  {
    id: 'hanh-vi-nghiem-cam',
    title: '5. Các hành vi bị nghiêm cấm',
    body: (
      <>
        <p>Khi sử dụng VNSVault, bạn đồng ý <strong>không</strong> thực hiện các hành vi sau:</p>
        <ul className="list-disc pl-5 space-y-1.5 mt-2">
          <li>Mạo danh, tạo tài khoản giả, hoặc dùng nhiều tài khoản để lách giới hạn hệ thống, gian lận bình chọn/đề xuất game.</li>
          <li>Gửi báo cáo lỗi link sai sự thật, spam yêu cầu game, hoặc lạm dụng các tính năng cộng đồng khác nhằm gây nhiễu cho quản trị viên.</li>
          <li>Cố ý né tránh hoặc phá vỡ các cơ chế bảo vệ của hệ thống (xác minh chống bot, giới hạn tần suất truy cập, tường lửa ứng dụng), hoặc dò quét lỗ hổng an ninh mà không có sự cho phép bằng văn bản từ VNSVault.</li>
          <li>Thu thập dữ liệu tự động (crawl/scrape) ở quy mô gây quá tải hệ thống hoặc phục vụ mục đích thương mại trái phép mà không có sự đồng ý trước.</li>
          <li>Đăng tải, đính kèm hoặc liên kết tới mã độc, phần mềm gián điệp, nội dung lừa đảo (phishing), hoặc bất kỳ nội dung nào vi phạm pháp luật Việt Nam và pháp luật quốc tế liên quan.</li>
          <li>Sử dụng danh tiếng, tên hoặc mã QR ủng hộ của VNSVault để lừa đảo, kêu gọi quyên góp trái phép tại nơi khác.</li>
          <li>Truy cập hoặc cố gắng truy cập khu vực quản trị (<code className="text-copper-light">/admin</code>) hoặc các API nội bộ khi không được cấp quyền.</li>
        </ul>
        <p className="mt-3">
          Vi phạm bất kỳ điều nào trong mục này có thể dẫn đến việc nội dung liên quan bị gỡ, tài khoản bị khóa
          ngay lập tức, và trong trường hợp cấu thành hành vi vi phạm pháp luật, thông tin liên quan có thể được
          cung cấp cho cơ quan chức năng có thẩm quyền khi được yêu cầu hợp lệ.
        </p>
      </>
    ),
  },
  {
    id: 'ban-quyen',
    title: '6. Bản chất nội dung & bản quyền',
    body: (
      <ul className="list-disc pl-5 space-y-1.5">
        <li>
          Các bản Việt hóa được đăng tải là sản phẩm do cộng đồng dịch giả thực hiện trên nền game gốc của nhà
          phát triển/nhà phát hành tương ứng. VNSVault <strong>không</strong> sở hữu và không tuyên bố sở hữu bản
          quyền đối với nội dung, hình ảnh, nhân vật, cốt truyện hay mã nguồn gốc của các game này.
        </li>
        <li>Việc đăng tải nhằm mục đích phi thương mại, chia sẻ cộng đồng và bảo tồn nỗ lực dịch thuật. VNSVault không thu phí tải game hoặc bản dịch dưới bất kỳ hình thức nào; gói VIP (Mục 11) chỉ tính phí cho trải nghiệm tải trực tiếp, không bán nội dung.</li>
        <li>Dịch giả giữ quyền được ghi công (credit) cho bản dịch của mình. Việc sao chép, chỉnh sửa hoặc phát hành lại bản Việt hóa dưới danh nghĩa khác mà không ghi nguồn/xin phép dịch giả gốc là hành vi không được khuyến khích và có thể bị gỡ khỏi nền tảng nếu có tranh chấp.</li>
        <li>Thương hiệu, logo, giao diện và mã nguồn của website VNSVault (không bao gồm nội dung game/bản dịch) thuộc quyền sở hữu của nhóm vận hành và không được sao chép, phát hành lại nhằm mục đích thương mại mà không có sự cho phép.</li>
      </ul>
    ),
  },
  {
    id: 'go-noi-dung',
    title: '7. Yêu cầu gỡ nội dung / khiếu nại bản quyền',
    body: (
      <>
        <p>
          Nếu bạn là chủ sở hữu bản quyền hợp pháp (hoặc đại diện được ủy quyền) của một game, bản dịch, hoặc nội
          dung cụ thể đang được lưu trữ/liên kết trên VNSVault và muốn yêu cầu gỡ bỏ, vui lòng gửi yêu cầu kèm
          các thông tin sau qua kênh liên hệ ở Mục 21:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 mt-2">
          <li>Tên game/bản dịch và đường link cụ thể (URL trang chi tiết hoặc link tải) cần gỡ.</li>
          <li>Bằng chứng xác nhận quyền sở hữu hoặc quyền đại diện hợp pháp đối với nội dung đó.</li>
          <li>Thông tin liên hệ (email/Telegram) để VNSVault phản hồi và xác minh.</li>
          <li>Mô tả ngắn gọn về hành vi vi phạm bị khiếu nại.</li>
        </ul>
        <p className="mt-3">
          VNSVault sẽ xem xét và phản hồi yêu cầu hợp lệ trong thời gian sớm nhất có thể, thông thường trong vòng
          3–7 ngày làm việc. Trong thời gian xác minh, nội dung liên quan có thể bị tạm ẩn để phòng ngừa rủi ro.
          Nếu yêu cầu bị xác định là không có căn cứ hoặc lạm dụng quy trình khiếu nại nhằm gỡ nội dung hợp lệ của
          người khác, VNSVault có quyền từ chối yêu cầu và bảo lưu nội dung đang hiển thị.
        </p>
      </>
    ),
  },
  {
    id: 'link-tai',
    title: '8. Link tải & trách nhiệm với bên thứ ba',
    body: (
      <ul className="list-disc pl-5 space-y-1.5">
        <li>Link tải do dịch giả hoặc quản trị viên cung cấp, có thể trỏ đến dịch vụ lưu trữ của bên thứ ba (Google Drive, Mega, F95Zone…). Tính năng VIP (Mục 11) chỉ giúp bỏ qua bước trung gian/quảng cáo — file vẫn được lưu trữ tại cùng nguồn bên thứ ba đó.</li>
        <li>VNSVault không kiểm soát và không đảm bảo tính khả dụng lâu dài của các dịch vụ lưu trữ bên thứ ba này — link có thể hết hạn, bị giới hạn băng thông, hoặc bị gỡ ngoài ý muốn của chúng tôi.</li>
        <li>Nếu phát hiện link lỗi, hỏng hoặc sai, vui lòng dùng nút <em>&ldquo;Báo cáo tại đây&rdquo;</em> trên trang chi tiết game để báo cho quản trị viên xử lý. Việc gửi báo cáo sai sự thật hoặc spam báo cáo có thể khiến IP/tài khoản của bạn bị hạn chế tạm thời khỏi tính năng này.</li>
        <li>Luôn quét virus/malware đối với file đã tải trước khi chạy. VNSVault không chịu trách nhiệm với bất kỳ thiệt hại nào (mất dữ liệu, nhiễm mã độc, lỗi hệ thống…) phát sinh từ file tải về từ link do bên thứ ba lưu trữ.</li>
      </ul>
    ),
  },
  {
    id: 'phan-loai-do-tuoi',
    title: '9. Phân loại độ tuổi nội dung',
    body: (
      <p>
        Một số Visual Novel trên VNSVault được gắn nhãn độ tuổi (ví dụ 16+, 18+) hiển thị ngay trên thẻ game và
        trang chi tiết, phản ánh nội dung gốc của game (bạo lực, yếu tố tình dục, ngôn từ nhạy cảm…). Nhãn này
        mang tính khuyến nghị dựa trên phân loại của cộng đồng/nhà phát hành gốc, VNSVault không thực hiện kiểm
        duyệt nội dung chi tiết cho từng game. Bạn tự chịu trách nhiệm tuân thủ quy định pháp luật về độ tuổi tại
        khu vực mình sinh sống trước khi tải hoặc chơi các nội dung này.
      </p>
    ),
  },
  {
    id: 'de-xuat-binh-chon',
    title: '10. Đề xuất & bình chọn game',
    body: (
      <>
        <p>
          Tính năng đề xuất/bình chọn dùng để cộng đồng cùng quyết định game nào nên được ưu tiên Việt hóa.
          VNSVault không đảm bảo mọi đề xuất sẽ được thực hiện — việc dịch phụ thuộc vào thời gian và nguồn lực
          thực tế của các dịch giả tham gia.
        </p>
        <p className="mt-3">
          Để đảm bảo kết quả bình chọn phản ánh đúng mong muốn của cộng đồng, hệ thống áp dụng các biện pháp
          chống gian lận (xác minh chống bot, giới hạn số lượt/tài khoản). Các lượt bình chọn bất thường có thể
          bị vô hiệu hóa mà không cần báo trước, và tài khoản liên quan có thể bị xử lý theo Mục 5.
        </p>
      </>
    ),
  },
  {
    id: 'vip',
    title: '11. Gói VIP — thanh toán, kích hoạt & hoàn tiền',
    body: (
      <ul className="list-disc pl-5 space-y-1.5">
        <li><strong>Bản chất dịch vụ:</strong> gói VIP là một tiện ích trả phí giúp bỏ qua trang trung gian/quảng cáo khi tải file, được ưu tiên xử lý báo cáo lỗi link nhanh hơn. VIP <strong>không</strong> phải là giao dịch mua bán nội dung game hoặc bản dịch — nội dung vẫn luôn miễn phí với mọi người dùng như mô tả tại Mục 6.</li>
        <li><strong>Giá & thời hạn:</strong> các gói VIP được niêm yết công khai tại trang Ủng hộ (kèm số tháng sử dụng tương ứng). Giá có thể được điều chỉnh theo thời gian; thay đổi giá không áp dụng hồi tố cho các gói đã mua trước đó.</li>
        <li><strong>Thanh toán:</strong> thực hiện qua chuyển khoản ngân hàng/VietQR/Napas 247 tới cổng thanh toán được tích hợp sẵn. Đơn hàng có thời gian hiệu lực nhất định để hoàn tất chuyển khoản — quá thời hạn, đơn sẽ tự động hết hiệu lực và bạn cần tạo đơn mới.</li>
        <li><strong>Kích hoạt:</strong> VIP được kích hoạt tự động ngay khi hệ thống xác nhận giao dịch chuyển khoản thành công. Nếu đã chuyển khoản đúng nội dung/số tiền nhưng VIP chưa được kích hoạt sau một khoảng thời gian hợp lý, vui lòng liên hệ hỗ trợ (Mục 21) kèm biên lai/sao kê để được xử lý thủ công.</li>
        <li><strong>Hủy đơn chưa thanh toán:</strong> bạn có thể tự hủy một đơn hàng đang ở trạng thái chờ thanh toán trước khi chuyển khoản; đơn đã hủy hoặc đã hết hạn sẽ không được kích hoạt dù có chuyển khoản sau đó.</li>
        <li><strong>Chính sách hoàn tiền:</strong> do bản chất dịch vụ là tiện ích số được kích hoạt tức thời, các giao dịch VIP đã kích hoạt thành công là <strong>không thể hoàn tiền</strong>, trừ trường hợp: (a) lỗi kỹ thuật khiến bạn bị trừ tiền nhiều lần cho cùng một đơn, hoặc (b) VIP không được kích hoạt dù đã thanh toán đúng và được xác minh là lỗi hệ thống. Các trường hợp này sẽ được xem xét hoàn tiền hoặc bù thời hạn VIP tương ứng sau khi xác minh.</li>
        <li><strong>Chuyển nhượng:</strong> gói VIP gắn với tài khoản đã mua, không thể chuyển nhượng, tặng hoặc bán lại cho tài khoản khác.</li>
        <li><strong>Chấm dứt do vi phạm:</strong> nếu tài khoản của bạn bị khóa vì vi phạm nghiêm trọng điều khoản này (ví dụ: gian lận thanh toán, spam, phá hoại hệ thống), thời hạn VIP còn lại sẽ không được hoàn tiền hoặc bảo lưu.</li>
      </ul>
    ),
  },
  {
    id: 'donate',
    title: '12. Ủng hộ / donate tự nguyện',
    body: (
      <p>
        Mọi khoản ủng hộ qua mã QR ở trang Donate là hoàn toàn tự nguyện, dùng để duy trì chi phí vận hành
        (server, domain, dịch vụ chống spam) và động viên dịch giả. Donate không phải là giao dịch mua bán, không
        tạo ra quyền sở hữu, không được hoàn lại, và không tự động cấp bất kỳ đặc quyền truy cập nội dung nào trên
        VNSVault — nếu bạn muốn có tính năng tải trực tiếp không quảng cáo, vui lòng tham khảo gói VIP tại Mục 11.
      </p>
    ),
  },
  {
    id: 'du-lieu',
    title: '13. Dữ liệu người dùng & quyền riêng tư',
    body: (
      <>
        <p>
          VNSVault hiện chưa có Chính sách quyền riêng tư (Privacy Policy) độc lập; mục này tóm tắt cách dữ liệu
          của bạn được xử lý trong khuôn khổ Điều khoản sử dụng này.
        </p>
        <ul className="list-disc pl-5 space-y-1.5 mt-2">
          <li>Dữ liệu được thu thập khi bạn sử dụng dịch vụ bao gồm: tên hiển thị, email, mật khẩu (được mã hóa một chiều, không lưu dạng văn bản thô), lịch sử đơn hàng VIP, và các bản ghi hoạt động cần thiết cho vận hành (đề xuất, bình chọn, báo cáo lỗi link).</li>
          <li>Địa chỉ IP có thể được ghi nhận tạm thời cho mục đích bảo mật: chống spam, giới hạn tần suất truy cập, xác minh chống bot và phòng chống gian lận thanh toán.</li>
          <li>VNSVault không bán, cho thuê hoặc trao đổi dữ liệu cá nhân của bạn cho bên thứ ba nhằm mục đích quảng cáo. Dữ liệu có thể được chia sẻ với cơ quan chức năng khi có yêu cầu hợp lệ theo quy định pháp luật.</li>
          <li>Bạn có thể yêu cầu xóa tài khoản và dữ liệu cá nhân liên quan (trừ dữ liệu cần lưu giữ theo quy định pháp luật hoặc để giải quyết tranh chấp đang diễn ra) bằng cách liên hệ qua Mục 21.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'bao-tri',
    title: '14. Bảo trì hệ thống & thay đổi dịch vụ',
    body: (
      <p>
        VNSVault có thể tạm ngưng truy cập website để bảo trì, nâng cấp hạ tầng hoặc xử lý sự cố kỹ thuật mà
        không cần báo trước. Chúng tôi cũng có quyền thêm, thay đổi, hoặc ngừng cung cấp bất kỳ tính năng nào của
        dịch vụ (bao gồm cả gói VIP) theo thời gian. VNSVault không chịu trách nhiệm cho các thiệt hại phát sinh
        từ việc dịch vụ tạm thời không khả dụng, ngoại trừ nghĩa vụ xử lý các trường hợp ảnh hưởng trực tiếp đến
        gói VIP đang hoạt động đã nêu tại Mục 11.
      </p>
    ),
  },
  {
    id: 'mien-tru',
    title: '15. Miễn trừ bảo đảm',
    body: (
      <p>
        Dịch vụ được cung cấp trên cơ sở <strong>&ldquo;nguyên trạng&rdquo; (&ldquo;as is&rdquo;)</strong> và
        <strong> &ldquo;theo khả năng hiện có&rdquo; (&ldquo;as available&rdquo;)</strong>, không kèm bất kỳ bảo
        đảm nào — rõ ràng hoặc ngụ ý — về tính chính xác, đầy đủ, liên tục, không gián đoạn, hoặc phù hợp cho một
        mục đích cụ thể của nội dung, bản dịch, link tải hay bất kỳ tính năng nào trên nền tảng. VNSVault không
        đảm bảo bản dịch không có lỗi chính tả/dịch thuật, không đảm bảo game chạy ổn định trên mọi cấu hình máy,
        và không đảm bảo link tải luôn khả dụng.
      </p>
    ),
  },
  {
    id: 'gioi-han-trach-nhiem',
    title: '16. Giới hạn trách nhiệm pháp lý',
    body: (
      <p>
        Trong phạm vi tối đa được pháp luật cho phép, VNSVault, ban quản trị và dịch giả tham gia dự án sẽ không
        chịu trách nhiệm đối với bất kỳ thiệt hại trực tiếp, gián tiếp, ngẫu nhiên, đặc biệt hoặc do hậu quả nào
        phát sinh từ việc bạn sử dụng hoặc không thể sử dụng dịch vụ — bao gồm nhưng không giới hạn ở: mất dữ
        liệu, hư hại thiết bị, nhiễm mã độc từ file tải về, hoặc gián đoạn dịch vụ VIP — trừ trường hợp thiệt hại
        đó do lỗi cố ý hoặc sơ suất nghiêm trọng được chứng minh của VNSVault.
      </p>
    ),
  },
  {
    id: 'boi-hoan',
    title: '17. Bồi hoàn',
    body: (
      <p>
        Bạn đồng ý bồi hoàn và giữ cho VNSVault, ban quản trị và các dịch giả tham gia dự án không bị tổn hại
        trước mọi khiếu nại, tổn thất, chi phí (bao gồm chi phí pháp lý hợp lý) phát sinh từ việc bạn vi phạm điều
        khoản này, vi phạm pháp luật hiện hành, hoặc xâm phạm quyền của bên thứ ba trong quá trình sử dụng dịch
        vụ.
      </p>
    ),
  },
  {
    id: 'cham-dut',
    title: '18. Chấm dứt & khóa tài khoản',
    body: (
      <p>
        VNSVault có quyền tạm ngưng hoặc chấm dứt quyền truy cập của bạn vào dịch vụ, có hoặc không báo trước,
        nếu phát hiện vi phạm điều khoản này hoặc hành vi gây rủi ro cho hệ thống/cộng đồng. Bạn có thể tự yêu cầu
        chấm dứt tài khoản của mình bất kỳ lúc nào qua kênh liên hệ ở Mục 21. Các điều khoản có tính chất tiếp tục
        hiệu lực sau khi chấm dứt tài khoản bao gồm: Mục 6 (Bản chất nội dung & bản quyền), Mục 15–17 (Miễn trừ
        bảo đảm, Giới hạn trách nhiệm, Bồi hoàn) và Mục 19 (Luật áp dụng).
      </p>
    ),
  },
  {
    id: 'luat-ap-dung',
    title: '19. Luật áp dụng & giải quyết tranh chấp',
    body: (
      <p>
        Điều khoản này được thiết lập và giải thích theo pháp luật nước Cộng hòa Xã hội Chủ nghĩa Việt Nam. Mọi
        tranh chấp phát sinh liên quan đến việc sử dụng dịch vụ sẽ được ưu tiên giải quyết thông qua trao đổi,
        thương lượng thiện chí giữa các bên qua kênh liên hệ ở Mục 21. Trường hợp không thể đạt được thỏa thuận,
        tranh chấp sẽ được giải quyết tại cơ quan có thẩm quyền theo quy định pháp luật hiện hành.
      </p>
    ),
  },
  {
    id: 'thay-doi',
    title: '20. Thay đổi điều khoản',
    body: (
      <p>
        VNSVault có thể cập nhật điều khoản này khi cần thiết để phản ánh thay đổi về tính năng (ví dụ: gói VIP,
        phương thức thanh toán) hoặc quy định pháp lý. Ngày cập nhật gần nhất được ghi ở đầu trang. Với các thay
        đổi quan trọng, chúng tôi sẽ cố gắng thông báo qua website trước khi áp dụng. Việc bạn tiếp tục sử dụng
        dịch vụ sau khi điều khoản được cập nhật đồng nghĩa bạn chấp nhận các thay đổi đó.
      </p>
    ),
  },
  {
    id: 'lien-he',
    title: '21. Liên hệ',
    body: CONTACT_BLOCK,
  },
];

const TOC_COLUMNS = 2;

export default function TermsPage() {
  const mid = Math.ceil(SECTIONS.length / TOC_COLUMNS);
  const tocColumns = [SECTIONS.slice(0, mid), SECTIONS.slice(mid)];

  return (
    <main className="pt-16 flex-1" id="main-content">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Breadcrumb */}
        <nav className="breadcrumb mb-6" aria-label="Breadcrumb">
          <Link href="/">Trang chủ</Link>
          <span aria-hidden="true">›</span>
          <span className="text-ghost-dim text-sm">Điều Khoản Sử Dụng</span>
        </nav>

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3" aria-hidden="true">
            <span className="w-5 h-px bg-copper" />
            <span className="text-xs uppercase tracking-widest text-copper-light font-semibold">Pháp lý</span>
          </div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-ghost mb-2">Điều Khoản Sử Dụng</h1>
          <p className="text-sm text-muted">Cập nhật lần cuối: {LAST_UPDATED}</p>
        </div>

        {/* Quick summary */}
        <div className="mb-10 p-5 sm:p-6 bg-copper/10 border border-copper/30 rounded-2xl">
          <p className="text-xs uppercase tracking-widest text-copper-light font-semibold mb-2">Tóm tắt nhanh</p>
          <p className="text-sm text-ghost-dim leading-relaxed">
            VNSVault chia sẻ bản Việt hóa Visual Novel <strong className="text-ghost">miễn phí</strong>, không sở
            hữu bản quyền nội dung gốc. Gói VIP là dịch vụ trả phí giúp tải trực tiếp không quảng cáo, không phải
            hình thức bán nội dung. Bạn tự chịu trách nhiệm về độ tuổi khi truy cập nội dung 16+/18+, và nên quét
            virus mọi file tải về từ bên thứ ba. Đây chỉ là bản tóm tắt — vui lòng đọc đầy đủ nội dung bên dưới.
          </p>
        </div>

        {/* Table of contents */}
        <nav aria-label="Mục lục điều khoản" className="mb-10 p-5 sm:p-6 bg-surface border border-border rounded-xl">
          <p className="text-xs uppercase tracking-widest text-muted font-semibold mb-4">Mục lục</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {tocColumns.map((col, i) => (
              <ul key={i} className="space-y-1.5" role="list">
                {col.map(s => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="text-sm text-ghost-dim hover:text-copper-light transition-colors">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </nav>

        <div className="space-y-8">
          {SECTIONS.map(s => (
            <section key={s.id} id={s.id} className="scroll-mt-24 bg-surface border border-border rounded-xl p-5 sm:p-6">
              <h2 className="font-heading text-base font-bold text-ghost mb-3">{s.title}</h2>
              <div className="text-sm text-ghost-dim leading-relaxed [&_strong]:text-ghost [&_em]:text-copper-light [&_em]:not-italic [&_code]:text-copper-light [&_code]:text-xs">
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

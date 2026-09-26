/**
 * VIP order confirmation email — hand-written email-safe HTML.
 *
 * Sent once a VIP order transitions to `paid` (see the SePay webhook).
 * Mirrors the layout/constraints of passwordResetEmail.ts — table-based,
 * inline-styled, Outlook-safe — see that file's header for the full
 * rationale. This one has no CTA button that needs the VML rounded-corner
 * treatment, so it's a plain "receipt" card instead.
 */

export interface VipOrderPaidEmailOptions {
  /** Display name for the greeting. */
  username: string;
  /** Order code shown on the receipt, e.g. "VNS7K3F2". */
  orderCode: string;
  /** Months of VIP credited by this order. */
  months: number;
  /** Amount actually paid, in VND. */
  paidAmount: number;
  /** ISO timestamp of when the order was paid. */
  paidAt: string;
  /** Site origin (no trailing slash) — used for the logo image src and the account link. */
  baseUrl: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatVnd(amount: number): string {
  return `${amount.toLocaleString('vi-VN')}₫`;
}

export function vipOrderPaidEmail(opts: VipOrderPaidEmailOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const { username, orderCode, months, paidAmount, paidAt, baseUrl } = opts;
  const year = new Date().getFullYear();
  const site = baseUrl.replace(/\/$/, '');
  const logoUrl = `${site}/logo.png`;
  const accountUrl = `${site}/myaccount`;
  const planLabel = months === 1 ? 'Gói VIP 1 Tháng' : months === 12 ? 'Gói VIP 1 Năm' : `Gói VIP ${months} Tháng`;
  const paidAtLabel = new Date(paidAt).toLocaleString('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  });

  const subject = 'Xác nhận đơn hàng VIP — VNSVault';
  const preheader = `Đơn hàng ${orderCode} đã thanh toán thành công. Bạn đã được cộng ${months} tháng VIP.`;
  const safeUsername = escapeHtml(username);
  const safePlanLabel = escapeHtml(planLabel);
  const safeOrderCode = escapeHtml(orderCode);

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "https://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="dark light" />
  <meta name="supported-color-schemes" content="dark light" />
  <title>${subject}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; height: 100% !important; background-color: #09090f; }
    a { text-decoration: none; }
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .card-pad { padding-left: 24px !important; padding-right: 24px !important; padding-top: 36px !important; padding-bottom: 36px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#09090f;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:#09090f;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#09090f;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="container" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:480px;">
          <!-- Header / brand -->
          <tr>
            <td align="center" style="padding:8px 0 24px 0;">
              <img src="${logoUrl}" width="48" height="48" alt="VNSVault" style="display:block;border:0;outline:none;text-decoration:none;width:48px;height:48px;" />
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;letter-spacing:2px;color:#d4956a;padding-top:10px;">VNSVAULT</div>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td class="card-pad" style="background-color:#13131f;border:1px solid #1e1e30;border-radius:16px;padding:40px 40px 32px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:4px;">
                    <span style="display:inline-block;font-size:36px;line-height:1;">🎉</span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;color:#e0e0f0;padding:8px 0 4px 0;">
                    Thanh toán thành công
                  </td>
                </tr>
                <tr>
                  <td align="left" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#9090b0;padding:18px 0 20px 0;">
                    Xin chào ${safeUsername}, cảm ơn bạn đã đăng ký VIP tại VNSVault. Dưới đây là thông tin đơn hàng của bạn:
                  </td>
                </tr>

                <!-- Receipt table -->
                <tr>
                  <td style="border:1px solid #1e1e30;border-radius:12px;overflow:hidden;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0f0f1a;">
                      <tr>
                        <td colspan="2" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#5a5a7a;padding:16px 18px 8px 18px;">Sản phẩm</td>
                      </tr>
                      <tr>
                        <td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#e0e0f0;padding:0 18px 4px 18px;">${safePlanLabel} <span style="color:#5a5a7a;">× 1</span></td>
                        <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#e0e0f0;padding:0 18px 4px 18px;white-space:nowrap;">${formatVnd(paidAmount)}</td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding:14px 18px 0 18px;">
                          <div style="height:1px;line-height:1px;font-size:0;background-color:#1e1e30;">&nbsp;</div>
                        </td>
                      </tr>
                      <tr>
                        <td style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#5a5a7a;padding:10px 18px 2px 18px;">Mã đơn hàng</td>
                        <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#5a5a7a;padding:10px 18px 2px 18px;">Thời gian</td>
                      </tr>
                      <tr>
                        <td style="font-family:'Courier New',monospace;font-size:13px;color:#d4956a;padding:0 18px 14px 18px;">${safeOrderCode}</td>
                        <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#9090b0;padding:0 18px 14px 18px;white-space:nowrap;">${escapeHtml(paidAtLabel)}</td>
                      </tr>
                      <tr>
                        <td colspan="2" style="background-color:#13131f;padding:14px 18px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#e0e0f0;">Tổng cộng</td>
                              <td align="right" style="font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;color:#d4956a;white-space:nowrap;">${formatVnd(paidAmount)}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td align="left" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#9090b0;padding:22px 0 24px 0;">
                    Tài khoản của bạn đã được cộng <strong style="color:#e0e0f0;">${months} tháng VIP</strong> và có thể tải game trực tiếp, không cần vượt link quảng cáo.
                  </td>
                </tr>

                <tr>
                  <td align="left" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:22px;color:#7a7a9a;">
                    Xem chi tiết đơn hàng tại <a href="${accountUrl}" style="color:#d4956a;text-decoration:underline;">trang tài khoản</a> của bạn.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:20px;color:#5a5a7a;padding:28px 16px 8px 16px;">
              © ${year} VNSVault · Kho tàng Visual Novel Việt Hóa<br />
              Email này được gửi tự động, vui lòng không trả lời.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Xin chào ${username},

Cảm ơn bạn đã đăng ký VIP tại VNSVault. Đơn hàng của bạn đã thanh toán thành công:

Sản phẩm: ${planLabel} x1
Mã đơn hàng: ${orderCode}
Thời gian: ${paidAtLabel}
Tổng cộng: ${formatVnd(paidAmount)}

Tài khoản của bạn đã được cộng ${months} tháng VIP và có thể tải game trực tiếp, không cần vượt link quảng cáo.

Xem chi tiết tại: ${accountUrl}

— VNSVault`;

  return { subject, html, text };
}

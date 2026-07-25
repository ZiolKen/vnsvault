/**
 * Password-reset email template — hand-written email-safe HTML.
 *
 * WHY NOT react-email / JSX: this project doesn't ship the `react-email`
 * runtime, and email clients (especially Outlook on Windows, which renders
 * with Microsoft Word's HTML engine) don't support most modern CSS. This
 * template deliberately uses only email-safe techniques:
 *   • table-based layout with role="presentation"
 *   • inline styles on every element (no external/`<style>`-only rules for
 *     structural styling; the <style> block only holds progressive
 *     enhancements + media queries)
 *   • a VML "bulletproof button" so the CTA keeps rounded corners in
 *     Outlook, which ignores CSS `border-radius` entirely (see note below)
 *
 * ── Can I Email compatibility note: `border-radius` ─────────────────────
 * `border-radius` is NOT supported by Outlook 2007–2019 / Microsoft 365
 * for Windows (Word rendering engine). Those clients render a plain
 * SQUARE-cornered box; everything else (Apple Mail, Gmail, iOS, Outlook
 * for Mac, Outlook.com) honours it. There is no CSS fallback that makes
 * Word round a corner, so the CTA uses the standard fix instead: a VML
 * <v:roundrect arcsize="16%"> shown only to Outlook via an `[if mso]`
 * conditional comment, with the normal <a> button shown to every other
 * client via `[if !mso]`. Result: rounded corners everywhere, including
 * Outlook. The card container also uses border-radius; that simply
 * degrades to square corners in Outlook (acceptable — a container has no
 * good VML equivalent and square corners there are cosmetically fine).
 */

export interface PasswordResetEmailOptions {
  /** Absolute URL the CTA points at (includes the raw token). */
  resetUrl: string;
  /** Display name for the greeting. Optional. */
  username?: string;
  /** Site origin (no trailing slash) — used for the logo image src. */
  baseUrl: string;
  /** Minutes until the link expires, shown in the copy. */
  expiresMinutes?: number;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function passwordResetEmail(opts: PasswordResetEmailOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const { resetUrl, username, baseUrl, expiresMinutes = 60 } = opts;
  const year = new Date().getFullYear();
  const logoUrl = `${baseUrl.replace(/\/$/, '')}/logo.png`;

  const subject = 'Đặt lại mật khẩu VNSVault';
  const preheader = `Đặt lại mật khẩu VNSVault của bạn — liên kết có hiệu lực trong ${expiresMinutes} phút.`;
  const greetingHtml = username ? `Xin chào ${escapeHtml(username)},` : 'Xin chào,';
  const greetingText = username ? `Xin chào ${username},` : 'Xin chào,';

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
            <td class="card-pad" style="background-color:#13131f;border:1px solid #1e1e30;border-radius:16px;padding:48px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;color:#e0e0f0;padding-bottom:4px;">
                    Đặt lại mật khẩu
                  </td>
                </tr>
                <tr>
                  <td align="left" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#9090b0;padding:18px 0 4px 0;">
                    ${greetingHtml}
                  </td>
                </tr>
                <tr>
                  <td align="left" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#9090b0;padding:0 0 28px 0;">
                    Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản VNSVault của bạn. Nhấn nút bên dưới để tạo mật khẩu mới. Liên kết sẽ hết hạn sau <span style="color:#d4956a;font-weight:700;">${expiresMinutes} phút</span>.
                  </td>
                </tr>
                <!-- Bulletproof CTA button (rounded in Outlook via VML) -->
                <tr>
                  <td align="center" style="padding:4px 0 8px 0;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${resetUrl}" style="height:52px;v-text-anchor:middle;width:260px;" arcsize="16%" strokecolor="#b87333" fillcolor="#b87333">
                      <w:anchorlock/>
                      <center style="color:#0b0b12;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Đặt lại mật khẩu</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-- -->
                    <a href="${resetUrl}" style="background-color:#b87333;border-radius:10px;color:#0b0b12;display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;line-height:52px;text-align:center;text-decoration:none;width:260px;-webkit-text-size-adjust:none;">Đặt lại mật khẩu</a>
                    <!--<![endif]-->
                  </td>
                </tr>
                <tr>
                  <td align="left" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:22px;color:#7a7a9a;padding:28px 0 0 0;">
                    Nếu nút không hoạt động, hãy sao chép và dán liên kết sau vào trình duyệt:
                  </td>
                </tr>
                <tr>
                  <td align="left" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;padding:8px 0 0 0;word-break:break-all;">
                    <a href="${resetUrl}" style="color:#d4956a;text-decoration:underline;">${resetUrl}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px 0;">
                    <div style="height:1px;line-height:1px;font-size:0;background-color:#1e1e30;">&nbsp;</div>
                  </td>
                </tr>
                <tr>
                  <td align="left" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:22px;color:#7a7a9a;">
                    Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này — mật khẩu của bạn sẽ không thay đổi cho tới khi bạn mở liên kết trên và tạo mật khẩu mới.
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

  const text = `${greetingText}

Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản VNSVault của bạn.
Mở liên kết sau để tạo mật khẩu mới (hết hạn sau ${expiresMinutes} phút):

${resetUrl}

Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email — mật khẩu của bạn sẽ không thay đổi.

— VNSVault`;

  return { subject, html, text };
}

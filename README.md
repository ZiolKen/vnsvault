# VNSVault

Kho tàng Visual Novel được Việt hóa — miễn phí, chất lượng cao, không quảng cáo.

Built with **Next.js 15**, deployed on **Vercel**, backed by **multi-shard Aiven PostgreSQL**.

---

## Features

- **Thư viện game** — tìm kiếm, lọc theo engine / thể loại / độ tuổi / trạng thái dịch, sắp xếp theo lượt tải / mới nhất
- **Game detail** — ảnh bìa, mô tả, download links theo nền tảng + phiên bản, thông tin nhóm dịch
- **Đề xuất game** — người dùng đề xuất và vote game muốn được dịch
- **Báo cáo link hỏng** — report broken / sai download link trực tiếp từ trang game
- **Tài khoản người dùng** — đăng ký / đăng nhập, đổi mật khẩu, bookmark game, chọn avatar
- **VIP** — tài khoản VIP (vĩnh viễn hoặc theo tháng, nâng cấp thủ công qua admin panel) tải game trực tiếp, bỏ qua bước "vượt link" quảng cáo (bbmkts.com) mà tài khoản thường phải đi qua
- **Admin panel** — quản lý game (thêm / sửa / xoá / publish / featured), duyệt đề xuất, xử lý báo cáo link, quản lý VIP (nâng cấp / gia hạn / thu hồi)
- **ISR** — homepage cache 5 phút, sitemap cache 1 giờ
- **SEO** — metadata, canonical URL, sitemap.xml, robots.txt tự động
- **PWA** — web app manifest
- **UI kit dùng chung** — `Button` / `FormField` / `Modal` / `Toast` (`src/components/ui`) chuẩn hoá spinner, focus trap, a11y (aria-invalid/aria-describedby) từng bị lặp/khác nhau giữa các form
- **Bảo mật**
  - CSP, HSTS, X-Frame-Options và các security header khác trên mọi response (`next.config.ts`)
  - Cloudflare Turnstile bot protection trên đăng ký / đăng nhập / đổi mật khẩu / đề xuất-vote / báo lỗi link
  - **Edge middleware** (`src/middleware.ts`) chặn thêm 3 lớp trước khi request chạm route handler:
    1. Chặn path scanner/probe phổ biến (`.env`, `.git`, `wp-admin`, `phpmyadmin`, …) → trả 404 ngay tại edge
    2. Chặn ghi cross-site vào `/api` (so khớp `Origin` với host hiện tại) — CSRF defense cho mọi method POST/PUT/PATCH/DELETE
    3. Rate-limit theo route cho `/api/*` (in-memory, per-instance — xem giới hạn ở mục **Known Limitations**)
  - `requireFreshAdmin` — mọi API admin-only re-check role trong DB ở mỗi request thay vì tin JWT 7 ngày tuổi, để revoke quyền admin có hiệu lực ngay lập tức thay vì phải đợi token hết hạn

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 |
| Database | PostgreSQL (Aiven) — multi-shard |
| DB Client | `pg` (node-postgres) |
| Auth | JWT via `jose`, HttpOnly cookie, 7-day session |
| Password | `bcryptjs` (cost factor 12) |
| Bot protection | Cloudflare Turnstile |
| Analytics | Vercel Analytics |
| Deployment | Vercel |

---

## Database Architecture

VNSVault dùng **capacity-based horizontal sharding** — KHÔNG phải primary/replica.

- Mỗi `SHARD_N` là một Aiven PostgreSQL instance **độc lập** (có thể nằm ở account khác nhau)
- **WRITE** → luôn vào shard đầu tiên còn dưới ngưỡng `MAX_SHARD_BYTES` (mặc định 450 MB)
- **READ** → `fanOut`: query song song tất cả shards, merge kết quả trong app
- **UPDATE / DELETE** → `fanOut` hoặc `withRowTransaction` (xác định shard nào chứa row trước, rồi pin vào đó)
- Hỗ trợ tối đa **10 shards** (`SHARD_0` → `SHARD_9`), fallback về `DATABASE_URL` nếu không có shard nào

```
SHARD_0 (Aiven acc A) ─┐
SHARD_1 (Aiven acc B) ─┼─ ShardedDb.fanOut() ─── App
SHARD_2 (Aiven acc C) ─┘
```

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- Ít nhất 1 Aiven PostgreSQL instance (hoặc PostgreSQL bất kỳ)

### 1. Clone & cài dependencies

```bash
git clone https://github.com/ZiolKen/vnsvault.git
cd vnsvault
npm install
```

### 2. Cấu hình environment

```bash
cp .env.example .env.local
# Điền các biến trong .env.local
```

### 3. Setup database schema

Áp dụng schema lên tất cả shards (idempotent, chạy lại được):

```bash
npm run db:setup
```

### 4. Tạo tài khoản admin đầu tiên

```bash
npm run create-admin
```

### 5. Chạy dev server

```bash
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

### Required

| Variable | Description |
|---|---|
| `SHARD_0` | Connection URL của shard đầu tiên |
| `JWT_SECRET` | Secret để ký JWT (≥ 32 ký tự ngẫu nhiên) |

### Database Shards

```
SHARD_0=postgresql://user:pass@host:port/db
SHARD_1=postgresql://user:pass@host:port/db   # shard thứ 2 (tuỳ chọn)
SHARD_2=...                                   # tối đa SHARD_9
DATABASE_URL=...                              # fallback nếu không có SHARD_*
```

### TLS / CA Certificate (Aiven)

Aiven dùng CA certificate riêng. Nếu muốn bật `verify-full` TLS:

```
PGCA_0=-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----
PGCA_1=...
```

Nếu không set `PGCA_N`, shard đó vẫn dùng TLS encrypted nhưng bỏ qua xác minh cert (`rejectUnauthorized: false`).

### Optional

| Variable | Default | Description |
|---|---|---|
| `MAX_SHARD_BYTES` | `471859200` (450 MB) | Ngưỡng dung lượng mỗi shard — vượt qua thì write chuyển sang shard tiếp theo |
| `TURNSTILE_SECRET_KEY` | — | Cloudflare Turnstile server secret. Bỏ qua = tắt bot protection (dev) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | — | Cloudflare Turnstile site key (client-side) |
| `NEXT_PUBLIC_BASE_URL` | `http://localhost:3000` | URL công khai của site — dùng cho canonical URL và SEO metadata |
| `BBMKTS_TOKEN` | *(hard-coded fallback trong code)* | Token dapi của bbmkts.com dùng để wrap link tải cho tài khoản không phải VIP (xem `src/lib/linkShortener.ts`). ⚠️ Nếu không set, code dùng token mặc định đã hard-code sẵn — **nên set biến này trước khi deploy prod** để có thể đổi token mà không cần sửa code, và để token thật không nằm trong Git history |

---

## Known Limitations (đọc trước khi scale traffic)

- **Rate limiter là in-memory, per-instance** (`src/lib/rateLimit.ts`). Trên Vercel Node runtime, mỗi instance serverless giữ counter riêng — traffic bị phân tán qua nhiều instance có thể vượt giới hạn danh nghĩa khoảng (số instance)×. Đủ dùng làm lớp chặn đầu tiên, **không phải hard guarantee**. Muốn chặn chuẩn ở scale lớn: chuyển sang Vercel KV / Upstash Redis (`INCR` + `EXPIRE`) để mọi instance share chung 1 counter.
- **`getClientIp()` tin `x-forwarded-for` đầu tiên trong header.** Đúng nếu Vercel là proxy edge duy nhất (Vercel tự set header này, client không ghi đè được). Nếu sau này thêm một CDN/WAF khác (vd. Cloudflare) đứng **trước** Vercel, cần đổi sang đọc đúng hop được platform đó tin cậy — lấy nhầm hop đầu tiên lúc đó sẽ cho phép client tự spoof IP và bypass rate limit.
- **Download counter (`download_count`) là fire-and-forget** (`db.fanOut(...).catch(...)` không `await`) trong `/api/games/[slug]/download/[downloadId]`. Trên Node serverless, không có gì đảm bảo promise này chạy xong trước khi instance bị freeze sau khi response đã trả về — counter có thể bị undercount lặt vặt. Không ảnh hưởng luồng tải chính; nếu cần số liệu chính xác 100%, cân nhắc `await` trực tiếp (thêm ~vài chục ms) hoặc dùng `after()` từ `next/server`.
- **GET có side-effect:** endpoint tải game (`GET /api/games/[slug]/download/[downloadId]`) tăng `download_count` và có thể redirect sang bbmkts trên một request `GET`. Vì `middleware.ts` chỉ áp same-origin check cho POST/PUT/PATCH/DELETE, một trang bên ngoài có thể nhúng request này để buộc trình duyệt người dùng đã đăng nhập gọi tới — hậu quả chỉ là tăng lệch counter / redirect ngoài ý muốn, không rò rỉ dữ liệu hay chiếm quyền tài khoản, nhưng nếu muốn chặt hơn có thể chuyển endpoint này sang POST.

---

## Scripts

```bash
npm run dev          # Dev server với Turbopack
npm run build        # Production build
npm run start        # Chạy production build
npm run lint         # Lint và tự sửa
npm run lint:check   # Chỉ kiểm tra lint
npm run type-check   # TypeScript type check
npm run analyze      # Build kèm bundle analyzer (ANALYZE=true)

npm run db:setup     # Áp dụng schema.sql lên tất cả shards
npm run db:reset     # ⚠️ XOÁ TRẮNG tất cả shards (không thể hoàn tác)
npm run create-admin # Tạo / promote tài khoản admin đầu tiên
npm run list-users
npm run delete-user
npm run remove-admin
```

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx              # Homepage (ISR, revalidate 5m)
│   ├── games/                # Thư viện + game detail
│   ├── requests/             # Đề xuất game
│   ├── donate/               # Trang ủng hộ
│   ├── login/ register/      # Auth pages
│   ├── myaccount/            # Trang cá nhân
│   ├── admin/                # Admin panel (protected)
│   └── api/                  # Route handlers
│       ├── auth/             # login, logout, register, me
│       ├── games/            # public game API
│       ├── admin/            # admin-only API (games, reports, requests)
│       ├── account/          # avatar, password, bookmarks
│       ├── requests/         # vote
│       └── health/           # health check
├── components/
│   ├── games/                # GameCard, BookmarkButton, DownloadButton, ...
│   ├── admin/                # GameForm
│   └── layout/               # Navbar, Footer
├── lib/
│   ├── db/
│   │   ├── index.ts          # ShardedDb class
│   │   └── schema.sql        # Database schema
│   ├── queries.ts            # Server-side query helpers
│   ├── auth.ts               # Auth barrel re-export
│   ├── jwt.ts                # JWT utils (Edge-safe)
│   ├── password.ts           # bcryptjs (Node.js only)
│   ├── avatars.ts            # Preset avatar list
│   ├── turnstile.ts          # Cloudflare Turnstile verification
│   ├── vip.ts                # VIP status computation (permanent / timed)
│   ├── linkShortener.ts      # bbmkts.com "vượt link" wrapping for non-VIP downloads
│   └── utils.ts              # Formatters, label helpers
├── types/
│   └── index.ts              # TypeScript types & interfaces
└── middleware.ts             # Edge middleware — auth guard

scripts/
├── db-setup.mjs              # Apply schema to all shards
├── db-reset.mjs              # Wipe all shards (DANGER)
├── create-admin.mjs          # Create / promote admin account
├── list-users.mjs            # List users across shards (role/VIP/search filters)
├── delete-user.mjs           # Permanently delete user(s) + cross-shard data
└── remove-admin.mjs          # Demote admin account(s) to regular user
```

---

## Deployment (Vercel)

1. Push lên GitHub → import vào Vercel
2. Thêm tất cả environment variables trong **Vercel Dashboard → Settings → Environment Variables**
3. Vercel tự động build và deploy mỗi khi push lên `main`

### Lưu ý khi deploy

- Build dùng `experimental.cpus: 3` để giới hạn worker song song, tránh vượt `max_connections` của Aiven
- Pool size mỗi shard giới hạn ở `max: 2` (xem `src/lib/db/index.ts`). Lưu ý: đây là ceiling **cho mỗi instance function** — Vercel serverless spin nhiều instance song song khi traffic tăng, và các instance KHÔNG share pool với nhau, nên tổng connection thực tế là `N instance đang chạy × max × số shard`, không chỉ đơn thuần `cpus × max`. Với `max: 2` và vài shard, mức này vẫn đủ margin dưới limit 20 connection của Aiven free tier trong điều kiện traffic bình thường, nhưng traffic tăng đột biến vẫn có thể cần theo dõi thêm

---

## Adding a New Shard

Khi shard hiện tại gần đầy (gần ngưỡng `MAX_SHARD_BYTES`):

1. Tạo Aiven PostgreSQL instance mới
2. Chạy `db:setup` với URL của instance mới:
   ```bash
   SHARD_3=postgresql://... npm run db:setup
   ```
3. Thêm `SHARD_3` vào Vercel environment variables
4. Redeploy — app tự động phát hiện và bắt đầu write vào shard mới

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## Credits

Created and maintained by **[ZiolKen](https://github.com/ZiolKen)**.

---

## Support

If this project helps you:

[![BuyMeACoffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/_zkn) [![PayPal](https://img.shields.io/badge/PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/zkn0461) [![Patreon](https://img.shields.io/badge/Patreon-F96854?style=for-the-badge&logo=patreon&logoColor=white)](https://patreon.com/ZiolKen) 

<div>
  <img style="100%" src="https://capsule-render.vercel.app/api?type=waving&height=100&section=footer&reversal=false&fontSize=70&fontColor=FFFFFF&fontAlign=50&fontAlignY=50&stroke=-&descSize=20&descAlign=50&descAlignY=50&theme=cobalt"  />
</div>

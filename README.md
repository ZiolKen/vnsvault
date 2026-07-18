<br>
<p align="center">
<a href="https://vnsvault.qzz.io/" target="_blank">
<img src="./public/logo.png" alt="VNSVault" height="250" width="250" style="border-radius: 16px;" />
</a>
</p>

# <p align="center">VNSVault</p>

<p align="center">Kho tàng Visual Novel được Việt hóa — miễn phí, chất lượng, không quảng cáo.</p>

Built with **Next.js 15**, deployed on **Vercel**, backed by **multi-shard Aiven PostgreSQL**.

---

## Features

- **Thư viện game** — tìm kiếm, lọc theo engine / thể loại / độ tuổi / trạng thái dịch, sắp xếp theo lượt tải / mới nhất
- **Game detail** — ảnh bìa, mô tả, download links theo nền tảng + phiên bản, thông tin nhóm dịch
- **Đề xuất game** — người dùng đề xuất và vote game muốn được dịch
- **Báo cáo link hỏng** — report broken / sai download link trực tiếp từ trang game
- **Tài khoản người dùng** — đăng ký / đăng nhập, đổi mật khẩu, bookmark game, chọn avatar
- **VIP** — tài khoản VIP (vĩnh viễn hoặc theo tháng, nâng cấp thủ công qua admin panel) tải game trực tiếp, bỏ qua bước "vượt link" quảng cáo (bbmkts.com) mà tài khoản thường phải đi qua
- **Admin panel** — quản lý game (thêm / sửa / xoá / publish / featured), duyệt đề xuất, xử lý báo cáo link, quản lý VIP (nâng cấp / gia hạn / thu hồi), soạn **thông báo popup** hiển thị cho khách truy cập
- **Thông báo popup** — popup thông báo toàn site, nội dung/tiêu đề/thời gian "Đóng N giờ" chỉnh sửa đầy đủ từ Admin Dashboard (`/admin/announcement`), lưu server-side; lượt đóng của khách được nhớ ở **IndexedDB** phía client theo từng phiên bản nội dung — sửa nội dung sẽ tự hiện lại popup cho người đã từng đóng
- **ISR** — homepage cache 5 phút, sitemap cache 1 giờ
- **SEO** — metadata, canonical URL, sitemap.xml, robots.txt tự động
- **PWA** — web app manifest
- **Bảo mật** — CSP, HSTS, Cloudflare Turnstile bot protection trên form đăng ký / đăng nhập

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

### Write-Shard Pointer (Redis + Cron)

Việc chọn shard nào để WRITE cần biết dung lượng hiện tại của từng shard
(`pg_database_size()`), nhưng gọi hàm đó trên mỗi request là chậm và tốn kết
nối. Kiến trúc hiện tại:

```
cron-job.org (external, mỗi 5 phút)
        │  GET + header "Authorization: Bearer $CRON_SECRET"
        ▼
GET /api/internal/shard-check   ← nơi DUY NHẤT còn gọi pg_database_size()
        │  chạy sweep 1 lần trên mọi shard
        ▼
Redis: SET shard:write-target=<index>   (TTL 15 phút)
        │
        ▼
pickWriteShardIndex() trong db/index.ts
  1. Cache in-memory (30s + jitter) — nếu còn hạn, dùng luôn, khỏi động tới Redis
  2. Cache nguội → GET shard:write-target từ Redis (vài ms, không có
     pg_database_size nào chạy trên request path)
  3. Redis chưa cấu hình / lỗi / giá trị không hợp lệ → fallback về sweep
     pg_database_size trực tiếp (hành vi gốc trước khi có Redis — chậm hơn,
     không hỏng)
```

Redis dùng **Upstash qua Vercel Marketplace** (không phải tài khoản Upstash
riêng) — xem biến `KV_REST_API_URL` / `KV_REST_API_TOKEN` ở mục Environment
Variables bên dưới. Nếu chưa setup Redis, tính năng này tự tắt và app quay
lại sweep trực tiếp như trước — không crash.

**Vì sao dùng cron-job.org thay vì `crons` của Vercel:** Vercel Hobby chỉ
cho cron *của chính Vercel* chạy tối đa **1 lần/ngày** — đặt lịch dày hơn
(`*/5 * * * *` chẳng hạn) trong `vercel.json` sẽ khiến **deploy fail hoàn
toàn**, không phải warning, và bản thân Vercel Cron trên Hobby cũng không
đảm bảo chạy đúng phút. `/api/internal/shard-check` chỉ là 1 route HTTP
bình thường được xác thực bằng `CRON_SECRET`, nên gọi từ bên ngoài không
bị giới hạn đó — vẫn cùng 1 route, cùng 1 cách xác thực, chỉ đổi ai gọi.
Không dùng GitHub Actions vì lịch trong repo private/public free có xu
hướng bị delay 10–30 phút lúc GitHub tải cao (nhiều report trong 2026), và
tự tắt sau 60 ngày repo không có commit — im lặng, dễ bỏ sót.

**Setup trên cron-job.org** (miễn phí):
1. Đăng ký / đăng nhập [cron-job.org](https://cron-job.org)
2. Tạo cronjob mới:
   - **URL**: `https://<domain-production-của-bạn>/api/internal/shard-check`
   - **Method**: GET
   - **Schedule**: mỗi 5 phút (`minutes: 0,5,10,...`)
   - **Custom header**: `Authorization` → `Bearer <giá-trị-CRON_SECRET>` (cùng giá trị đã set trong Vercel env vars)
3. Set `CRON_SECRET` trong Vercel env vars trước (xem mục Environment Variables) — cron-job.org KHÔNG tự biết giá trị này, phải copy tay
4. Lưu, kiểm tra tab "History" trên cron-job.org để xác nhận nhận được `200 { "success": true, "writeTarget": N }`

> Nếu sau này gỡ cron-job.org và muốn quay lại `crons` trong `vercel.json`
> (vd khi nâng lên Vercel Pro), nhớ cân lại
> `SHARD_WRITE_TARGET_TTL_SECONDS` trong `src/lib/redis.ts` cho khớp lịch
> mới — 2 giá trị này là một cặp, không có gì tự đồng bộ giúp.

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

### Redis (Upstash qua Vercel Marketplace)

Dùng cho write-shard pointer — xem [Write-Shard Pointer (Redis + Cron)](#write-shard-pointer-redis--cron) ở trên. Cài "Upstash" từ **Vercel Marketplace** (KHÔNG dùng tài khoản Upstash riêng — tên biến khác nhau, xem comment trong `src/lib/redis.ts`), Vercel sẽ tự điền các biến này.

| Variable | Required? | Description |
|---|---|---|
| `KV_REST_API_URL` | Có (để bật tính năng này) | Upstash REST endpoint |
| `KV_REST_API_TOKEN` | Có (để bật tính năng này) | Upstash REST token |
| `KV_URL` | Không dùng tới | Vercel vẫn set kèm, app không đọc biến này |
| `REDIS_URL` | Không dùng tới | Vercel vẫn set kèm, app không đọc biến này |
| `KV_REST_API_READ_ONLY_TOKEN` | Không dùng tới | Vercel vẫn set kèm, app không đọc biến này |
| `CRON_SECRET` | Nên set ở production | Bảo vệ `/api/internal/shard-check`. Set trong Vercel env vars, rồi copy tay cùng giá trị vào custom header của job trên cron-job.org (xem [Write-Shard Pointer](#write-shard-pointer-redis--cron)) — không có gì tự động đồng bộ 2 bên. Tạo bằng `openssl rand -base64 32` |

Không set `KV_REST_API_URL`/`KV_REST_API_TOKEN`? App tự fallback về sweep `pg_database_size` trực tiếp như trước khi có Redis — không crash, chỉ chậm hơn.

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
│       ├── admin/            # admin-only API (games, reports, requests, announcement)
│       ├── announcement/     # public GET — announcement popup content
│       ├── account/          # avatar, password, bookmarks
│       ├── requests/         # vote
│       ├── internal/         # shard-check (cron-only, see Write-Shard Pointer)
│       └── health/           # health check
├── components/
│   ├── games/                # GameCard, BookmarkButton, DownloadButton, ...
│   ├── admin/                # GameForm, AnnouncementForm
│   ├── announcement/         # AnnouncementBody — shared renderer (popup + admin preview)
│   ├── ui/                   # FormField, Button, Toast, Modal
│   └── layout/               # Navbar, Footer, AnnouncementModal
├── lib/
│   ├── db/
│   │   ├── index.ts          # ShardedDb class
│   │   └── schema.sql        # Database schema
│   ├── announcement.ts       # getAnnouncement / updateAnnouncement (broadcast fanOut helpers)
│   ├── announcementStore.ts  # Client IndexedDB dismissal storage for the popup
│   ├── redis.ts              # Upstash Redis client + write-shard pointer key/TTL
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
- **Shard-check cron** (`/api/internal/shard-check`) được trigger bởi **cron-job.org** (external, mỗi 5 phút) chứ không phải `crons` trong `vercel.json` — Vercel Hobby chỉ cho cron của chính Vercel chạy tối đa 1 lần/ngày, xem [Write-Shard Pointer](#write-shard-pointer-redis--cron) ở trên để biết lý do và cách setup
- Set `CRON_SECRET` trong Vercel env vars **trước** khi tạo job trên cron-job.org, rồi copy đúng giá trị đó vào custom header `Authorization: Bearer ...` của job — 2 bên không tự đồng bộ, quên set thì route bỏ qua xác thực (không an toàn cho production)

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

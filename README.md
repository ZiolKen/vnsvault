<br>
<p align="center">
<a href="https://vnsvault.qzz.io/" target="_blank">
<img src="./public/logo.png" alt="VNSVault" height="250" width="250" style="border-radius: 16px;" />
</a>
</p>

# <p align="center">VNSVault</p>

<p align="center">Kho tàng Visual Novel được Việt hóa — miễn phí, chất lượng, không quảng cáo.</p>

Built with **Next.js 15**, deployed on **Vercel**, backed by **multi-shard Supabase PostgreSQL**.

---

## Features

- **Thư viện game** — tìm kiếm, lọc theo engine / thể loại / độ tuổi / trạng thái dịch, sắp xếp theo lượt tải / mới nhất
- **Game detail** — ảnh bìa, mô tả, download links theo nền tảng + phiên bản, thông tin nhóm dịch
- **Đề xuất game** — người dùng đề xuất và vote game muốn được dịch
- **Báo cáo link hỏng** — report broken / sai download link trực tiếp từ trang game
- **Tài khoản người dùng** — đăng ký / đăng nhập, đổi mật khẩu, quên mật khẩu (đặt lại qua email), bookmark game, chọn avatar
- **VIP** — tài khoản VIP (vĩnh viễn hoặc theo tháng, nâng cấp thủ công qua admin panel) tải game trực tiếp, bỏ qua bước "vượt link" quảng cáo (bbmkts.com) mà tài khoản thường phải đi qua
- **Admin panel** — quản lý game (thêm / sửa / xoá / publish / featured), duyệt đề xuất, xử lý báo cáo link, quản lý người dùng & VIP (nâng cấp / gia hạn / thu hồi tại `/admin/users`), bật/tắt **chế độ bảo trì**, soạn **thông báo popup** hiển thị cho khách truy cập
- **Thông báo popup** — popup thông báo toàn site, nội dung/tiêu đề/thời gian "Đóng N giờ" chỉnh sửa đầy đủ từ Admin Dashboard (`/admin/announcement`), lưu server-side; lượt đóng của khách được nhớ ở **IndexedDB** phía client theo từng phiên bản nội dung — sửa nội dung sẽ tự hiện lại popup cho người đã từng đóng
- **Chế độ bảo trì** — admin bật/tắt tại `/admin/maintenance`, chặn toàn bộ request công khai ở tầng middleware, session admin vẫn truy cập bình thường
- **ISR + Redis homepage index** — homepage cache 5 phút; danh sách hot/featured/new games + site stats được build sẵn định kỳ và lưu vào Redis (`/api/internal/reindex`) thay vì tính lại mỗi lượt ghé — request thường chỉ đọc Redis, tự rơi về query trực tiếp nếu cache miss; sitemap cache 1 giờ
- **SEO** — metadata, canonical URL, sitemap.xml, robots.txt tự động
- **PWA** — web app manifest
- **Bảo mật** — CSP, HSTS, Cloudflare Turnstile bot protection trên form đăng ký / đăng nhập / quên mật khẩu
- **Trang Điều khoản sử dụng** — `/terms`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 |
| Database | PostgreSQL (Supabase) — multi-shard |
| DB Client | `pg` (node-postgres) |
| Auth | JWT via `jose`, HttpOnly cookie, 7-day session |
| Password | `bcryptjs` (cost factor 12) |
| Bot protection | Cloudflare Turnstile |
| Cache / pointer store | Redis (Upstash qua Vercel Marketplace) |
| Ảnh Upload | Supabase Storage |
| Email | Resend (gọi trực tiếp REST API qua `fetch`, không dùng SDK) |
| Analytics | Vercel Analytics + Speed Insights |
| Deployment | Vercel |

---

## Database Architecture

VNSVault dùng **capacity-based horizontal sharding** — KHÔNG phải primary/replica.

- Mỗi `SHARD_N` là một Supabase PostgreSQL instance **độc lập** (có thể nằm ở account khác nhau)
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
cron-job.org (external, mỗi 15 phút)
        │  GET + header "Authorization: Bearer $CRON_SECRET"
        ▼
GET /api/internal/shard-check   ← nơi DUY NHẤT còn gọi pg_database_size()
        │  chạy sweep 1 lần trên mọi shard
        ▼
Redis: SET shard:write-target=<index>   (TTL 45 phút)
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
   - **Schedule**: mỗi 15 phút (`minutes: 0,15,30,45`)
   - **Custom header**: `Authorization` → `Bearer <giá-trị-CRON_SECRET>` (cùng giá trị đã set trong Vercel env vars)
3. Set `CRON_SECRET` trong Vercel env vars trước (xem mục Environment Variables) — cron-job.org KHÔNG tự biết giá trị này, phải copy tay
4. Lưu, kiểm tra tab "History" trên cron-job.org để xác nhận nhận được `200 { "success": true, "writeTarget": N }`

> Nếu sau này gỡ cron-job.org và muốn quay lại `crons` trong `vercel.json`
> (vd khi nâng lên Vercel Pro), nhớ cân lại
> `SHARD_WRITE_TARGET_TTL_SECONDS` trong `src/lib/redis.ts` cho khớp lịch
> mới — 2 giá trị này là một cặp, không có gì tự đồng bộ giúp.

### Homepage Index Cache (Redis)

Không có `postgres_fdw`/`dblink` nào nối được các shard độc lập lại với
nhau, nên Postgres không thể tự làm MATERIALIZED VIEW xuyên shard cho
homepage. Thay vào đó:

```
cron-job.org (external, gợi ý mỗi 5 phút — khớp revalidate của trang chủ)
        │  GET + header "Authorization: Bearer $CRON_SECRET"
        ▼
GET /api/internal/reindex
        │  fanOut + JOIN + sort MỘT LẦN: hotGames, featuredGames, newGames, siteStats
        ▼
Redis: SET homepage:index=<json>   (TTL riêng, xem HOMEPAGE_INDEX_TTL_SECONDS)
        │
        ▼
getHomepageIndex() trong lib/queries.ts
  1. Redis GET homepage:index — có thì dùng luôn
  2. Redis chưa cấu hình / miss / lỗi → fallback query trực tiếp
     (fanOut LIMIT-bounded, giống hệt logic reindex nhưng chạy live)
```

Cùng `CRON_SECRET`, cùng kiểu fail-closed ở production như
`shard-check` — có thể dùng chung 1 job cron-job.org khác trỏ tới route
này, hoặc thêm job riêng.

### Keep-Alive (chống Supabase free-tier tự pause)

Supabase free tier tự **pause** project sau 7 ngày liên tục không có
request tới database. `GET /api/internal/keep-alive` chạy `SELECT 1` trên
**tất cả** shard (kể cả shard chưa có traffic thật) để giữ chúng "sống".
Gợi ý lịch trên cron-job.org: mỗi 3 ngày, cùng `CRON_SECRET` với 2 route
internal ở trên.

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- Ít nhất 1 Supabase PostgreSQL instance (hoặc PostgreSQL bất kỳ)

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

> `schema.sql` luôn ở trạng thái mới nhất — cài mới thì `db:setup` là đủ,
> không cần chạy gì thêm. Thư mục `migrations/` chỉ dành cho **deployment
> đã chạy production từ trước**, cần áp thủ công từng file trên từng shard
> (SQL Editor của Supabase, hoặc `psql <url> -f migrations/00X_....sql`)
> để bắt kịp các thay đổi schema đã có sẵn trong `schema.sql` bản mới.

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

### Ảnh Upload (Supabase Storage)

Tính năng "Upload" trong form đăng game (cover/banner) và avatar admin (`/myaccount`)
lưu ảnh vào Supabase Storage thay vì bắt buộc phải có sẵn URL ngoài. Đây là API
Storage (REST), khác hoàn toàn với `SHARD_N` (connection string Postgres) — cần
credentials riêng.

**Setup (1 lần) trong Supabase dashboard, project SHARD_0** (uploads không sharded —
xem comment đầu `src/lib/storage.ts` để biết lý do):

1. **Storage → New bucket** → tên `vnsvault-uploads` (hoặc tên khác, khớp với
   `SUPABASE_STORAGE_BUCKET`) → bật **Public bucket**.
2. Bucket Public đã tự cho phép đọc công khai (ảnh hiển thị được trên site). Muốn
   giới hạn ai được **ghi** vào bucket qua client thường (anon key) thì thêm RLS
   policy — nhưng route upload của app dùng **service_role key** nên tự động bypass
   RLS, không bắt buộc phải cấu hình policy ghi nếu bucket chỉ được ghi qua route
   này.
3. Lấy `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` ở **Project Settings → API**.

| Variable | Required? | Description |
|---|---|---|
| `SUPABASE_URL` | Có (để bật upload) | Project URL, dạng `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Có (để bật upload) | Service role key — **secret**, chỉ dùng server-side, không bao giờ lộ ra client |
| `SUPABASE_STORAGE_BUCKET` | Không, mặc định `vnsvault-uploads` | Tên bucket |

Không set 2 biến bắt buộc? `/api/admin/upload` trả về 503, nhưng form vẫn dùng được
bình thường qua tab URL (không có gì hỏng, upload chỉ là tuỳ chọn thêm).

Giới hạn: JPEG/PNG/WebP/GIF, tối đa 4MB/ảnh — xem `MAX_UPLOAD_BYTES` trong
`src/lib/storage.ts` nếu muốn đổi.

### Email (Resend — quên mật khẩu)

Dùng để gửi email đặt lại mật khẩu (`/forgot-password` → `/reset-password`).
Gọi thẳng REST API của Resend qua `fetch` (xem `src/lib/email.ts`), không
dùng package `resend` nên không tốn thêm dependency.

1. Lấy API key tại **[resend.com](https://resend.com) → API Keys**.
2. Verify domain người gửi trong **Resend → Domains** trước khi gửi được
   tới email thật — gửi từ domain chưa verify sẽ bị Resend từ chối.

| Variable | Required? | Description |
|---|---|---|
| `RESEND_API_KEY` | Nên set ở production | API key của Resend. Không set thì `/api/auth/forgot-password` vẫn trả về thành công (tránh lộ email nào đã đăng ký) nhưng **không gửi được email nào**, chỉ log lỗi |
| `RESEND_FROM_EMAIL` | Không, có fallback hard-code | Địa chỉ người gửi, dạng `"Tên <email@domain-đã-verify>"` |

### Chế Độ Bảo Trì (Maintenance Mode)

Bật/tắt tại **`/admin/maintenance`**. Cờ lưu ở Redis (KHÔNG phải DB — middleware
chạy Edge runtime, không gọi được `pg`, xem comment đầu `src/lib/maintenance.ts`),
nên **bắt buộc phải có Redis đã cấu hình** (mục Redis ở trên) thì tính năng này mới
hoạt động — không set Redis thì maintenance mode coi như luôn tắt (fail open, không
khoá nhầm cả site nếu Redis lỗi).

Khi bật: mọi request công khai (trừ `/admin`, `/api/admin`, `/api/auth`,
`/api/internal`, `/api/health`) bị chặn ở tầng middleware — trang thường thấy
`/maintenance`, API trả 503 JSON. Session admin bypass hoàn toàn để kiểm tra site
trước khi tắt lại.

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

npm run db:setup         # Áp dụng schema.sql lên tất cả shards
npm run db:reset         # ⚠️ XOÁ TRẮNG tất cả shards (không thể hoàn tác)
npm run db:check-genres  # Kiểm tra bảng genres có đồng bộ (cùng id) trên mọi shard không
npm run db:fix-genre-ids # Sửa lệch id genres giữa các shard (dùng sau khi db:check-genres báo lỗi)
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
│   ├── page.tsx               # Homepage (ISR, revalidate 5m, đọc từ Redis homepage index)
│   ├── games/                 # Thư viện + game detail
│   ├── requests/              # Đề xuất game
│   ├── donate/                # Trang ủng hộ
│   ├── terms/                 # Điều khoản sử dụng
│   ├── login/ register/       # Auth pages
│   ├── forgot-password/       # Nhập email để yêu cầu reset mật khẩu
│   ├── reset-password/        # Trang đặt mật khẩu mới (theo link trong email)
│   ├── myaccount/             # Trang cá nhân
│   ├── maintenance/           # Trang hiển thị khi bật chế độ bảo trì
│   ├── admin/                 # Admin panel (protected): games, requests, reports, users, announcement, maintenance
│   └── api/                   # Route handlers
│       ├── auth/              # login, logout, register, me, forgot-password, reset-password
│       ├── games/             # public game API
│       ├── genres/            # public GET — danh sách thể loại (fanOut, dedupe theo slug)
│       ├── admin/             # admin-only API (games, users, reports, requests, announcement, maintenance, upload)
│       ├── announcement/      # public GET — announcement popup content
│       ├── account/           # avatar, password, bookmarks
│       ├── requests/          # vote
│       ├── internal/          # cron-only routes (xem Database Architecture)
│       │   ├── shard-check/   # cập nhật write-shard pointer
│       │   ├── reindex/       # build & cache homepage index vào Redis
│       │   └── keep-alive/    # ping mọi shard, chống Supabase free-tier tự pause
│       └── health/            # health check
├── components/
│   ├── games/                 # GameCard, BookmarkButton, DownloadButton, ...
│   ├── admin/                 # GameForm, AnnouncementForm
│   ├── announcement/          # AnnouncementBody — shared renderer (popup + admin preview)
│   ├── requests/               # VoteModal
│   ├── ui/                     # FormField, Button, Toast, Modal, SkeletonCard, TurnstileWidget
│   └── layout/                 # Navbar, Footer, AnnouncementModal, VipAnnouncementBar
├── lib/
│   ├── db/
│   │   ├── index.ts            # ShardedDb class
│   │   └── schema.sql          # Database schema (luôn ở bản mới nhất)
│   ├── emails/
│   │   └── passwordResetEmail.ts # HTML/text template cho email đặt lại mật khẩu
│   ├── announcement.ts         # getAnnouncement / updateAnnouncement (broadcast fanOut helpers)
│   ├── announcementStore.ts    # Client IndexedDB dismissal storage for the popup
│   ├── redis.ts                # Upstash Redis client + write-shard pointer + homepage index key/TTL
│   ├── queries.ts              # Server-side query helpers, gồm getHomepageIndex()
│   ├── auth.ts                 # Auth barrel re-export
│   ├── jwt.ts                  # JWT utils (Edge-safe)
│   ├── password.ts             # bcryptjs (Node.js only)
│   ├── passwordReset.ts        # Sinh & hash reset token (Node.js crypto, TTL 60 phút)
│   ├── email.ts                # Gửi email qua Resend REST API (fetch, fail-soft)
│   ├── avatars.ts              # Preset avatar list
│   ├── storage.ts              # Upload ảnh vào Supabase Storage
│   ├── turnstile.ts            # Cloudflare Turnstile verification
│   ├── vip.ts                  # VIP status computation (permanent / timed)
│   ├── adminGuard.ts           # Guard cho admin-only routes/pages
│   ├── maintenance.ts          # Đọc/ghi cờ chế độ bảo trì (Redis)
│   ├── linkShortener.ts        # bbmkts.com "vượt link" wrapping for non-VIP downloads
│   └── utils.ts                # Formatters, label helpers
├── types/
│   └── index.ts                # TypeScript types & interfaces
└── middleware.ts                # Edge middleware — auth guard + maintenance mode

migrations/
├── 002_games_updated_at_ignore_counters.sql  # Chỉ dành cho deployment cũ (xem Getting Started bước 3)
└── 003_password_reset.sql                    # Chỉ dành cho deployment cũ

scripts/
├── db-setup.mjs               # Apply schema to all shards
├── db-reset.mjs                # Wipe all shards (DANGER)
├── check-genre-shards.mjs      # Kiểm tra bảng genres đồng bộ id giữa các shard
├── fix-genre-shard-ids.mjs     # Sửa lệch id genres giữa các shard
├── create-admin.mjs            # Create / promote admin account
├── list-users.mjs              # List users across shards (role/VIP/search filters)
├── delete-user.mjs             # Permanently delete user(s) + cross-shard data
└── remove-admin.mjs            # Demote admin account(s) to regular user
```

---

## Deployment (Vercel)

1. Push lên GitHub → import vào Vercel
2. Thêm tất cả environment variables trong **Vercel Dashboard → Settings → Environment Variables**
3. Vercel tự động build và deploy mỗi khi push lên `main`

### Lưu ý khi deploy

- **Shard-check cron** (`/api/internal/shard-check`) được trigger bởi **cron-job.org** (external, mỗi 15 phút) chứ không phải `crons` trong `vercel.json` — Vercel Hobby chỉ cho cron của chính Vercel chạy tối đa 1 lần/ngày, xem [Write-Shard Pointer](#write-shard-pointer-redis--cron) ở trên để biết lý do và cách setup
- Set `CRON_SECRET` trong Vercel env vars **trước** khi tạo job trên cron-job.org, rồi copy đúng giá trị đó vào custom header `Authorization: Bearer ...` của job — 2 bên không tự đồng bộ, quên set thì route bỏ qua xác thực (không an toàn cho production)

---

## Adding a New Shard

Khi shard hiện tại gần đầy (gần ngưỡng `MAX_SHARD_BYTES`):

1. Tạo Supabase PostgreSQL instance mới
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

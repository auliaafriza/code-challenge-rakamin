# Deploy

Frontend dan backend tidak bisa tinggal di tempat yang sama. Yang satu file
statis, yang satu proses yang harus tetap hidup.

| Bagian | Tempat | Alasan |
|---|---|---|
| `web/` | Vercel | SPA statis. Cocok. |
| `api/` | Railway / Render / Fly.io / Kubernetes | Butuh proses persisten, WebSocket, dan Sidekiq. |
| PostgreSQL | managed (Neon, Supabase, Railway, RDS) | — |
| Redis | managed (Upstash, Railway, ElastiCache) | Sidekiq dan throttle state. |

## Kenapa backend tidak bisa di Vercel

Bukan karena Rails. Karena empat hal di kode ini:

1. **WebSocket panjang umur.** `AudioWebSocketMiddleware` memegang koneksi audio
   kandidat ke Gemini Live selama wawancara berlangsung — 45 sampai 90 menit.
   Vercel Functions berumur detik, bukan puluhan menit.
2. **EventMachine reactor.** Dinyalakan saat boot dan harus tetap hidup selama
   proses hidup. Tidak ada "proses" yang hidup di serverless.
3. **Sidekiq.** Worker terpisah yang berjalan terus untuk portfolio dan fit/gap.
4. **Grace period 120 detik** setelah browser kandidat terputus, supaya sesi
   tidak hilang saat ia me-refresh halaman.

Vercel tetap dipakai — untuk frontend.

---

## Frontend: Vercel

**Project settings**

| Field | Nilai |
|---|---|
| Root Directory | `web` |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm ci` |
| Node.js Version | 20.x |

**Environment Variables** (Production dan Preview)

```
VITE_API_BASE_URL   = https://api.domainmu.com/api/v1
VITE_WS_BASE_URL    = wss://api.domainmu.com
VITE_DEV_TOKEN      = (kosongkan)
VITE_DEV_TENANT_ID  = (kosongkan)
VITE_DEV_TENANT_NAME= (kosongkan)
```

`wss://`, bukan `ws://`. Situs https tidak boleh membuka WebSocket tidak
terenkripsi; browser memblokirnya tanpa memberi status HTTP apa pun.

Kosongkan `VITE_DEV_TOKEN`. Kalau terisi, `getStoredToken()` memakainya sebagai
fallback dan setiap pengunjung masuk sebagai pemilik token itu.

**Content-Security-Policy**

`web/vercel.json` memaku domain API di `connect-src`. Ganti ke domain API-mu:

```json
"connect-src 'self' https://api.domainmu.com wss://api.domainmu.com"
```

Kalau lupa, browser memblokir semua request sebelum meninggalkan halaman — tanpa
entri network, tanpa status. Terbaca persis seperti backend mati.
`npm run build` memeriksanya dan gagal lebih dulu kalau tidak cocok.

`rewrites` di file itu sudah benar: semua path diarahkan ke `index.html` supaya
react-router bekerja saat halaman di-refresh atau link dibuka langsung —
termasuk `/interview/:token` yang diklik kandidat dari email.

---

## Backend: Railway (contoh; Render dan Fly.io setara)

Repo sudah punya `api/Dockerfile`. Deploy dari situ, bukan dari buildpack.

**Service 1 — API**

```
Root Directory : api
Builder        : Dockerfile
Start Command  : bundle exec puma -C config/puma.rb
Health Check   : /api/v1/health
Port           : 3001
```

**Service 2 — Sidekiq** (repo yang sama, service terpisah)

```
Root Directory : api
Builder        : Dockerfile
Start Command  : bundle exec sidekiq -r ./config/environment.rb -C config/sidekiq.yml
Health Check   : (tidak ada)
```

Keduanya memakai environment variable yang sama.

**Environment variables**

```
RAILS_ENV           = production
RAILS_LOG_LEVEL     = info
SECRET_KEY_BASE     = <sama persis dengan rakamin-api — JWT dibagi>
PORT                = 3001
WEB_CONCURRENCY     = 2
RAILS_MAX_THREADS   = 16
RAILS_MIN_THREADS   = 16

DB_HOST             = <host postgres>
DB_PORT             = 5432
DB_NAME             = <nama database>
DB_USERNAME         = <user>
DB_PASSWORD         = <password>
DB_POOL             = 26

REDIS_URL           = <redis://... dari layanan Redis>

GEMINI_API_KEY      = <kunci Google AI Studio>
GEMINI_LIVE_MODEL   = gemini-2.0-flash-live-preview
GEMINI_FLASH_MODEL  = gemini-2.5-flash
GEMINI_PRO_MODEL    = gemini-2.5-pro

APP_BASE_URL        = https://app.domainmu.com      # domain FRONTEND
ALLOWED_ORIGINS     = https://app.domainmu.com
ALLOW_SELF_SIGNUP   = false
FORCE_SSL           = true
TOKEN_EXPIRATION_TIME = 259200
```

`APP_BASE_URL` adalah domain **frontend**, bukan domain API. Ia dipakai menyusun
link undangan `<APP_BASE_URL>/interview/<token>`, dan halaman itu dilayani
React. Salah isi tidak menimbulkan error apa pun — link tetap dibuat, tetap
dikirim, dan gagal di browser kandidat. Server memperingatkannya saat boot kalau
nilainya tidak ada di `ALLOWED_ORIGINS`.

`ALLOW_SELF_SIGNUP=false`. Produk rekrutmen dengan pendaftaran terbuka berarti
siapa pun di internet bisa melihat daftar kandidat.

**Migrasi**

Jalankan sekali setelah deploy pertama, dan setiap ada migrasi baru:

```bash
bundle exec rails db:migrate
```

Jangan taruh di start command. Dua instance yang start bersamaan akan
menjalankan migrasi yang sama pada saat yang sama.

**Akun pertama**

Instance kosong belum punya user. Akun pertama otomatis jadi admin:

```bash
curl -X POST https://api.domainmu.com/api/v1/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"kamu@perusahaan.com","password":"<password kuat>","role":"recruiter"}'
```

Lakukan dengan `ALLOW_SELF_SIGNUP=true` sementara, lalu matikan lagi. Atau lewat
`rails console` kalau platformnya menyediakan shell.

---

## Urutan deploy

1. Sediakan PostgreSQL dan Redis, catat URL-nya.
2. Deploy API, isi semua env kecuali `APP_BASE_URL` dan `ALLOWED_ORIGINS`.
3. Jalankan `db:migrate`, lalu `db:seed`.
4. Deploy frontend ke Vercel, catat domainnya.
5. Isi `APP_BASE_URL` dan `ALLOWED_ORIGINS` dengan domain Vercel itu, redeploy API.
6. Perbarui `connect-src` di `web/vercel.json` dengan domain API, redeploy frontend.
7. Buat akun admin pertama, lalu matikan `ALLOW_SELF_SIGNUP`.

Langkah 5 dan 6 saling menunggu: API perlu tahu domain frontend, frontend perlu
tahu domain API. Karena itu keduanya diisi setelah dua-duanya berdiri.

---

## Setelah live, periksa ini

```bash
curl -i https://api.domainmu.com/api/v1/health
```

Lalu dari browser di domain frontend, buka Network tab dan pastikan:

- request ke `/api/v1/assessments` menjawab 200, bukan gagal tanpa status
- tidak ada pesan CORS atau CSP di Console
- buat satu undangan, salin link-nya, dan **pastikan domainnya domain frontend**

Yang terakhir adalah satu-satunya artefak produk ini yang dipegang orang di luar
organisasi, dan satu-satunya yang salahnya tidak akan pernah dilaporkan.

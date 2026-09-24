# The Product
Please refer to https://github.com/rakamindev/ai-interview-platform/wiki for initial product specification

# The Platform

A two-service application used for the Product Engineer case study. It is provided as a single repository so the whole thing clones, runs, and releases as one unit.

```
.
├── api/    # Backend service (Ruby on Rails, PostgreSQL, Redis/Sidekiq)
└── web/    # Frontend web app (React 18 + TypeScript, Vite, Tailwind)
```

The two services run together: the web app talks to the API over REST and WebSocket.

## Menjalankan semua fitur secara lokal

Tidak perlu di-deploy. Seluruh produk — termasuk interview dengan Gemini Live —
jalan di laptop. Yang kamu butuhkan di luar repo ini hanya PostgreSQL, Redis,
dan satu API key Gemini.

Untuk deploy ke server, lihat [DEPLOY.md](DEPLOY.md).

---

### 0. Prasyarat

| Kebutuhan | Versi | Cek |
|---|---|---|
| Ruby | 3.3.2 (lihat `api/.ruby-version`) | `ruby -v` |
| Node.js | 18+ | `node -v` |
| PostgreSQL | 14+ | `pg_isready` |
| Redis | 6+ | `redis-cli ping` → `PONG` |
| Gemini API key | — | [aistudio.google.com](https://aistudio.google.com/apikey) |

Di macOS:

```bash
brew install postgresql@16 redis
brew services start postgresql@16
brew services start redis
```

Redis bukan opsional untuk demo penuh. Portfolio, fit/gap, generator system
prompt, dan analisis coverage semuanya lewat Sidekiq. Tanpa Redis, di
development job-nya dilewati dengan peringatan (lihat `api/app/lib/background_job.rb`)
— aplikasi tetap jalan, tapi laporan tidak pernah jadi.

---

### 1. Backend

```bash
cd api
bundle install
cp config/application.yml.sample config/application.yml
```

Edit `config/application.yml`:

| Kunci | Isi |
|---|---|
| `DB_USERNAME` / `DB_PASSWORD` | sesuai Postgres lokalmu |
| `SECRET_KEY_BASE` | `bundle exec rails secret` |
| `GEMINI_API_KEY` | key dari AI Studio |
| `APP_BASE_URL` | `http://localhost:5173` — **domain frontend, bukan port API** |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` |

**API key dan nama model — pakai `bin/setup-gemini`.**

```bash
bin/setup-gemini
```

Skrip ini meminta key (diketik, tidak tampil di layar dan tidak masuk riwayat
shell), menanyakan ke Google model apa yang tersedia untuk key itu, lalu
menuliskan `GEMINI_API_KEY` beserta tiga nama model ke `application.yml`.

Nama model memang harus ditanyakan, bukan disalin dari dokumentasi: nilai
bawaan di berkas sample menunjuk seri `gemini-2.0-*` yang sudah dimatikan
Google, dan model yang salah **tidak** menggagalkan boot — Rails menyala
normal dan baru gagal saat interview dimulai, di depan kandidat. Model Live
dikenali dari metode `bidiGenerateContent`; kalau key-mu tidak punya satu pun,
skripnya berhenti dan memberitahu, bukan menulis nilai yang pasti gagal.

Manual, kalau lebih suka:

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY" \
  | grep -o '"name": "models/[^"]*"'
```

Siapkan database dan jalankan:

```bash
bundle exec rails db:create db:migrate db:seed
bin/doctor                                    # periksa Ruby, Postgres, Redis, port, config
bundle exec rails server -p 3001
```

Di terminal kedua, Sidekiq:

```bash
cd api && bundle exec sidekiq -C config/sidekiq.yml
```

Cek: `curl http://localhost:3001/health` → `{"status":"ok"}`

`bin/doctor` adalah tempat pertama yang dilihat kalau ada yang aneh. Ia
memeriksa versi Ruby, keberadaan `application.yml`, koneksi Postgres dan Redis,
port 3001 yang tersangkut (lengkap dengan PID-nya), `tmp/pids/server.pid` basi,
mode Puma, dan `APP_BASE_URL`.

---

### 2. Frontend

```bash
cd web
yarn install          # repo ini memakai yarn.lock — jangan campur dengan npm install
cp .env.example .env
yarn dev
```

`.env` bawaan sudah menunjuk ke `http://localhost:3001`. Buka
**http://localhost:5173**.

Jangan menaruh JWT di `.env`. Vite menuliskan seluruh isi `import.meta.env` ke
dalam bundle, jadi apa pun ber-prefix `VITE_` bisa dibaca siapa pun dari tab
Sources setelah di-build. Untuk login cepat saat development, tempel sekali di
console browser:

```js
localStorage.setItem("auth_token", "<jwt>")
```

`yarn build` akan menolak build kalau menemukan rahasia yang menyelinap.

---

### 3. Jalur mencoba semua fitur

Urutannya disusun supaya tiap langkah menyiapkan langkah berikutnya. Satu kali
jalan penuh ≈ 15 menit.

#### Akun dan akses

| # | Fitur | Cara | Yang harus terjadi |
|---|---|---|---|
| 1 | **Signup + role** | `/signup` | Akun **pertama** di database otomatis jadi `admin`. Akun berikutnya memilih role: Assessor / Recruiter / Hiring Manager. `admin` tidak pernah bisa dipilih sendiri dari form. |
| 2 | **Login** | `/login` | Akun dengan role `user` (belum diberi peran) ditolak dengan pesan berbeda dari "password salah" |
| 3 | **Daftar user / top recruiter** | `/dashboard` (panel tim), atau `GET /api/v1/users` | Hanya staff yang boleh memanggilnya. Email hanya disertakan untuk admin |

`db:seed` membuat organisasi, skill taxonomy, dan assessment contoh — **tapi
tidak membuat user**. Jadi langkah 1 memang titik masuknya.

#### Menyiapkan lowongan dan asesmen

| # | Fitur | Cara | Yang harus terjadi |
|---|---|---|---|
| 4 | **Vacancy CRUD** | `/vacancies` → New | Tersimpan, muncul di daftar dan di dashboard sebagai "vacancy open" |
| 5 | **Assessment CRUD** | `/assessments` → New | Pilih skill dari taxonomy, atau tambah custom skill |
| 6 | **System prompt otomatis** | otomatis setelah menyimpan assessment | Sidekiq menjalankan `SystemPromptGeneratorWorker`. Tanpa Redis, log mencetak peringatan dan prompt tidak jadi |
| 7 | **Dashboard** | `/dashboard` | Top recruiter, vacancy open, assessment open — dihitung dari data nyata, bukan angka contoh |

#### Interview — inti produknya

| # | Fitur | Cara | Yang harus terjadi |
|---|---|---|---|
| 8 | **Undang kandidat** | `/assessments/:id/invite` | **Salin link-nya dan periksa domainnya**: harus `localhost:5173`, bukan `:3001`. Kalau `:3001`, `APP_BASE_URL` salah |
| 9 | **Halaman kandidat** | buka link undangan di **jendela incognito** | Ini yang kandidat lihat. Incognito penting — tanpa itu kamu memakai sesi login sendiri |
| 10 | **Hardware check** | otomatis di halaman itu | Izin mikrofon diminta, speed test jalan. Kamera hanya diminta kalau `VITE_REQUIRE_CAMERA=true` |
| 11 | **Interview (Gemini Live)** | klik mulai | WebSocket ke `ws://localhost:3001` terbuka, AI bicara duluan. Di sinilah nama model yang salah akan ketahuan |
| 12 | **Live monitor** | tab lain: `/assessments/:id/sessions/:sid/monitor` | Coverage skill bergerak realtime selama interview berjalan |
| 13 | **Grace period** | refresh tab kandidat di tengah interview | Sesi tidak hilang; ada tenggang 120 detik untuk menyambung lagi |
| 14 | **Akhiri sesi** | tombol end, atau tunggu selesai | Status jadi `ended`, `PortfolioGeneratorWorker` mengantre |

#### Hasil

| # | Fitur | Cara | Yang harus terjadi |
|---|---|---|---|
| 15 | **Transcript** | `/assessments/:id/sessions/:sid/transcript` | Giliran bicara AI dan kandidat, berurutan |
| 16 | **Portfolio** | `/assessments/:id/sessions/:sid/portfolio` | Skill beserta level dan bukti kutipan. Dibuat Sidekiq — kalau berhenti di "generating", cek Sidekiq dan Redis |
| 17 | **Override penilaian** | klik level skill di halaman portfolio | Penilaian manusia menimpa penilaian AI, dan tercatat sebagai override |
| 18 | **Fit/gap vs vacancy** | dari portfolio → pilih vacancy | Perbandingan skill kandidat dengan syarat lowongan |
| 19 | **Export PDF** | tombol export di portfolio | PDF terunduh. Font DejaVu dibundel supaya nama dan kutipan non-ASCII tidak menggagalkan Prawn |
| 20 | **Candidates** | `/candidates` | Semua kandidat lintas assessment, bisa difilter |
| 21 | **Analytics** | `/analytics` | Funnel, distribusi level, tren mingguan — dari data yang ada |

#### Mutu penilaian AI

| # | Fitur | Cara | Yang harus terjadi |
|---|---|---|---|
| 22 | **Laporan evaluasi** | `cd api && bundle exec rails eval:report` | Lima dimensi mutu, dihitung dari data yang ada tanpa memanggil Gemini |
| 23 | **Temuan tak berdasar** | `bundle exec rails eval:ungrounded` | Daftar kutipan bukti yang tidak ada di transkrip |

Cara membaca angkanya ada di [bagian 4](#4-analisis-memeriksa-mutu-penilaian-ai).

---

### 4. Analisis: memeriksa mutu penilaian AI

Ini bagian yang paling sering ditanya saat review, dan paling sulit dijawab
dengan jujur. Penilaian AI tidak jadi benar karena kalimatnya terdengar yakin.

Pertanyaannya juga bukan "apakah levelnya tepat" — tidak ada ground truth untuk
itu tanpa pelabelan manual berbulan-bulan. Yang bisa diperiksa sekarang adalah
**apakah cara AI sampai ke level itu bisa dipertahankan**: buktinya nyata,
keyakinannya berarti sesuatu, dan yang diukur kompetensi, bukan kefasihan.

Semuanya dihitung dari data yang sudah ada di database — `portfolio_skills`,
`assessor_overrides`, `coverage_maps`, `transcript_turns`. **Tidak ada satu pun
panggilan ke Gemini**, jadi gratis, cepat, dan bisa dijalankan berulang.

```bash
cd api
bundle exec rails eval:report                        # laporan lengkap
bundle exec rails eval:ungrounded                    # daftar kutipan bermasalah
EVAL_FORMAT=json bundle exec rails eval:report > eval.json   # untuk CI
```

Belum punya data? `bundle exec rails demo:seed` membuat satu portfolio yang
sengaja memuat setiap kasus pinggir, termasuk kutipan yang tidak ada di
transkrip — jadi laporannya punya sesuatu untuk ditemukan.

#### Yang diukur

| # | Dimensi | Pertanyaan yang dijawab | Gagal berarti |
|---|---|---|---|
| 1 | **Grounding** | Apakah kutipan bukti benar-benar ada di transkrip? | Bukan "kurang akurat" — **karangan** |
| 2 | **Kalibrasi** | Apakah `high` dikoreksi lebih jarang daripada `low`? | Kolom keyakinan cuma hiasan |
| 3 | **Kecukupan bukti** | Berapa probe yang menopang tiap level? | `high` dari 1 probe = tebakan yang terdengar yakin |
| 4 | **Override** | Seberapa jauh AI meleset, dan ke arah mana? | Bias berarah bisa diperbaiki lewat prompt; sebaran acak tidak |
| 5 | **Verbositas** | Level naik seiring panjang jawaban? | Yang diukur siapa yang banyak bicara, bukan siapa yang kompeten |

#### Membaca hasilnya

**1. Grounding** — tiap kutipan dicocokkan ke giliran bicara kandidat dalam tiga
tingkat: sama persis, mirip ≥85% kata (parafrase), dan tidak ditemukan. Kalau
AI menyertakan nomor turn, nomor itu ikut diverifikasi.

| Temuan | Artinya | Tindakan |
|---|---|---|
| `Kutipan tidak ditemukan > 0` | Model mengarang bukti | `eval:ungrounded` untuk daftarnya. Perketat prompt agar mengutip verbatim |
| `Mirip tapi tidak persis` tinggi | Model memparafrase, bukan mengutip | Masih bisa diaudit manusia, tapi jejaknya kabur |
| `Turn yang ditunjuk salah` | Nomor turn tidak cocok dengan isinya | Jejak audit rusak — assessor tidak bisa memverifikasi |
| `Skill tanpa bukti sama sekali` | Level diberikan tanpa dasar tertulis | Skill itu seharusnya tidak dinilai, bukan dinilai rendah |

Ini satu-satunya dimensi yang **objektif** — tidak butuh pendapat siapa pun.
Kutipan ada di transkrip, atau tidak. Mulai dari sini.

**2. Kalibrasi** — tabel override rate per tingkat keyakinan. Yang dicari
urutannya, bukan angka mutlaknya: `high` harus dikoreksi lebih jarang daripada
`low`. Kalau terbalik atau sama, kolom `ai_confidence` tidak membawa informasi
dan sebaiknya tidak ditampilkan ke assessor — menampilkan keyakinan palsu lebih
buruk daripada tidak menampilkan apa-apa, karena ia mengarahkan perhatian ke
tempat yang salah.

**3. Kecukupan bukti** — silang antara jumlah probe (dari `coverage_maps`) dan
tingkat keyakinan. Baris yang dicari: **`high` dengan 0–1 probe**. Satu jawaban
bagus tentang satu topik tidak cukup untuk menyimpulkan penguasaan; kalau angka
ini tidak nol, modelnya menyimpulkan terlalu cepat, dan itu diperbaiki di
strategi bertanya, bukan di scoring.

**4. Override** — tiga angka yang berbeda maksudnya:

- **rate** — seberapa sering assessor mengoreksi
- **bias** — rata-rata berarah. Positif berarti AI menilai terlalu rendah,
  negatif terlalu tinggi. Di atas |0.3| tingkat sudah berarah, dan yang berarah
  bisa diperbaiki lewat prompt
- **|Δ|** — rata-rata besar selisih tanpa arah. Bias kecil tapi |Δ| besar
  berarti modelnya meleset ke dua arah — itu bukan masalah kalibrasi, itu
  masalah kemampuan

Ada juga rincian per skill: skill mana yang paling sering salah dinilai. Biasanya
ada satu-dua skill yang menyumbang sebagian besar error, dan memperbaiki
definisi skill itu lebih murah daripada mengutak-atik prompt global.

**Override rate 0% bukan kabar baik.** Kemungkinan terbesarnya bukan AI-nya
sempurna, melainkan assessor main stempel. Otomasi yang tidak pernah dikoreksi
adalah otomasi yang sudah berhenti diawasi — dan itu justru kondisi paling
berbahaya untuk produk yang memutuskan nasib lamaran orang.

**5. Verbositas** — korelasi Pearson antara panjang jawaban yang dikutip dengan
level yang diberikan. Proksi kasar, tapi temuan kuatnya jelas:

| r | Artinya |
|---|---|
| < 0.3 | Panjang jawaban bukan penentu |
| 0.3 – 0.5 | Ada kecenderungan, perlu diawasi |
| ≥ 0.5 | Yang diukur kefasihan, bukan kompetensi |

Ini penting khusus untuk produk rekrutmen: bias kefasihan menghukum kandidat
yang berpikir sebelum bicara, dan yang tidak bicara dalam bahasa pertamanya.
Butuh minimal 5 sampel sebelum angkanya berarti.

#### Yang belum tercakup — dan cara mengerjakannya

Jujur soal batasnya lebih berguna daripada laporan yang terlihat lengkap. Tiga
hal berikut butuh **memanggil model**, jadi tidak bisa dihitung dari database:

| Yang belum diuji | Cara mengujinya |
|---|---|
| **Konsistensi antar-run** | Jalankan `PortfolioGeneratorWorker` dua kali atas transkrip yang sama, bandingkan levelnya. Model yang memberi level berbeda untuk input identik tidak bisa dipakai memutuskan lamaran |
| **Invariansi identitas** | Ganti nama kandidat di transkrip (nama laki-laki → perempuan, nama Jawa → Tionghoa → Batak), regenerate, bandingkan. Level yang bergeser adalah bias yang bisa ditunjukkan dengan angka |
| **Ground truth manusia** | Dua assessor menilai transkrip yang sama secara buta, ukur kesepakatan antar-mereka lebih dulu. Kalau manusia saja tidak sepakat, menuntut AI lebih tepat dari itu tidak masuk akal |

Dua yang pertama bisa dikerjakan dalam satu sore dan hasilnya kuantitatif. Yang
ketiga mahal, tapi tanpanya semua angka di atas mengukur *konsistensi internal*,
bukan *kebenaran*.

#### Memakainya di CI

`EVAL_FORMAT=json` membuat laporannya bisa dijadikan gerbang rilis — misalnya
tolak deploy kalau `grounding.not_found > 0`:

```bash
EVAL_FORMAT=json bundle exec rails eval:report \
  | ruby -rjson -e 'exit JSON.parse($stdin.read).dig("grounding","not_found").to_i.zero? ? 0 : 1'
```

Satu catatan soal gerbang ini: database tanpa satu pun kutipan juga lolos,
karena tidak ada yang bisa gagal. Kalau dipakai sungguhan di CI, periksa
`grounding.quotes > 0` lebih dulu — kalau tidak, pipeline yang datanya kosong
akan terlihat hijau.

---

### 5. Fitur mana butuh apa

Berguna kalau kamu hanya ingin menunjukkan sebagian.

| Fitur | Butuh Postgres | Butuh Redis | Butuh Gemini key |
|---|:---:|:---:|:---:|
| Signup, login, dashboard | ✓ | — | — |
| Vacancy, assessment (CRUD) | ✓ | — | — |
| System prompt otomatis | ✓ | ✓ | ✓ |
| Interview + live monitor | ✓ | ✓ | ✓ |
| Transcript | ✓ | — | — |
| Portfolio, fit/gap | ✓ | ✓ | ✓ |
| Override penilaian | ✓ | — | — |
| Export PDF | ✓ | — | — |
| Analytics, candidates | ✓ | — | — |
| `rails eval:report` | ✓ | — | — |

Artinya: **tanpa API key pun kamu masih bisa mendemokan alur rekruter dari ujung
ke ujung**, asal ada satu sesi yang sudah selesai di database. Dua rake task
menyiapkannya:

```bash
cd api
bundle exec rails demo:seed        # satu portfolio + fit/gap, memuat tiap kasus pinggir
bundle exec rails demo:dashboard   # beberapa staf, lowongan, dan assessment
```

Keduanya punya pasangan pembersih: `demo:reset` dan `demo:dashboard_reset`.
Berguna kalau API key belum jadi tapi demo sudah harus jalan — atau sebagai
cadangan kalau kuota Gemini habis di tengah presentasi.

---

### 6. Kalau macet

Jalankan `cd api && bin/doctor` lebih dulu. Kalau belum jelas:

| Gejala | Penyebab yang paling sering |
|---|---|
| Semua request `(failed)`, 0 byte, tanpa status HTTP | Rails belum jalan, atau Puma jalan cluster mode di development. `bin/doctor` menyebut mode-nya |
| Link undangan menunjuk `localhost:3001` | `APP_BASE_URL` salah. Figaro dibaca saat boot — **restart Rails** setelah mengubahnya |
| Login gagal, log Rails bersih | `ALLOWED_ORIGINS` tidak memuat `http://localhost:5173` |
| Portfolio berhenti di "generating" | Sidekiq tidak jalan, atau Redis mati. `redis-cli ping` |
| Interview gagal begitu dimulai | Nama model Gemini salah atau key belum diisi. Cek log Rails |
| `yarn dev` gagal setelah pernah `npm install` | Dua lockfile bertabrakan. Hapus `package-lock.json`, lalu `yarn install` |
| Port 3001 dipakai | `bin/doctor` menyebut PID-nya |

Sebelum menebak, baca lognya: `tail -f api/log/development.log`.

---

## Notes for the case study

- This is the codebase you assess, harden, and release. Treat it as a version about to ship to a client.
- Work in the `/assessment` folder at the repo root for your written deliverables; code changes go in `api/` or `web/`.
- See the case-study brief you were given for what to produce and how it is evaluated.

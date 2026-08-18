# Perubahan — slice Portfolio → Fit/Gap

Satu tesis: **di produk asesmen, frontend bukan lapisan tampilan melainkan lapisan
akuntabilitas.** Tugasnya membawa ketidakpastian dan asal-usul keputusan secara utuh
dari model sampai ke mata orang yang menandatangani keputusannya.

---

## Cara menjalankan

```bash
# 1 — backend
cd api
bundle exec rails db:migrate           # satu migrasi, aditif & reversible
bundle exec rails demo:seed            # data demo lengkap, tanpa memanggil Gemini
bundle exec rspec                      # engine spec + request spec tenancy

# 2 — frontend
cd ../web
npm install                            # menambah vitest + testing-library
npm test                               # 34 test
npm run dev
```

`demo:seed` mencetak URL portfolio dan fit/gap yang bisa langsung dibuka, beserta
daftar edge case yang sengaja ditanam di dalamnya.

Untuk membongkar: `bundle exec rails demo:reset`.

---

## Yang diperbaiki

### P0-1 · Kolom "Dibutuhkan" kosong di setiap baris

Backend mengemit `expected_level`, frontend membaca `required_level`.
`LEVEL_LABELS[undefined]` → `undefined` → React merender string kosong. Tidak ada
error di mana pun; sel kosongnya terlihat seperti pilihan desain.

- `api/app/services/fit_gap/engine.rb` — mengemit `required_level`, dengan
  `expected_level` dipertahankan sebagai alias deprecated (aditif, kompatibel mundur).
- `web/src/services/schemas.ts` — menormalkan kedua nama menjadi satu, dan
  **menolak** baris yang tidak punya keduanya alih-alih menggambar sel kosong.

### P0-2 · Penanda override tidak pernah muncul, legendanya selalu tampil

`engine.rb` sudah menghitung `overridden` lalu membuangnya, sementara tabel
menampilkan legenda "✎ = human override applied" tanpa syarat di setiap laporan.

- Payload kini membawa `is_override`, `ai_level` (nilai sebelum dikoreksi),
  `overridden_by_email`, dan `overridden_at`.
- `ComparisonTable` menampilkan **AI L2 → L4** beserta siapa dan kapan.
- Legenda hanya muncul kalau memang ada override di tabel itu.

### P0-3 · Confidence dihitung, dikirim, lalu dibuang

"L4 dari satu probe" dan "L4 dari empat probe mendalam" tampil identik.

- Payload membawa `confidence` **dan** `probe_count` — angka yang menjadi dasar
  caveat itu, supaya pembaca bisa memeriksanya, bukan mempercayainya.
- Gap yang berdiri di atas bukti tipis mendapat peringatan eksplisit di halaman.

### P0-4 · IDOR lintas-tenant (UU PDP)

`Portfolio` tidak punya `tenant_id`; tenant-nya ada di `Session` yang `TenantScoped`.
Empat endpoint menjangkaunya lewat `Portfolio.find(params[:id])` telanjang, jadi
assessor organisasi lain bisa mengunduh kutipan wawancara verbatim kandidat orang
lain — dan **menulis** override pada penilaian mereka.

- Semua lookup lewat session yang ter-scope: `Portfolio.where(session_id: Session.select(:id))`.
- ID lintas-tenant kini 404, bukan 200.
- Ekspor dan override dicatat ke audit log.
- `spec/requests/portfolio_tenancy_spec.rb` mengunci perilaku ini, termasuk satu
  test yang memastikan pemilik sahnya **masih bisa** mengakses datanya.

### P0-5 · Regenerasi portfolio menghapus override assessor

`portfolio.portfolio_skills.destroy_all` di generator, dikombinasikan dengan
`has_one :assessor_override, dependent: :destroy`, membuat **setiap regenerasi
menghapus koreksi manusia** beserta catatannya — justru satu-satunya record di
sistem ini yang tidak bisa direproduksi ulang, dan yang dipakai kandidat untuk
membantah skor AI.

- `save_skills` kini menyimpan override (dikunci ke `skill_label`), menulis ulang
  skill-nya, lalu memasang kembali override-nya — seluruhnya dalam satu transaksi.
- `ai_level` pada override dibaca ulang dari skill yang baru, jadi ia mencatat apa
  yang sedang dikoreksi, bukan nilai lama.
- Override yang skill-nya hilang di generasi baru dicatat sebagai peringatan,
  bukan hilang diam-diam.
- Ditutup juga temuan "tidak ada transaksi": kegagalan di tengah tidak lagi
  meninggalkan portfolio separuh jadi.
- `spec/services/portfolios/generator_spec.rb` mengunci keenam perilaku ini.

### P1-1 · Portfolio nyangkut tanpa jalan keluar

Status `pending` lolos dari cek 202, frontend polling 5 detik selamanya di bawah
tulisan "This takes about 2 minutes", tombol Retry hanya dirender untuk `failed`,
dan endpoint `regenerate` menolak apa pun selain `failed`.

- Kolom `generation_started_at` membedakan "sedang jalan" dari "wedged".
- `usePolling` punya timeout, jeda saat tab tersembunyi, dan opsi `immediate`.
- Retry tersedia untuk portfolio yang tertahan, bukan hanya yang gagal.
- Pesan error disanitasi sebelum melintasi batas layanan — `generation_error`
  menyimpan pesan exception mentah dari pemanggilan Gemini, dan prompt-nya memuat
  transkrip wawancara.

### P1-2 · Duplicate job pada Fit/Gap

Simpan override → report dihapus & worker di-enqueue → halaman dapat 404 → enqueue
worker kedua → dua worker berlomba di unique index, satu mati, dua panggilan Gemini
dibayar untuk satu jawaban.

- `FitGap::JobGuard` — kunci Redis `SET NX EX`, **fail-open** (kalau Redis mati,
  mengerjakan dua kali lebih baik daripada tidak sama sekali).
- Worker melepas kunci di setiap jalur, termasuk saat crash.
- `RecordNotUnique` diperlakukan sebagai no-op, bukan kegagalan.
- Frontend meminta generasi paling banyak sekali per mount.

### P1-4 · Tidak ada error state

`FitGapReportPage` hanya menangani 404; `PortfolioPage` memakai `.catch(() => {})`;
ekspor tidak punya `catch` sama sekali, dan karena `responseType: "blob"` body error
422 datang sebagai Blob yang tak terbaca.

- `DataIntegrityNotice` menampilkan field mana yang melanggar kontrak.
- `readErrorMessage` men-decode body Blob supaya pesan asli server sampai ke assessor.
- Empty state bermakna untuk portfolio tanpa skill dan vacancy tanpa perbandingan.

### P2 · Semantik level, provenance, dan verifiability

- `parseLevel` mengembalikan `null` untuk data yang tidak bisa dipercaya —
  **tidak pernah lagi** jatuh ke L1, rating paling merugikan di skala.
- `ai_confidence` kini nullable: "belum diukur" punya representasi sendiri, terpisah
  dari "rendah". Nilai model yang tidak terbaca dihitung ulang dari coverage map
  memakai aturan yang sama dengan prompt-nya, bukan digagalkan seluruh portfolio-nya.
- `overridden_by` / `overridden_at` yang selama ini dikirim API tapi tidak pernah
  dirender kini terlihat di kartu skill.
- Kutipan bukti bisa diklik → melompat ke giliran transkrip yang mengucapkannya
  (`evidence_turn_ids`, dengan fallback pencocokan teks kalau model tidak menyebut
  nomor giliran).
- `OverridePanel` menyinkronkan derived state, dan Batal benar-benar membatalkan.
- `getOverride` (POST yang membuat resource) diganti nama menjadi `saveOverride`.

### P3 · Aksesibilitas & responsif

- Status memakai glyph teks + label, bukan emoji berwarna: screen reader tidak lagi
  membacakan "check mark button Match", dan pengguna buta warna tidak kehilangan
  pembeda match/gap (WCAG 1.4.1).
- Tabel punya `<caption>`, `scope` pada header, dan rowheader per baris.
- Tabel terbaca di viewport 375px; teks panjang wrap, label tanpa spasi tidak
  melebarkan layout.

---

## Test

**34 test frontend**, hijau:

| Berkas | Menjaga |
|---|---|
| `ComparisonTable.contract.test.tsx` | AC-1, AC-2, AC-3, AC-4 |
| `schemas.test.ts` | AC-1.2, AC-1.3, forward & backward compatibility |
| `levelSemantics.test.tsx` | AC-4.1–4.3, AC-3.2 |
| `usePolling.test.ts` | AC-5.1, AC-5.4 |

**End-to-end (Playwright)** — dijalankan terhadap stack sungguhan, dan **setiap
run direkam video**. Rekamannya bukan screen capture orang mengklik-klik, tapi
rekaman assertion yang lolos:

| Test | Menjaga |
|---|---|
| `assessor-journey` · alur utama | AC-1.1, AC-2.2, AC-3.1, AC-3.2, AC-3.3, AC-4.4, AC-7.1 — keempat P0 diuji di halaman hidup |
| `assessor-journey` · laporan basi | AC-6.5 |
| `assessor-journey` · kontrak dilanggar | AC-1.2 — response fit/gap dicegat dan `required_level` dihapus dari setiap baris, mereproduksi bentuk persis P0-1 |
| `assessor-journey` · API 500 | AC-6.1 |
| `responsive` · viewport 375px | AC-7.3, AC-7.5 |

Cara menjalankan dan mengubah rekamannya jadi mp4: `web/e2e/README.md`.

**RSpec** — spec pertama untuk repositori ini:

| Berkas | Menjaga |
|---|---|
| `spec/services/fit_gap/engine_spec.rb` | Bentuk decision record, penerapan override, fallback narasi |
| `spec/requests/portfolio_tenancy_spec.rb` | P0-4, keempat endpoint |

### Bukti seeded fault

`SEEDED-FAULT-EVIDENCE.txt` merekam tiga kerusakan yang sengaja ditanam ke logika
yang sudah diperbaiki, beserta test yang menangkapnya:

| Fault | Test yang gagal |
|---|---|
| Hapus mapping `expected_level` → `required_level` | 2 |
| Kembalikan fallback `parseLevel` ke `1` | 3 |
| Petakan confidence tak dikenal ke `LOW` | 2 |
| *(setelah revert)* | 34 lulus |

### Catatan verifikasi

Dua kali asumsi dikoreksi oleh test, bukan oleh pembacaan ulang:

1. **`ConfidenceIndicator` ternyata sudah benar.** Dugaan awal: `getLabel`
   salah menangani nilai berkapital dari model. Test-nya lulus — baris `:6` sudah
   memanggil `.toLowerCase()`. Temuan diturunkan; test dipertahankan sebagai
   regression guard.

2. **`usePolling` yang baru punya bug sendiri.** `onTimeout` terpanggil dua kali,
   karena update state React asinkron sementara interval-nya tidak, sehingga cabang
   deadline menyala lagi sebelum effect sempat dijalankan ulang. Diperbaiki dengan
   latch sinkron di dalam closure. Ditemukan oleh test yang ditulis untuk hook itu
   sendiri, sebelum kodenya pernah dijalankan di browser.

---

## Yang sengaja tidak dikerjakan

**P1-3 Live Monitor** — `LiveMonitorPage.tsx:108-110` menelan semua error polling,
jadi API yang 500 terus-menerus terlihat identik dengan "kandidat sedang diam".
Terdokumentasi lengkap di laporan, di luar slice ini.

Alasannya diambil dari brief-nya sendiri: *perubahan yang membuat produk ini
benar-benar lebih baik bagi orang-orang yang tersentuh olehnya, bukan yang menyentuh
paling banyak baris kode.*

**Pengecualian: P0-4 tetap dikerjakan** meski berada di luar tema frontend.
Membiarkan kebocoran data pribadi lintas-tenant yang sudah diketahui, di produk yang
menangani transkrip wawancara di bawah UU PDP, bukan keputusan scoping — itu kelalaian.

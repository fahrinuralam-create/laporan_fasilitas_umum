# Pelaporan Fasilitas

Aplikasi pelaporan kerusakan fasilitas publik berbasis **Next.js 16**, **Prisma**, dan **MySQL**.

Aplikasi ini menghubungkan masyarakat (pelapor), petugas (penindak lanjut), dan admin
(verifikator) dalam satu alur kerja, dilengkapi analisis AI, notifikasi WhatsApp, dan
chatbot in-app **SiLapor**.

## Identitas Mahasiswa dan Proyek

| Keterangan | Informasi |
|---|---|
| Nama | Fahri Nur Alam |
| NIM | 41257102 |
| Kelompok | RPL-01 |
| Tema Topik Kelompok | Smart City & Civic Technology |
| Topik Proyek | Sistem Pelaporan Fasilitas Umum Berbasis Artificial Intelligence |

## Video Final Demo

Tautan video demo final:

<https://youtu.be/FI-Z3Ff0Zvk>



## Daftar Isi

- [Identitas Mahasiswa dan Proyek](#identitas-mahasiswa-dan-proyek)
- [Video Final Demo](#video-final-demo)
- [Fitur](#fitur)
- [Prasyarat](#prasyarat)
- [Menjalankan](#menjalankan)
- [Environment](#environment)
- [WhatsApp](#whatsapp)
- [AI](#ai)
- [Chatbot SiLapor](#chatbot-silapor)
- [Unit Testing](#unit-testing)
- [CI/CD dengan GitHub Actions](#cicd-dengan-github-actions)
- [Scripts](#scripts)
- [Verifikasi E2E](#verifikasi-e2e)

## Fitur

- Autentikasi & peran: **ADMIN**, **PETUGAS**, **MASYARAKAT**
- Laporan masyarakat: buat, foto kondisi, lokasi, riwayat, notifikasi
- Alur kerja admin & petugas: verifikasi, penugasan, proses, selesai, tolak
- Konfigurasi AI (provider, model teks/vision, API key terenkripsi)
- Analisis AI otomatis + manual (kategori, prioritas, relevansi foto, duplikat)
- Chatbot in-app **SiLapor** (tanya jawab kontekstual sesuai peran)
- Notifikasi WhatsApp (Fonnte) & chatbot

### Halaman utama

| Peran | Halaman |
|---|---|
| **Masyarakat** | Dashboard Masyarakat, Laporan Saya, Buat Laporan, Notifikasi, Pengaturan WhatsApp |
| **Petugas** | Dashboard Petugas, Tugas Saya |
| **Admin** | Dashboard Admin, Kelola Laporan, Konfigurasi AI, WhatsApp (monitoring), Verifikasi WhatsApp |

## Prasyarat

- **Node.js** 20.9 atau lebih baru (disarankan **24.x**, versi yang dipakai pipeline CI)
- **npm** (proyek ini menyertakan `package-lock.json`)
- **MySQL** yang sudah berjalan dan dapat diakses

## Menjalankan

### 1. Instal dependensi

```bash
npm install
```

### 2. Generate Prisma Client

```bash
npx prisma generate
```

### 3. Jalankan server pengembangan

```bash
npm run dev
```

Buka <http://localhost:3000>.

## Environment

Salin `.env.example` menjadi `.env`, lalu sesuaikan nilainya:

```env
DATABASE_URL="mysql://root:@localhost:3306/pelaporan_fasilitas"
NEXTAUTH_SECRET="ganti-dengan-string-acak-yang-cukup-panjang-dan-acak"
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Provider AI OpenAI-compatible (analisis AI laporan & foto).
# Konfigurasi utama dapat diubah dari halaman Admin > Konfigurasi AI.
NVIDIA_API_KEY=""
# Kunci enkripsi API key AI (opsional; jika kosong memakai NEXTAUTH_SECRET).
AI_CONFIG_ENCRYPTION_KEY=""
# Batas ukuran snapshot database yang dikirim ke model chatbot (karakter).
# Naikkan jika model mendukung konteks besar; turunkan untuk model konteks kecil.
CHATBOT_DB_CONTEXT_MAX_CHARS="60000"

# --- WhatsApp (Fonnte) untuk notifikasi masyarakat ---
# Token hanya dipakai di server; jangan pernah diekspos ke browser.
FONNTE_API_TOKEN=""
FONNTE_API_URL="https://api.fonnte.com/send"
FONNTE_COUNTRY_CODE="62"
# Rahasia HMAC untuk hash kode OTP (opsional; jika kosong memakai NEXTAUTH_SECRET).
WHATSAPP_OTP_SECRET=""
```

Ringkasan kegunaan variabel:

| Variabel | Wajib | Keterangan |
|---|---|---|
| `DATABASE_URL` | Ya | Koneksi MySQL untuk Prisma |
| `NEXTAUTH_SECRET` | Ya | Kunci sesi/penandatanganan NextAuth |
| `NEXTAUTH_URL` | Ya | URL aplikasi untuk NextAuth |
| `NEXT_PUBLIC_APP_URL` | Ya | URL publik aplikasi di sisi klien |
| `NVIDIA_API_KEY` | Tidak | Fallback API key AI bila belum diatur dari Admin |
| `AI_CONFIG_ENCRYPTION_KEY` | Tidak | Kunci enkripsi API key AI; fallback ke `NEXTAUTH_SECRET` |
| `CHATBOT_DB_CONTEXT_MAX_CHARS` | Tidak | Batas karakter snapshot DB untuk chatbot |
| `FONNTE_API_TOKEN` | Tidak | Token Fonnte; diperlukan agar notifikasi WhatsApp terkirim |
| `FONNTE_API_URL` | Tidak | Endpoint pengiriman Fonnte |
| `FONNTE_COUNTRY_CODE` | Tidak | Kode negara default untuk normalisasi nomor |
| `WHATSAPP_OTP_SECRET` | Tidak | Rahasia HMAC hash kode OTP; fallback ke `NEXTAUTH_SECRET` |

> **Penting:** database ini berisi data lama. Jangan menjalankan
> `prisma migrate reset` atau `prisma db push` pada database yang sudah terisi.

File `.env` tidak pernah ikut di-commit (lihat `.gitignore`).

## WhatsApp

Notifikasi eksternal dikirim melalui Fonnte (`POST /send`). Token hanya dibaca
di server dan tidak pernah dikirim ke browser. Halaman **Admin > WhatsApp**
menampilkan ringkasan konfigurasi Fonnte, jumlah notifikasi terkirim/gagal, serta
status tautan (menunggu admin, menunggu verifikasi, aktif).

### Alur penautan dengan persetujuan admin + OTP

1. Pengguna membuka **Pengaturan WhatsApp** dan mengirim nomor WhatsApp.
   Sistem membuat pengajuan berstatus **PENDING_ADMIN**.
2. Admin membuka **Admin > Verifikasi WhatsApp**. Pengajuan dapat disetujui
   atau ditolak (alasan penolakan wajib diisi). Verifikasi WhatsApp hanya
   dilakukan oleh admin.
3. Setelah disetujui, status menjadi **PENDING_VERIFICATION** dan sistem
   mengirim kode OTP 6 digit ke nomor tersebut melalui WhatsApp.
4. Pengguna memasukkan kode OTP di **Pengaturan WhatsApp**. Setelah benar,
   status menjadi **ACTIVE** dan nomor tersimpan sebagai nomor terverifikasi.
5. Hanya nomor yang **ACTIVE**, terverifikasi, dan notifikasinya diaktifkan
   yang menerima notifikasi.

Persetujuan admin dan verifikasi kepemilikan nomor adalah dua status terpisah.
Kode OTP disimpan dalam bentuk hash, berlaku 10 menit, maksimal 5 percobaan,
dan hanya dapat dipakai sekali.

Saat mengganti nomor, nomor lama tetap aktif sampai nomor baru berhasil
diverifikasi. Riwayat pengajuan tetap disimpan. Jika pengiriman OTP gagal,
persetujuan admin tetap berlaku dan admin dapat mengirim ulang OTP.

### Migrasi database

Perubahan skema WhatsApp diterapkan lewat migration terkontrol
`prisma/migrations/20261114000000_whatsapp_otp_migration`. Terapkan dengan:

```bash
npx prisma migrate deploy
```

```bash
npx prisma generate
```

Jangan menjalankan `prisma migrate reset` atau `prisma db push` pada database
yang sudah berisi data.

## AI

Atur provider, base URL, model teks/vision, dan API key di
**Admin > Konfigurasi AI**. API key disimpan terenkripsi (AES-256-GCM) dan
hanya ditampilkan dalam bentuk masking. Gunakan tombol **Uji Koneksi Teks** untuk
memastikan konfigurasi benar.

Analisis AI berjalan otomatis di latar belakang saat laporan dibuat, dan dapat
dijalankan ulang lewat tombol **Analisis AI** di detail laporan admin.

Laporan baru dapat **ditolak otomatis** bila:

- terindikasi duplikat kuat dengan laporan lain yang masih aktif (kemiripan
  teks dan/atau lokasi tinggi), atau
- foto kondisi jelas tidak sesuai dengan judul/deskripsi laporan dan model
  vision yakin (keyakinan minimal 70%).

Penolakan otomatis hanya berlaku untuk laporan berstatus **Diajukan** atau
**Diverifikasi**. Laporan yang sudah ditugaskan/diproses tidak diubah statusnya.
Duplikat dengan kemiripan sedang tetap ditandai sebagai "Kemungkinan Duplikat"
untuk ditinjau admin, bukan langsung ditolak, agar tidak salah menolak laporan
yang sah. Pelapor menerima riwayat status, notifikasi in-app, dan notifikasi
WhatsApp (jika nomor sudah terverifikasi) berisi alasan penolakan.

Model teks yang dikonfigurasi juga dipakai oleh chatbot in-app **SiLapor**
untuk pertanyaan yang bersifat terbuka.

## Chatbot SiLapor

Tombol **Tanya SiLapor** tersedia di semua halaman yang sudah login. Chatbot
menjawab sesuai peran dan data pengguna:

- **Masyarakat**: jumlah/status laporan sendiri, cara membuat laporan, arti
  status, prioritas otomatis, notifikasi, dan penautan WhatsApp.
- **Petugas**: daftar tugas yang ditugaskan, cara memulai/menyelesaikan tugas,
  dan status tugas.
- **Admin**: ringkasan seluruh laporan, alur verifikasi/penugasan, dan
  konfigurasi AI/verifikasi WhatsApp.

### Akses database penuh (role-aware)

Saat AI dipakai, SiLapor menerima **snapshot database** dan dapat memanggil tool
`query_database` untuk membaca data yang tidak tercakup di snapshot. Cakupan
akses mengikuti peran:

- **Admin**: seluruh laporan, pengguna, riwayat status, metadata foto, notifikasi,
  konfigurasi AI (API key hanya masking), dan status tautan WhatsApp.
- **Petugas**: laporan yang ditugaskan kepadanya, riwayat/foto laporan tersebut,
  notifikasi miliknya, dan statistik agregat tanpa data pribadi pengguna lain.
- **Masyarakat**: laporan miliknya, riwayat/foto laporan tersebut, notifikasi
  miliknya, dan statistik agregat tanpa data pribadi pengguna lain.

Data sensitif tidak pernah dibaca atau dikirim ke model: password, API key
mentah, token Fonnte mentah, kode OTP, dan isi gambar mentah (hanya metadata/analisis
AI-nya). Tool database selalu menerapkan pembatasan peran di server, sehingga
pengguna tidak dapat mengakses data di luar haknya meskipun memintanya lewat
prompt.

Pertanyaan umum dijawab langsung dari database sehingga instan dan akurat.
Pertanyaan terbuka, pencarian, atau permintaan detail diteruskan ke model teks
AI dengan snapshot + tool database. Jika AI belum dikonfigurasi atau gagal,
chatbot tetap menjawab dengan fallback kontekstual. Chatbot hanya memberi
informasi dan tidak dapat mengubah data.

Contoh pertanyaan:

- "Berapa laporan yang sudah saya buat?"
- "Berapa laporan yang sudah diajukan?"
- "Bagaimana cara membuat laporan?"
- "Apa arti status Diajukan?"
- "Cek REP-20261109-1234"
- "Tampilkan semua laporan kategori jalan"
- "Cari laporan dengan kata lampu di alamat Merdeka"
- "Siapa pelapor laporan REP-20261109-1234?"
- "Tampilkan riwayat lengkap REP-20261109-1234"
- "Berapa laporan yang ditangani petugas Ahmad bulan ini?"
- "Siapa saja pengguna terdaftar?"
- "Berapa admin, petugas, dan masyarakat di sistem?"
- "Model AI apa yang sedang dipakai?"
- "Tampilkan skema/tabel database"
- "Cara tautkan WhatsApp"

Pertanyaan jumlah dijawab spesifik sesuai yang ditanyakan: total laporan yang
dibuat, atau jumlah pada status tertentu (diajukan, diverifikasi, ditugaskan,
diproses, selesai, ditolak), tanpa menambahkan rincian yang tidak diminta.

## Unit Testing

Pengujian unit memakai **Vitest** dengan environment **jsdom**. Konfigurasi ada di
[`vitest.config.ts`](vitest.config.ts): alias `@` dipetakan ke `src/`, `setupFiles`
di `src/test/setup.ts`, dan nilai environment placeholder agar modul produksi
(Prisma, enkripsi, OTP) dapat dimuat tanpa menyentuh database sungguhan.

Menjalankan seluruh test satu kali (mode non-watch, dipakai juga oleh CI):

```bash
npm run test:run
```

Menjalankan mode watch saat pengembangan:

```bash
npm test
```

Membuat laporan coverage (provider V8, output teks + HTML ke folder `coverage/`):

```bash
npm run test:coverage
```

> `coverage/` bersifat artefak build dan sudah diabaikan oleh Git.

### Cakupan pengujian

| Berkas test | Fokus |
|---|---|
| `src/test/report-utils.test.ts` | Label status/kategori/prioritas, warna status, format tanggal, `buildReportNumber`, `inferPriority` |
| `src/test/phone.test.ts` | Normalisasi & validasi nomor telepon |
| `src/test/ai-config-crypto.test.ts` | Enkripsi/dekripsi, hash, dan masking API key |
| `src/test/fonnte.test.ts` | Konfigurasi Fonnte, penyusunan permintaan, sanitasi pesan error |
| `src/test/ai-client.test.ts` | `extractJson` (parsing respons model) dan klasifikasi pesan error provider AI (`summarizeProviderError`) |
| `src/test/whatsapp-otp.test.ts` | Hash & verifikasi OTP, termasuk perilaku secret saat modul dimuat |
| `src/test/report-validation.test.ts` | Validasi input laporan: pesan, urutan, dan normalisasi nilai |
| `src/test/api-auth.test.ts` | Helper `requireUser` / `requireRole` |
| `src/test/report-access.test.ts` | Otorisasi akses laporan (`canViewReport`): pemilik, petugas yang ditugaskan, dan admin |
| `src/test/dashboard-colors.test.ts` | Pemetaan warna status pada dashboard |
| `src/test/auth-contracts.test.ts` | Kontrak 401/403 per kelompok route |
| `src/test/reports-route.test.ts` | Kontrak `POST /api/reports`: validasi, default, retry nomor laporan, bentuk respons |

Pengujian tidak memerlukan kredensial produksi maupun layanan eksternal: seluruh
panggilan database, AI, dan WhatsApp di-*mock*, dan environment diisi nilai
placeholder khusus test.

## CI/CD dengan GitHub Actions

Pipeline didefinisikan di [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
dan berjalan otomatis pada setiap `push`, setiap `pull_request`, serta manual
lewat `workflow_dispatch`.

Terdapat empat job independen sehingga kegagalan satu pemeriksaan tidak
menyembunyikan hasil pemeriksaan lain:

| Job | Perintah | Batas waktu |
|---|---|---|
| **Lint** | `npm run lint` | 10 menit |
| **Typecheck** | `npx tsc --noEmit` | 10 menit |
| **Unit Test** | `npm run test:run` | 15 menit |
| **Production Build** | `npm run build` | 20 menit |

Detail konfigurasi:

- Runner `ubuntu-latest`, Node.js **24.x**, cache npm (`actions/setup-node`).
- Dependensi dipasang dengan `npm ci` pada setiap job (reproducible dari `package-lock.json`).
- `permissions: contents: read` — token hanya boleh membaca isi repository.
- `concurrency` membatalkan eksekusi lama pada ref yang sama saat ada push baru.
- Environment CI memakai **placeholder** (`DATABASE_URL` mengarah ke loopback,
  `NEXTAUTH_SECRET` nilai dummy) sehingga build reproducible tanpa `.env` lokal.
  Pipeline tidak terhubung ke database, AI, maupun WhatsApp sungguhan.
- Tidak ada langkah deployment: pipeline hanya memverifikasi kualitas kode.

Lint dianggap lulus selama tidak ada **error**; dua warning yang sudah diketahui
(unused `submit` pada skrip E2E WhatsApp dan pemakaian `<img>` untuk pratinjau
data URL) sengaja dipertahankan.

## Scripts

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Menjalankan server pengembangan |
| `npm run build` | Build produksi |
| `npm run start` | Menjalankan hasil build |
| `npm run lint` | Pemeriksaan ESLint |
| `npm test` | Vitest mode watch |
| `npm run test:run` | Vitest sekali jalan (non-watch) |
| `npm run test:coverage` | Vitest + laporan coverage |
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:check` | Menampilkan jumlah data database |
| `npm run db:studio` | Prisma Studio |
| `node scripts/e2e-whatsapp.cjs` | E2E penautan & notifikasi WhatsApp |

## Verifikasi E2E

Skrip E2E bersifat **manual** dan tidak dijalankan oleh pipeline CI. Jalankan saat
server pengembangan (`npm run dev`) aktif dan `.env` sudah terkonfigurasi.

### Alur masyarakat

```bash
node scripts/e2e-test.cjs
```

### Alur admin & petugas

```bash
node scripts/e2e-phase3.cjs
```

### Konfigurasi AI (enkripsi & masking API key)

```bash
node scripts/e2e-phase4.cjs
```

### Analisis AI

```bash
node scripts/e2e-phase5.cjs
```

### Chatbot in-app

```bash
node scripts/e2e-phase6.cjs
```

### WhatsApp: pengajuan, OTP, perubahan nomor

```bash
node scripts/e2e-whatsapp.cjs
```

Script E2E membuat pengguna/laporan sementara dan membersihkannya kembali.
Konfigurasi AI dan penautan WhatsApp pengguna asli tidak diubah secara permanen.

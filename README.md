# Pelaporan Fasilitas

Aplikasi pelaporan kerusakan fasilitas publik berbasis Next.js 16, Prisma, dan MySQL.

## Fitur

- Autentikasi & peran: **ADMIN**, **PETUGAS**, **MASYARAKAT**
- Laporan masyarakat: buat, foto kondisi, lokasi, riwayat, notifikasi
- Alur kerja admin & petugas: verifikasi, penugasan, proses, selesai, tolak
- Konfigurasi AI (provider, model teks/vision, API key terenkripsi)
- Analisis AI otomatis + manual (kategori, prioritas, relevansi foto, duplikat)
- Chatbot in-app **SiLapor** (tanya jawab kontekstual sesuai peran)
- Notifikasi & chatbot Telegram

## Menjalankan

```bash
npm install
npx prisma generate
npm run dev
```

Buka http://localhost:3000.

## Environment

Salin `.env.example` menjadi `.env`, lalu sesuaikan:

```env
DATABASE_URL="mysql://root:@localhost:3306/pelaporan_fasilitas"
NEXTAUTH_SECRET="string-acak-panjang"
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# AI (opsional, dapat diatur dari Admin > Konfigurasi AI)
NVIDIA_API_KEY=""
AI_CONFIG_ENCRYPTION_KEY=""

# Telegram
TELEGRAM_BOT_TOKEN=""
TELEGRAM_BOT_USERNAME=""
TELEGRAM_WEBHOOK_SECRET=""
```

> **Penting:** database ini berisi data lama. Jangan menjalankan
> `prisma migrate reset` atau `prisma db push` pada database yang sudah terisi.

## Telegram

### Alur penautan dengan verifikasi admin

1. Pengguna mendaftar dengan nomor HP, atau menyimpan/mengubah nomor HP di
   **Pengaturan Telegram**. Sistem otomatis membuat pengajuan penautan.
2. Admin membuka **Admin > Verifikasi Telegram**, petugas membuka
   **Petugas > Verifikasi Telegram**. Pengajuan dapat disetujui atau ditolak
   (alasan penolakan wajib diisi).
3. Setelah disetujui, pengguna membuka **Pengaturan Telegram**, klik
   **Buat Tautan Konfirmasi**, lalu membuka bot Telegram.
4. Di bot, pengguna mengirim `/start <kode>` dan menekan tombol
   **Bagikan Nomor HP**. Kontak harus berasal dari akun Telegram pengguna
   sendiri dan nomornya harus sama dengan nomor HP terdaftar.
5. Koneksi Telegram baru aktif setelah persetujuan admin/petugas dan
   konfirmasi identitas berhasil. Hanya koneksi aktif yang menerima
   notifikasi.

Persetujuan admin tidak otomatis membuktikan kepemilikan akun Telegram.
Mengubah nomor HP akan mencabut koneksi lama dan membuat pengajuan baru.
Riwayat pengajuan tetap disimpan.

> Kode tautan lama dari alur manual sebelumnya tidak lagi dapat mengaktifkan
> koneksi tanpa persetujuan admin. Akun yang sudah aktif sebelum pembaruan ini
> tetap berfungsi dan dapat diakses dari Pengaturan Telegram.

### Pengembangan lokal (tanpa domain publik)

Telegram tidak dapat memanggil `http://localhost`, sehingga webhook tidak bisa
digunakan saat aplikasi berjalan di komputer lokal. Gunakan **mode polling**:

```bash
# terminal 1
npm run dev

# terminal 2
npm run telegram:poll
```

Poller mengambil pesan dari Telegram (`getUpdates`) dan meneruskannya ke route
webhook lokal. Setelah itu lakukan alur penautan di atas. Perintah bot yang
tersedia: `/status`, `/laporan`, `/cek REP-...`, `/lapor`, `/bantuan`.

### Produksi (domain HTTPS publik)

1. Isi `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, dan
   `TELEGRAM_WEBHOOK_SECRET` di `.env`.
2. Set `NEXT_PUBLIC_APP_URL` ke domain HTTPS publik.
3. Restart server, lalu buka **Admin > Bot Telegram** dan klik **Atur Webhook**.
4. Hentikan `npm run telegram:poll` jika sebelumnya digunakan (webhook dan
   polling tidak boleh aktif bersamaan).

### Migrasi database

Perubahan skema Telegram ditambahkan lewat migration additive
`prisma/migrations/20261112000000_telegram_link_request`. Terapkan dengan:

```bash
npx prisma migrate deploy
npx prisma generate
```

Jangan menjalankan `prisma migrate reset` atau `prisma db push` pada database
yang sudah berisi data.

## AI

Atur provider, base URL, model teks/vision, dan API key di
**Admin > Konfigurasi AI**. API key disimpan terenkripsi (AES-256-GCM) dan
hanya ditampilkan dalam bentuk masking. Gunakan tombol **Uji Koneksi** untuk
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
Telegram (jika tertaut) berisi alasan penolakan.

Model teks yang dikonfigurasi juga dipakai oleh chatbot in-app **SiLapor**
untuk pertanyaan yang bersifat terbuka.

## Chatbot SiLapor

Tombol **Tanya SiLapor** tersedia di semua halaman yang sudah login. Chatbot
menjawab sesuai peran dan data pengguna:

- **Masyarakat**: jumlah/status laporan sendiri, cara membuat laporan, arti
  status, prioritas otomatis, notifikasi, dan penautan Telegram.
- **Petugas**: daftar tugas yang ditugaskan, cara memulai/menyelesaikan tugas,
  dan status tugas.
- **Admin**: ringkasan seluruh laporan, alur verifikasi/penugasan, dan
  konfigurasi AI/Telegram.

### Akses database penuh (role-aware)

Saat AI dipakai, SiLapor menerima **snapshot database** dan dapat memanggil tool
`query_database` untuk membaca data yang tidak tercakup di snapshot. Cakupan
akses mengikuti peran:

- **Admin**: seluruh laporan, pengguna, riwayat status, metadata foto, notifikasi,
  konfigurasi AI (API key hanya masking), dan status tautan Telegram.
- **Petugas**: laporan yang ditugaskan kepadanya, riwayat/foto laporan tersebut,
  notifikasi miliknya, dan statistik agregat tanpa data pribadi pengguna lain.
- **Masyarakat**: laporan miliknya, riwayat/foto laporan tersebut, notifikasi
  miliknya, dan statistik agregat tanpa data pribadi pengguna lain.

Data sensitif tidak pernah dibaca atau dikirim ke model: password, API key
mentah, token Telegram mentah, dan isi gambar mentah (hanya metadata/analisis
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
- "Cara tautkan Telegram"

Pertanyaan jumlah dijawab spesifik sesuai yang ditanyakan: total laporan yang
dibuat, atau jumlah pada status tertentu (diajukan, diverifikasi, ditugaskan,
diproses, selesai, ditolak), tanpa menambahkan rincian yang tidak diminta.

Bot Telegram juga menerima pertanyaan bebas (bukan hanya perintah `/...`) dari
akun yang sudah tertaut. Pertanyaan tersebut diproses oleh mesin SiLapor yang
sama, termasuk akses database sesuai peran.

## Scripts

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Menjalankan server pengembangan |
| `npm run build` | Build produksi |
| `npm run start` | Menjalankan hasil build |
| `npm run telegram:poll` | Mode polling Telegram untuk lokal |
| `npm run db:check` | Menampilkan jumlah data database |
| `npm run db:studio` | Prisma Studio |
| `node scripts/e2e-telegram-verification.cjs` | E2E verifikasi penautan Telegram |

## Verifikasi E2E

Jalankan saat server pengembangan aktif:

```bash
node scripts/e2e-test.cjs      # masyarakat
node scripts/e2e-phase3.cjs    # alur admin & petugas
node scripts/e2e-phase5.cjs    # AI & Telegram
node scripts/e2e-phase6.cjs    # chatbot in-app
```

Script E2E membuat pengguna/laporan sementara dan membersihkannya kembali.
Konfigurasi AI dan penautan Telegram pengguna asli tidak diubah secara permanen.

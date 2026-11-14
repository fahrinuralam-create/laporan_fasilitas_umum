# Pelaporan Fasilitas

Aplikasi pelaporan kerusakan fasilitas publik berbasis Next.js 16, Prisma, dan MySQL.

## Fitur

- Autentikasi & peran: **ADMIN**, **PETUGAS**, **MASYARAKAT**
- Laporan masyarakat: buat, foto kondisi, lokasi, riwayat, notifikasi
- Alur kerja admin & petugas: verifikasi, penugasan, proses, selesai, tolak
- Konfigurasi AI (provider, model teks/vision, API key terenkripsi)
- Analisis AI otomatis + manual (kategori, prioritas, relevansi foto, duplikat)
- Chatbot in-app **SiLapor** (tanya jawab kontekstual sesuai peran)
- Notifikasi WhatsApp (Fonnte) & chatbot

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

# WhatsApp (Fonnte)
FONNTE_API_TOKEN=""
FONNTE_API_URL="https://api.fonnte.com/send"
FONNTE_COUNTRY_CODE="62"
WHATSAPP_OTP_SECRET=""
```

> **Penting:** database ini berisi data lama. Jangan menjalankan
> `prisma migrate reset` atau `prisma db push` pada database yang sudah terisi.

## WhatsApp

Notifikasi eksternal dikirim melalui Fonnte (`POST /send`). Token hanya dibaca
di server dan tidak pernah dikirim ke browser.

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

## Scripts

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Menjalankan server pengembangan |
| `npm run build` | Build produksi |
| `npm run start` | Menjalankan hasil build |
| `npm run db:check` | Menampilkan jumlah data database |
| `npm run db:studio` | Prisma Studio |
| `node scripts/e2e-whatsapp.cjs` | E2E penautan & notifikasi WhatsApp |

## Verifikasi E2E

Jalankan saat server pengembangan aktif:

```bash
node scripts/e2e-test.cjs      # masyarakat
node scripts/e2e-phase3.cjs    # alur admin & petugas
node scripts/e2e-phase5.cjs    # AI
node scripts/e2e-phase6.cjs    # chatbot in-app
node scripts/e2e-whatsapp.cjs  # WhatsApp: pengajuan, OTP, perubahan nomor
```

Script E2E membuat pengguna/laporan sementara dan membersihkannya kembali.
Konfigurasi AI dan penautan WhatsApp pengguna asli tidak diubah secara permanen.

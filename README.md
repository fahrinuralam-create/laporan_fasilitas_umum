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
webhook lokal. Setelah itu:

1. Buka `/pengaturan/telegram` dan klik **Buat Kode Tautan**.
2. Kirim perintah `/start <kode>` ke bot Telegram.
3. Klik **Cek Status** — akun akan tertaut.
4. Coba perintah `/status`, `/laporan`, `/cek REP-...`, `/lapor`, `/bantuan`.

### Produksi (domain HTTPS publik)

1. Isi `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, dan
   `TELEGRAM_WEBHOOK_SECRET` di `.env`.
2. Set `NEXT_PUBLIC_APP_URL` ke domain HTTPS publik.
3. Restart server, lalu buka **Admin > Bot Telegram** dan klik **Atur Webhook**.
4. Hentikan `npm run telegram:poll` jika sebelumnya digunakan (webhook dan
   polling tidak boleh aktif bersamaan).

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

Pertanyaan umum dijawab langsung dari database sehingga instan dan akurat.
Pertanyaan terbuka yang berkaitan dengan aplikasi diteruskan ke model teks AI;
jika AI belum dikonfigurasi atau gagal, chatbot tetap menjawab dengan fallback
kontekstual. Chatbot hanya memberi informasi dan tidak dapat mengubah data.

Contoh pertanyaan:

- "Berapa laporan yang sudah saya buat?"
- "Berapa laporan yang sudah diajukan?"
- "Berapa laporan yang sudah diverifikasi?"
- "Bagaimana cara membuat laporan?"
- "Apa arti status Diajukan?"
- "Status laporan terakhir saya?"
- "Cek REP-20261109-1234"
- "Cara tautkan Telegram"

Pertanyaan jumlah dijawab spesifik sesuai yang ditanyakan: total laporan yang
dibuat, atau jumlah pada status tertentu (diajukan, diverifikasi, ditugaskan,
diproses, selesai, ditolak), tanpa menambahkan rincian yang tidak diminta.

## Scripts

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Menjalankan server pengembangan |
| `npm run build` | Build produksi |
| `npm run start` | Menjalankan hasil build |
| `npm run telegram:poll` | Mode polling Telegram untuk lokal |
| `npm run db:check` | Menampilkan jumlah data database |
| `npm run db:studio` | Prisma Studio |

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

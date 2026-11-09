# Pelaporan Fasilitas

Aplikasi pelaporan kerusakan fasilitas publik berbasis Next.js 16, Prisma, dan MySQL.

## Fitur

- Autentikasi & peran: **ADMIN**, **PETUGAS**, **MASYARAKAT**
- Laporan masyarakat: buat, foto kondisi, lokasi, riwayat, notifikasi
- Alur kerja admin & petugas: verifikasi, penugasan, proses, selesai, tolak
- Konfigurasi AI (provider, model teks/vision, API key terenkripsi)
- Analisis AI otomatis + manual (kategori, prioritas, relevansi foto, duplikat)
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

## Scripts

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Menjalankan server pengembangan |
| `npm run build` | Build produksi |
| `npm run start` | Menjalankan hasil build |
| `npm run telegram:poll` | Mode polling Telegram untuk lokal |
| `npm run db:check` | Menampilkan jumlah data database |
| `npm run db:studio` | Prisma Studio |

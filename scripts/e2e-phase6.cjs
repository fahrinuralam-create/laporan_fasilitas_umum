const http = require("http");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const PASSWORD = "E2ePhase6!";
const WARGA = { email: "e2e6-warga@test.local", name: "E2E6 Warga", role: "MASYARAKAT" };
const WARGA2 = { email: "e2e6-warga2@test.local", name: "E2E6 Warga Dua", role: "MASYARAKAT" };
const ADMIN = { email: "e2e6-admin@test.local", name: "E2E6 Admin", role: "ADMIN" };
const PETUGAS = { email: "e2e6-petugas@test.local", name: "E2E6 Petugas", role: "PETUGAS" };

function makeJar() {
  const jar = new Map();
  return {
    store(res) {
      const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
      for (const c of list) {
        const [pair] = c.split(";");
        const idx = pair.indexOf("=");
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (value === "") jar.delete(name);
        else jar.set(name, value);
      }
    },
    header() {
      return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
    },
  };
}

async function login(email) {
  const jar = makeJar();
  let res = await fetch(`${BASE}/api/auth/csrf`);
  jar.store(res);
  const { csrfToken } = await res.json();
  res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: jar.header() },
    body: new URLSearchParams({ csrfToken, email, password: PASSWORD, callbackUrl: `${BASE}/`, json: "true" }),
    redirect: "manual",
  });
  jar.store(res);
  res = await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: jar.header() } });
  const session = await res.json();
  if (!session?.user?.email) throw new Error("Login gagal: " + email);
  return jar;
}

async function api(path, jar, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(jar ? { Cookie: jar.header() } : {}),
      ...(options.headers || {}),
    },
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data, raw: JSON.stringify(data) };
}

async function ask(jar, message) {
  const request = () =>
    api("/api/chatbot", jar, {
      method: "POST",
      body: JSON.stringify({ message }),
    });

  let r = await request();
  // Chatbot dibatasi 30 pertanyaan/menit per pengguna. Jika rangkaian uji
  // melewati batas itu, tunggu jendela rate limit berikutnya.
  if (r.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 61_000));
    r = await request();
  }
  return r;
}

function expectIncludes(value, needle, label) {
  if (!String(value).includes(needle)) {
    throw new Error(`${label}: tidak mengandung "${needle}". Isi: ${String(value).slice(0, 500)}`);
  }
}

async function createReport(jar, title, category, description = "Laporan uji chatbot.") {
  const r = await api("/api/reports", jar, {
    method: "POST",
    body: JSON.stringify({ title, category, description, address: "Jl. Uji Chatbot" }),
  });
  if (r.status !== 201 || !r.data?.id) {
    throw new Error("Gagal membuat laporan uji: " + r.raw);
  }
  return r.data;
}

function startMockChat() {
  const state = { lastPayload: null };
  const server = http.createServer((req, res) => {
    if (req.url.endsWith("/chat/completions")) {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          state.lastPayload = JSON.parse(body || "{}");
        } catch {
          state.lastPayload = null;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "AI_PHASE6_OK: jawaban dari mock chatbot.",
                },
              },
            ],
          })
        );
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end("{}");
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port, state });
    });
  });
}

async function main() {
  const startMs = Date.now();
  const original = await prisma.aiconfiguration.findUnique({ where: { id: "default" } });
  const originalHistory = await prisma.aiconfigurationhistory.findMany({
    select: { id: true, isActive: true },
  });

  const hash = await bcrypt.hash(PASSWORD, 12);
  for (const u of [WARGA, WARGA2, ADMIN, PETUGAS]) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { password: hash, role: u.role },
      create: { name: u.name, email: u.email, password: hash, role: u.role },
    });
  }

  const currentConfig = await prisma.aiconfiguration.findUnique({ where: { id: "default" } });
  if (currentConfig) {
    await prisma.aiconfiguration.update({
      where: { id: "default" },
      data: {
        textApiKey: null,
        visionApiKey: null,
        apiKey: null,
        textBaseUrl: "http://127.0.0.1:1/v1",
        visionBaseUrl: "http://127.0.0.1:1/v1",
      },
    });
  }

  const createdReportIds = [];
  const mock = await startMockChat();
  const mockBase = `http://127.0.0.1:${mock.port}/v1`;

  try {
    // 1. Tanpa login
    let r = await api("/api/chatbot", null, {
      method: "POST",
      body: JSON.stringify({ message: "halo" }),
    });
    if (r.status !== 401) throw new Error("Chatbot tanpa login seharusnya 401, dapat " + r.status);
    console.log("1. otorisasi chatbot: tanpa login ditolak 401");

    // 2. Warga tanpa laporan (fallback)
    const wargaJar = await login(WARGA.email);
    r = await ask(wargaJar, "berapa laporan yang sudah saya buat");
    if (r.status !== 200 || r.data?.source !== "fallback")
      throw new Error("Fallback count gagal: " + r.raw);
    expectIncludes(r.data.reply, "belum membuat laporan", "Count awal");
    console.log("2. fallback: pengguna tanpa laporan dijawab kontekstual");

    // 2b. Pertanyaan identitas: asisten dan pengguna dijawab sesuai konteks
    r = await ask(wargaJar, "siapa anda?");
    expectIncludes(r.data.reply, "SiLapor", "Identitas asisten");
    expectIncludes(r.data.reply, "bukan manusia", "Identitas asisten");

    r = await ask(wargaJar, "kamu siapa");
    expectIncludes(r.data.reply, "SiLapor", "Identitas asisten");

    r = await ask(wargaJar, "siapa saya?");
    expectIncludes(r.data.reply, "E2E6 Warga", "Identitas pengguna");
    expectIncludes(r.data.reply, "Masyarakat", "Identitas pengguna");

    r = await ask(wargaJar, "siapa nama saya");
    expectIncludes(r.data.reply, "E2E6 Warga", "Nama pengguna");

    r = await ask(wargaJar, "anda siapa ya");
    expectIncludes(r.data.reply, "SiLapor", "Identitas asisten");

    r = await ask(wargaJar, "peran saya apa");
    expectIncludes(r.data.reply, "Masyarakat", "Peran pengguna");

    r = await ask(wargaJar, "kategori apa saja yang bisa di laporkan");
    expectIncludes(r.data.reply, "Jalan", "Kategori laporan");
    expectIncludes(r.data.reply, "Lampu Jalan", "Kategori laporan");
    expectIncludes(r.data.reply, "Saluran Air", "Kategori laporan");
    expectIncludes(r.data.reply, "Jembatan", "Kategori laporan");
    expectIncludes(r.data.reply, "Fasilitas Kesehatan", "Kategori laporan");
    expectIncludes(r.data.reply, "Lainnya", "Kategori laporan");

    r = await ask(wargaJar, "apa itu kategori lampu jalan");
    expectIncludes(
      r.data.reply,
      "lampu penerangan jalan",
      "Penjelasan kategori"
    );
    console.log("2b. pertanyaan identitas & kategori dijawab sesuai konteks");

    // 3. Buat laporan
    const report1 = await createReport(wargaJar, "E2E6 Jalan berlubang besar", "JALAN");
    const report2 = await createReport(wargaJar, "E2E6 Lampu jalan mati", "LAMPU_JALAN");
    const report3 = await createReport(wargaJar, "E2E6 Jembatan retak", "JEMBATAN");
    createdReportIds.push(report1.id, report2.id, report3.id);
    console.log("3. tiga laporan uji dibuat");

    // 4. Hitung laporan: cukup jumlah total laporan milik pengguna
    r = await ask(wargaJar, "berapa laporan yang sudah saya buat");
    if (r.status !== 200 || r.data?.source !== "fallback")
      throw new Error("Fallback count laporan gagal: " + r.raw);
    expectIncludes(r.data.reply, "3 laporan", "Count total");
    if (String(r.data.reply).includes("Rincian status"))
      throw new Error("Count total seharusnya hanya menjawab jumlah laporan: " + r.raw);
    console.log("4. jumlah laporan total sesuai data pengguna");

    // 5. Hitung status tertentu (termasuk penulisan terpisah "di ajukan")
    r = await ask(wargaJar, "berapa laporan yang sudah di ajukan");
    expectIncludes(r.data.reply, "status Diajukan: 3", "Count status diajukan");
    r = await ask(wargaJar, "berapa laporan yang sudah di verifikasi");
    expectIncludes(r.data.reply, "status Diverifikasi: 0", "Count status diverifikasi");
    r = await ask(wargaJar, "berapa laporan yang sudah selesai");
    expectIncludes(r.data.reply, "status Selesai: 0", "Count status");
    r = await ask(wargaJar, "berapa laporan yang belum selesai");
    expectIncludes(r.data.reply, "belum selesai: 3", "Count belum selesai");
    r = await ask(wargaJar, "berapa laporan yang belum ditugaskan");
    expectIncludes(r.data.reply, "belum ditugaskan: 3", "Count belum ditugaskan");
    r = await ask(wargaJar, "apakah laporan saya sudah selesai?");
    expectIncludes(r.data.reply, "status Selesai: 0", "Status laporan sendiri");
    console.log("5. pertanyaan jumlah per status & belum selesai dijawab");

    // 6. Cara membuat laporan
    r = await ask(wargaJar, "bagaimana cara membuat laporan");
    expectIncludes(r.data.reply, "Laporan Saya", "Cara buat");
    expectIncludes(r.data.reply, "Kirim Laporan", "Cara buat");
    console.log("6. panduan membuat laporan tersedia");

    // 7. Laporan terakhir
    r = await ask(wargaJar, "status laporan terakhir");
    expectIncludes(r.data.reply, report3.reportNumber, "Laporan terakhir");
    console.log("7. status laporan terakhir menampilkan laporan terbaru");

    // 8. Cek nomor laporan
    r = await ask(wargaJar, `cek ${report3.reportNumber}`);
    expectIncludes(r.data.reply, `Laporan ${report3.reportNumber}`, "Cek laporan");
    expectIncludes(r.data.reply, "Status: Diajukan", "Cek laporan");
    expectIncludes(r.data.reply, "Lokasi: Jl. Uji Chatbot", "Lokasi laporan");
    expectIncludes(r.data.reply, "Foto:", "Info foto");
    console.log("8. pengecekan nomor laporan REP-... berhasil");

    // 9. Arti status
    r = await ask(wargaJar, "apa arti status diajukan");
    expectIncludes(r.data.reply, "menunggu verifikasi", "Arti status");
    console.log("9. arti status laporan dijelaskan");

    // 10. Prioritas
    r = await ask(wargaJar, "bagaimana prioritas laporan ditentukan");
    expectIncludes(r.data.reply, "otomatis", "Prioritas");
    console.log("10. penjelasan prioritas otomatis tersedia");

    // 11. WhatsApp
    r = await ask(wargaJar, "cara tautkan whatsapp");
    expectIncludes(r.data.reply, "Pengaturan WhatsApp", "WhatsApp");
    expectIncludes(r.data.reply, "kode OTP", "WhatsApp");
    console.log("11. panduan tautan WhatsApp tersedia");

    // 12. Notifikasi
    r = await ask(wargaJar, "notifikasi terbaru");
    expectIncludes(r.data.reply, "3 notifikasi", "Notifikasi");
    expectIncludes(r.data.reply, "Notifikasi terbaru:", "Detail notifikasi");
    console.log("12. jumlah dan detail notifikasi terbaru sesuai");

    // 13. Pertanyaan di luar topik
    r = await ask(wargaJar, "resep nasi goreng");
    expectIncludes(r.data.reply, "belum memahami", "Luar topik");
    console.log("13. pertanyaan di luar topik ditolak dengan sopan");

    // 14. Privasi: laporan pengguna lain
    const warga2Jar = await login(WARGA2.email);
    const otherReport = await createReport(warga2Jar, "E2E6 Rahasia pengguna lain", "LAINNYA");
    createdReportIds.push(otherReport.id);
    r = await ask(wargaJar, `cek ${otherReport.reportNumber}`);
    expectIncludes(r.data.reply, "tidak ditemukan atau bukan milik", "Privasi");
    console.log("14. laporan pengguna lain tidak dapat diakses");

    // 15. Admin
    const adminJar = await login(ADMIN.email);
    r = await ask(adminJar, "ringkasan laporan");
    expectIncludes(r.data.reply, "laporan di sistem", "Admin ringkasan");
    expectIncludes(r.data.reply, "Rincian status", "Admin ringkasan");
    r = await ask(adminJar, "cara verifikasi laporan");
    expectIncludes(r.data.reply, "Kelola Laporan", "Admin verifikasi");
    expectIncludes(r.data.reply, "Tugaskan", "Admin verifikasi");
    r = await ask(adminJar, "cara menugaskan petugas");
    expectIncludes(r.data.reply, "Kelola Laporan", "Admin penugasan");
    expectIncludes(r.data.reply, "Tugaskan", "Admin penugasan");
    r = await ask(adminJar, "siapa saya?");
    expectIncludes(r.data.reply, "E2E6 Admin", "Identitas admin");
    expectIncludes(r.data.reply, "Admin", "Peran admin");
    r = await ask(adminJar, "berapa petugas terdaftar");
    expectIncludes(r.data.reply, "Petugas:", "Jumlah petugas");
    r = await ask(adminJar, "berapa laporan kategori jalan");
    expectIncludes(r.data.reply, "kategori Jalan:", "Jumlah per kategori");
    r = await ask(adminJar, "berapa laporan per kategori");
    expectIncludes(r.data.reply, "Rincian kategori", "Rincian kategori");
    r = await ask(adminJar, "berapa laporan hari ini");
    expectIncludes(r.data.reply, "hari ini:", "Jumlah laporan hari ini");
    r = await ask(adminJar, "berapa laporan duplikat");
    expectIncludes(r.data.reply, "duplikat:", "Jumlah laporan duplikat");
    r = await ask(adminJar, "kenapa laporan ditolak");
    if (
      !/Alasan:|Tidak ada laporan berstatus Ditolak/.test(String(r.data.reply))
    ) {
      throw new Error("Alasan penolakan tidak dijawab: " + r.raw);
    }
    r = await ask(adminJar, "beban tugas petugas");
    expectIncludes(r.data.reply, "Beban tugas petugas:", "Beban petugas");
    r = await ask(adminJar, "lokasi laporan terakhir");
    expectIncludes(
      r.data.reply,
      "Lokasi laporan terbaru di sistem",
      "Lokasi laporan"
    );
    expectIncludes(r.data.reply, "Jl. Uji Chatbot", "Alamat laporan");

    // 15b. Variasi pertanyaan status harus konsisten dengan angka dashboard.
    const statusGroups = await prisma.report.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const statusCounts = Object.fromEntries(
      statusGroups.map((group) => [group.status, group._count._all])
    );
    const processedStage =
      (statusCounts.DIVERIFIKASI ?? 0) +
      (statusCounts.DITUGASKAN ?? 0) +
      (statusCounts.DIPROSES ?? 0);
    const notProcessed =
      (statusCounts.DIAJUKAN ?? 0) +
      (statusCounts.DIVERIFIKASI ?? 0) +
      (statusCounts.DITUGASKAN ?? 0);

    r = await ask(adminJar, "berapa laporan yang sudah di proses");
    if (processedStage > 0) {
      expectIncludes(
        r.data.reply,
        `yang sudah diproses: ${processedStage}`,
        "Tahap diproses"
      );
    } else {
      expectIncludes(
        r.data.reply,
        "Tidak ada laporan di sistem yang sudah diproses",
        "Tahap diproses kosong"
      );
    }

    r = await ask(adminJar, "berapa laporan yang dalam proses");
    expectIncludes(
      r.data.reply,
      `status Diproses: ${statusCounts.DIPROSES ?? 0}`,
      "Status diproses spesifik"
    );
    r = await ask(adminJar, "berapa laporan verifikasi");
    expectIncludes(
      r.data.reply,
      `status Diverifikasi: ${statusCounts.DIVERIFIKASI ?? 0}`,
      "Status verifikasi"
    );
    r = await ask(adminJar, "berapa laporan tolak");
    expectIncludes(
      r.data.reply,
      `status Ditolak: ${statusCounts.DITOLAK ?? 0}`,
      "Status tolak"
    );
    r = await ask(adminJar, "berapa laporan yang belum diproses");
    if (notProcessed > 0) {
      expectIncludes(
        r.data.reply,
        `yang belum diproses: ${notProcessed}`,
        "Belum diproses"
      );
    } else {
      expectIncludes(
        r.data.reply,
        "Tidak ada laporan di sistem yang belum diproses",
        "Belum diproses kosong"
      );
    }
    console.log("15b. variasi pertanyaan status sesuai angka dashboard & database");

    const aiConfigPage = await fetch(`${BASE}/admin/ai-config`, {
      headers: { Cookie: adminJar.header() },
      redirect: "manual",
    });
    const aiConfigHtml = await aiConfigPage.text();
    expectIncludes(aiConfigHtml, "Juan Router", "Preset provider Juan Router");
    expectIncludes(
      aiConfigHtml,
      "https://api.juanrouter.com/v1",
      "Base URL Juan Router"
    );
    console.log("15. jawaban admin: ringkasan, verifikasi/penugasan, identitas, jumlah petugas");
    console.log("15c. halaman Konfigurasi AI menampilkan provider Juan Router");

    // 16. Petugas
    const petugasJar = await login(PETUGAS.email);
    r = await ask(petugasJar, "tugas saya");
    expectIncludes(r.data.reply, "belum ada tugas", "Petugas");
    r = await ask(petugasJar, "cara menyelesaikan tugas");
    expectIncludes(r.data.reply, "Tugas Saya", "Petugas");
    expectIncludes(r.data.reply, "Selesaikan", "Petugas");
    r = await ask(petugasJar, "siapa saya?");
    expectIncludes(r.data.reply, "E2E6 Petugas", "Identitas petugas");
    expectIncludes(r.data.reply, "Petugas", "Peran petugas");
    console.log("16. jawaban petugas: daftar tugas, cara menyelesaikan, identitas");

    // 17. Jalur AI dengan mock
    r = await api("/api/admin/ai-config", adminJar, {
      method: "PUT",
      body: JSON.stringify({
        textProvider: "custom",
        textBaseUrl: mockBase,
        textModel: "mock-chat",
        textApiKey: "mock-chat-key-1234",
        visionProvider: "custom",
        visionBaseUrl: mockBase,
        visionModel: "mock-vision",
        visionApiKey: "mock-vision-key-5678",
      }),
    });
    if (r.status !== 200) throw new Error("Gagal set konfigurasi mock: " + r.raw);

    r = await ask(wargaJar, "Berikan saran agar laporan fasilitas cepat ditangani");
    if (r.status !== 200 || r.data?.source !== "ai")
      throw new Error("Jalur AI tidak dipakai: " + r.raw);
    expectIncludes(r.data.reply, "AI_PHASE6_OK", "AI reply");

    const systemPrompt = mock.state.lastPayload?.messages?.[0]?.content || "";
    expectIncludes(systemPrompt, "Total laporan/tugas: 3", "AI context");
    expectIncludes(systemPrompt, "E2E6 Warga", "AI context");
    expectIncludes(systemPrompt, "DATA TERBARU", "AI context");
    expectIncludes(systemPrompt, "SNAPSHOT DATABASE", "AI snapshot database");
    expectIncludes(systemPrompt, "query_database", "AI tool database");
    console.log("17. jalur AI memakai konteks pengguna, snapshot & tool database");

    // 17b. Pertanyaan "kenapa" harus diteruskan ke AI, bukan tertelan daftar laporan
    r = await ask(wargaJar, "Kenapa laporan saya lama diproses?");
    if (r.status !== 200 || r.data?.source !== "ai")
      throw new Error("Pertanyaan advice tidak memakai AI: " + r.raw);
    expectIncludes(r.data.reply, "AI_PHASE6_OK", "AI advice");

    // 17b2. Follow-up singkat memakai riwayat percakapan via AI
    r = await api("/api/chatbot", wargaJar, {
      method: "POST",
      body: JSON.stringify({
        message: "Kenapa?",
        history: [
          { role: "user", content: "berapa laporan saya" },
          { role: "assistant", content: "Anda sudah membuat 3 laporan." },
        ],
      }),
    });
    if (r.status !== 200 || r.data?.source !== "ai")
      throw new Error("Follow-up tidak memakai AI: " + r.raw);
    expectIncludes(r.data.reply, "AI_PHASE6_OK", "AI follow-up");

    // 17b3. Pertanyaan yang meminta seluruh isi database harus memakai AI,
    // bukan ringkasan fallback yang generik.
    r = await ask(wargaJar, "Tampilkan semua laporan saya");
    if (r.status !== 200 || r.data?.source !== "ai")
      throw new Error("Pertanyaan database tidak memakai AI: " + r.raw);
    expectIncludes(r.data.reply, "AI_PHASE6_OK", "AI database");

    // 17c. Pertanyaan di luar topik tidak boleh memanggil AI
    const lastPayloadBeforeOfftopic = mock.state.lastPayload;
    r = await ask(wargaJar, "resep nasi goreng");
    if (r.data?.source !== "fallback")
      throw new Error("Pertanyaan luar topik seharusnya fallback: " + r.raw);
    if (mock.state.lastPayload !== lastPayloadBeforeOfftopic)
      throw new Error("Pertanyaan luar topik tidak boleh memanggil AI");
    console.log("17b. advice memakai AI; pertanyaan luar topik tidak memanggil AI");

    // 18. AI error -> fallback
    await prisma.aiconfiguration.update({
      where: { id: "default" },
      data: { textBaseUrl: "http://127.0.0.1:1/v1" },
    });
    r = await ask(wargaJar, "Berikan saran agar laporan fasilitas cepat ditangani");
    if (r.status !== 200 || r.data?.source !== "fallback")
      throw new Error("Fallback saat AI error gagal: " + r.raw);
    expectIncludes(r.data.reply, "belum memahami", "Fallback AI error");
    console.log("18. AI gagal ditangani dengan fallback, bukan error 500");
  } finally {
    if (original) {
      await prisma.aiconfiguration.update({
        where: { id: "default" },
        data: {
          apiKey: original.apiKey,
          baseUrl: original.baseUrl,
          textModel: original.textModel,
          visionModel: original.visionModel,
          updatedByEmail: original.updatedByEmail,
          textProvider: original.textProvider,
          textBaseUrl: original.textBaseUrl,
          textApiKey: original.textApiKey,
          visionProvider: original.visionProvider,
          visionBaseUrl: original.visionBaseUrl,
          visionApiKey: original.visionApiKey,
          provider: original.provider,
        },
      });
    }

    await prisma.aiconfigurationhistory.deleteMany({
      where: { createdAt: { gte: new Date(startMs) } },
    });
    for (const h of originalHistory) {
      await prisma.aiconfigurationhistory.update({
        where: { id: h.id },
        data: { isActive: h.isActive },
      });
    }

    if (createdReportIds.length > 0) {
      await prisma.report.deleteMany({ where: { id: { in: createdReportIds } } });
    }
    await prisma.user.deleteMany({
      where: { email: { in: [WARGA.email, WARGA2.email, ADMIN.email, PETUGAS.email] } },
    });

    mock.server.close();
    console.log("19. data uji dibersihkan & konfigurasi AI dipulihkan");
  }

  console.log("\nE2E PHASE 6 PASSED");
}

main()
  .catch((e) => {
    console.error("E2E PHASE 6 FAILED:", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

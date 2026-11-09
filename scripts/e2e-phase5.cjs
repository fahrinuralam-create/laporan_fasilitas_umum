const http = require("http");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const PASSWORD = "E2ePhase5!";
const ADMIN = { email: "e2e5-admin@test.local", name: "E2E5 Admin", role: "ADMIN" };
const PETUGAS = { email: "e2e5-petugas@test.local", name: "E2E5 Petugas", role: "PETUGAS" };
const WARGA = { email: "e2e5-warga@test.local", name: "E2E5 Warga", role: "MASYARAKAT" };

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function makeJar() {
  const jar = new Map();
  return {
    store(res) {
      const list =
        typeof res.headers.getSetCookie === "function"
          ? res.headers.getSetCookie()
          : [];
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
      return Array.from(jar.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    },
  };
}

async function login(email) {
  const jar = makeJar();
  let res = await fetch(`${BASE}/api/auth/csrf`);
  jar.store(res);
  const { csrfToken } = await res.json();
  const body = new URLSearchParams({
    csrfToken,
    email,
    password: PASSWORD,
    callbackUrl: `${BASE}/`,
    json: "true",
  });
  res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: jar.header(),
    },
    body,
    redirect: "manual",
  });
  jar.store(res);
  res = await fetch(`${BASE}/api/auth/session`, {
    headers: { Cookie: jar.header() },
  });
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

function startMockAi() {
  const server = http.createServer((req, res) => {
    if (req.url.endsWith("/models")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "mock-text" }, { id: "mock-vision" }] }));
      return;
    }

    if (req.url.endsWith("/chat/completions")) {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        let payload = {};
        try {
          payload = JSON.parse(body || "{}");
        } catch {
          payload = {};
        }
        const serialized = JSON.stringify(payload.messages || []);
        const hasImage = serialized.includes("image_url");
        const content = hasImage
          ? JSON.stringify({
              category: "LAMPU_JALAN",
              priority: "TINGGI",
              confidence: 0.91,
              reason: "Foto menunjukkan lampu penerangan jalan mati.",
              isRelevant: true,
              possibleDamage: "Lampu jalan mati total",
              severity: "SEDANG",
              matchesTitle: true,
            })
          : JSON.stringify({
              category: "LAMPU_JALAN",
              priority: "SEDANG",
              confidence: 0.8,
              reason: "Deskripsi menunjukkan lampu jalan mati.",
              isRelevant: true,
              possibleDamage: "Lampu mati",
              severity: "RINGAN",
              matchesTitle: true,
            });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { content } }] }));
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end("{}");
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, port: address.port });
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function createReport(jar, title, description) {
  const r = await api("/api/reports", jar, {
    method: "POST",
    body: JSON.stringify({
      title,
      description,
      category: "LAMPU_JALAN",
      priority: "SEDANG",
      address: "Jl. Uji Otomatis No. 5",
      latitude: "",
      longitude: "",
      imageDataUrl: TINY_PNG,
    }),
  });
  if (r.status !== 201 || !r.data?.id) {
    throw new Error("Gagal membuat laporan uji: " + r.raw);
  }
  return r.data;
}

async function webhookUpdate(chatId, text, username = "e2e5bot") {
  return api("/api/telegram/webhook", null, {
    method: "POST",
    body: JSON.stringify({
      update_id: Math.floor(Math.random() * 1e9),
      message: {
        message_id: Math.floor(Math.random() * 1e9),
        chat: { id: chatId, type: "private" },
        from: { id: chatId, is_bot: false, first_name: "E2E5", username },
        text,
      },
    }),
  });
}

async function main() {
  const startMs = Date.now();
  const suffix = Math.random().toString(36).slice(2, 10).toUpperCase();
  const title = `E2E5 ${suffix} kerusakan lampu uji`;
  const description = `Laporan uji otomatis phase lima kode ${suffix} untuk validasi analisis dan duplikat.`;

  const original = await prisma.aiconfiguration.findUnique({ where: { id: "default" } });
  const originalHistory = await prisma.aiconfigurationhistory.findMany({
    select: { id: true, isActive: true },
  });

  const mock = await startMockAi();
  const mockBase = `http://127.0.0.1:${mock.port}/v1`;
  console.log("1. mock AI lokal aktif di " + mockBase);

  const hash = await bcrypt.hash(PASSWORD, 12);
  for (const u of [ADMIN, PETUGAS, WARGA]) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { password: hash, role: u.role },
      create: { name: u.name, email: u.email, password: hash, role: u.role },
    });
  }

  const createdReportIds = [];

  try {
    const adminJar = await login(ADMIN.email);
    const wargaJar = await login(WARGA.email);

    // Konfigurasi AI ke mock
    let r = await api("/api/admin/ai-config", adminJar, {
      method: "PUT",
      body: JSON.stringify({
        textProvider: "custom",
        textBaseUrl: mockBase,
        textModel: "mock-text",
        textApiKey: "mock-secret-key-1234",
        visionProvider: "custom",
        visionBaseUrl: mockBase,
        visionModel: "mock-vision",
        visionApiKey: "mock-vision-key-5678",
      }),
    });
    if (r.status !== 200) throw new Error("Gagal set konfigurasi mock: " + r.raw);
    console.log("2. konfigurasi AI diarahkan ke mock");

    // Laporan pertama
    const report1 = await createReport(wargaJar, title, description);
    createdReportIds.push(report1.id);
    if (!report1.notification?.length) throw new Error("Notifikasi awal tidak dibuat");

    // Analisis manual (deterministik)
    r = await api(`/api/admin/reports/${report1.id}/analyze`, adminJar, {
      method: "POST",
    });
    if (r.status !== 200) throw new Error("Analisis AI gagal: " + r.raw);
    if (r.data.analysis?.category !== "LAMPU_JALAN")
      throw new Error("Kategori AI salah: " + r.raw);
    if (r.data.analysis?.priority !== "TINGGI")
      throw new Error("Prioritas AI salah: " + r.raw);
    if (r.data.usedVision !== true)
      throw new Error("Analisis foto seharusnya memakai model vision");
    console.log("3. analisis AI (vision) ok: LAMPU_JALAN / TINGGI / 91%");

    // Cek tersimpan di laporan & gambar
    r = await api(`/api/reports/${report1.id}`, wargaJar);
    if (!r.data.aiAnalyzedAt) throw new Error("aiAnalyzedAt tidak tersimpan");
    if (r.data.aiCategory !== "LAMPU_JALAN") throw new Error("aiCategory salah");
    if (!r.data.reportimage?.[0]?.aiImageAnalyzedAt)
      throw new Error("Analisis gambar tidak tersimpan");
    if (r.data.reportimage[0].aiIsRelevant !== true)
      throw new Error("aiIsRelevant salah");
    console.log("4. field AI laporan & gambar tersimpan ok");

    // Laporan kedua identik -> harus terdeteksi duplikat
    const report2 = await createReport(wargaJar, title, description);
    createdReportIds.push(report2.id);
    r = await api(`/api/admin/reports/${report2.id}/analyze`, adminJar, {
      method: "POST",
    });
    if (r.status !== 200) throw new Error("Analisis laporan 2 gagal: " + r.raw);
    if (!r.data.duplicate || r.data.duplicate.id !== report1.id)
      throw new Error("Duplikat tidak terdeteksi: " + r.raw);

    r = await api(`/api/reports/${report2.id}`, wargaJar);
    if (r.data.aiIsDuplicate !== true) throw new Error("aiIsDuplicate salah");
    if (r.data.aiDuplicateOfId !== report1.id)
      throw new Error("aiDuplicateOfId salah");
    console.log("5. deteksi duplikat ok (menunjuk laporan pertama)");

    // Status Telegram awal
    r = await api("/api/telegram/link", wargaJar);
    if (r.status !== 200 || r.data.linked !== false)
      throw new Error("Status Telegram awal salah: " + r.raw);
    console.log("6. status Telegram awal: belum tertaut");

    // Buat token & tautkan via webhook
    r = await api("/api/telegram/link", wargaJar, { method: "POST" });
    if (r.status !== 200 || !r.data.token || !r.data.command)
      throw new Error("Gagal membuat token Telegram: " + r.raw);
    const token = r.data.token;
    const chatId = 900000000 + Math.floor(Math.random() * 99999999);

    r = await webhookUpdate(chatId, `/start ${token}`);
    if (r.status !== 200) throw new Error("Webhook /start gagal: " + r.raw);

    r = await api("/api/telegram/link", wargaJar);
    if (r.data.linked !== true || r.data.username !== "e2e5bot")
      throw new Error("Tautan Telegram tidak tersimpan: " + r.raw);

    const tokenRow = await prisma.telegramlinktoken.findUnique({
      where: { token },
    });
    if (!tokenRow?.usedAt) throw new Error("Token tidak ditandai terpakai");
    console.log("7. penautan via webhook /start ok (token sekali pakai)");

    // Perintah bot
    for (const command of [
      "/status",
      "/laporan",
      `/cek ${report1.reportNumber}`,
      "/lapor",
      "/bantuan",
    ]) {
      r = await webhookUpdate(chatId, command);
      if (r.status !== 200)
        throw new Error(`Perintah ${command} gagal: ` + r.raw);
    }
    console.log("8. perintah bot /status /laporan /cek /lapor /bantuan ok");

    // Toggle & unlink
    r = await api("/api/telegram/link", wargaJar, {
      method: "PATCH",
      body: JSON.stringify({ enabled: false }),
    });
    if (r.status !== 200 || r.data.enabled !== false)
      throw new Error("Toggle Telegram gagal: " + r.raw);

    r = await api("/api/telegram/link", wargaJar);
    if (r.data.enabled !== false) throw new Error("Enabled tidak berubah");

    r = await api("/api/telegram/link", wargaJar, { method: "DELETE" });
    if (r.status !== 200) throw new Error("Unlink gagal: " + r.raw);

    r = await api("/api/telegram/link", wargaJar);
    if (r.data.linked !== false) throw new Error("Masih tertaut setelah unlink");
    console.log("9. toggle & putus tautan Telegram ok");

    // Admin telegram & otorisasi
    r = await api("/api/admin/telegram", adminJar);
    if (r.status !== 200 || !r.data.counts)
      throw new Error("Status admin Telegram gagal: " + r.raw);
    if (typeof r.data.configured !== "boolean")
      throw new Error("Field configured tidak valid: " + r.raw);
    if (r.data.configured && !r.data.botUsername)
      throw new Error("Bot terkonfigurasi tetapi username tidak tersedia");

    r = await api("/api/admin/telegram", wargaJar);
    if (r.status !== 403)
      throw new Error("Non-admin seharusnya 403, dapat " + r.status);
    console.log("10. status admin Telegram & otorisasi ok");

    // Alur verifikasi + penugasan tetap berjalan & notifikasi petugas dibuat
    const petugas = await prisma.user.findUnique({
      where: { email: PETUGAS.email },
      select: { id: true },
    });

    r = await api(`/api/admin/reports/${report1.id}/action`, adminJar, {
      method: "POST",
      body: JSON.stringify({ action: "verify" }),
    });
    if (r.status !== 200) throw new Error("Verifikasi gagal: " + r.raw);

    r = await api(`/api/admin/reports/${report1.id}/action`, adminJar, {
      method: "POST",
      body: JSON.stringify({ action: "assign", officerId: petugas.id }),
    });
    if (r.status !== 200) throw new Error("Penugasan gagal: " + r.raw);

    const officerNotification = await prisma.notification.findFirst({
      where: {
        userId: petugas.id,
        reportId: report1.id,
        title: "Tugas Baru",
      },
    });
    if (!officerNotification)
      throw new Error("Notifikasi petugas tidak dibuat saat penugasan");
    console.log("11. alur verifikasi/penugasan & notifikasi petugas ok");

    await sleep(1200);
  } finally {
    // Pulihkan konfigurasi AI asli
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

    // Hapus laporan uji (cascade gambar/riwayat/notifikasi), lalu user uji
    if (createdReportIds.length > 0) {
      await prisma.report.deleteMany({
        where: { id: { in: createdReportIds } },
      });
    }
    await prisma.user.deleteMany({
      where: { email: { in: [ADMIN.email, PETUGAS.email, WARGA.email] } },
    });

    mock.server.close();
    console.log("12. data uji dibersihkan & konfigurasi AI dipulihkan");
  }

  console.log("\nE2E PHASE 5 PASSED");
}

main()
  .catch((e) => {
    console.error("E2E PHASE 5 FAILED:", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

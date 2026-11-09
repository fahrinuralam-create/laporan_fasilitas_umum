const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const PASSWORD = "E2ePhase4!";
const ADMIN = { email: "e2e4-admin@test.local", name: "E2E4 Admin", role: "ADMIN" };
const WARGA = { email: "e2e4-warga@test.local", name: "E2E4 Warga", role: "MASYARAKAT" };
const SECRET_TEXT = "sk-phase4-secret-ABCD";
const SECRET_VISION = "vision-secret-WXYZ";

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

async function main() {
  const startMs = Date.now();

  // Snapshot konfigurasi & riwayat asli
  const original = await prisma.aiconfiguration.findUnique({
    where: { id: "default" },
  });
  const originalHistory = await prisma.aiconfigurationhistory.findMany({
    select: { id: true, isActive: true },
  });
  console.log("1. snapshot konfigurasi asli diambil");

  const hash = await bcrypt.hash(PASSWORD, 12);
  for (const u of [ADMIN, WARGA]) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { password: hash, role: u.role },
      create: { name: u.name, email: u.email, password: hash, role: u.role },
    });
  }

  try {
    // Tanpa login -> 401
    let r = await api("/api/admin/ai-config", null);
    if (r.status !== 401) throw new Error("Tanpa login seharusnya 401, dapat " + r.status);
    console.log("2. otorisasi 401 tanpa login ok");

    const wargaJar = await login(WARGA.email);
    r = await api("/api/admin/ai-config", wargaJar);
    if (r.status !== 403) throw new Error("Masyarakat seharusnya 403, dapat " + r.status);
    console.log("3. otorisasi 403 untuk non-admin ok");

    const adminJar = await login(ADMIN.email);
    r = await api("/api/admin/ai-config", adminJar);
    if (r.status !== 200 || !r.data.text || !r.data.vision)
      throw new Error("GET config gagal: " + r.raw);
    console.log("4. GET konfigurasi ok (masked)");

    // PUT konfigurasi dengan key rahasia
    r = await api("/api/admin/ai-config", adminJar, {
      method: "PUT",
      body: JSON.stringify({
        textProvider: "openai",
        textBaseUrl: "http://127.0.0.1:9/v1",
        textModel: "test-text-model",
        textApiKey: SECRET_TEXT,
        visionProvider: "openai",
        visionBaseUrl: "http://127.0.0.1:9/v1",
        visionModel: "test-vision-model",
        visionApiKey: SECRET_VISION,
      }),
    });
    if (r.status !== 200) throw new Error("PUT config gagal: " + r.raw);
    if (r.raw.includes(SECRET_TEXT) || r.raw.includes(SECRET_VISION))
      throw new Error("Respon membocorkan API key!");
    console.log("5. PUT konfigurasi ok, API key tidak bocor di respons");

    // GET ulang cek masking & source
    r = await api("/api/admin/ai-config", adminJar);
    if (!r.data.text.hasKey || r.data.text.keySource !== "db")
      throw new Error("Key teks tidak tersimpan di DB");
    if (!r.data.text.maskedKey || !r.data.text.maskedKey.endsWith("ABCD"))
      throw new Error("Masking key teks salah: " + r.data.text.maskedKey);
    if (!r.data.vision.maskedKey || !r.data.vision.maskedKey.endsWith("WXYZ"))
      throw new Error("Masking key vision salah: " + r.data.vision.maskedKey);
    if (r.raw.includes(SECRET_TEXT)) throw new Error("Key bocor di GET");
    console.log("6. masking & sumber key ok (db, ••••ABCD / ••••WXYZ)");

    // Cek enkripsi di database
    const row = await prisma.aiconfiguration.findUnique({ where: { id: "default" } });
    if (!row.textApiKey || !row.textApiKey.startsWith("enc:v1:"))
      throw new Error("API key tidak terenkripsi di DB: " + row.textApiKey);
    if (row.textApiKey.includes(SECRET_TEXT))
      throw new Error("API key tersimpan sebagai plaintext!");
    console.log("7. enkripsi DB ok (enc:v1:, tanpa plaintext)");

    // Riwayat
    r = await api("/api/admin/ai-config/history", adminJar);
    if (r.status !== 200 || !Array.isArray(r.data.history) || r.data.history.length === 0)
      throw new Error("Riwayat kosong: " + r.raw);
    const active = r.data.history.find((h) => h.isActive);
    if (!active || active.textKeySource !== "db" || !active.textKeyFingerprint)
      throw new Error("Riwayat aktif tidak lengkap");
    if (r.raw.includes(SECRET_TEXT) || r.raw.includes(SECRET_VISION))
      throw new Error("Riwayat membocorkan key!");
    console.log("8. riwayat ok (fingerprint, isActive, tanpa key asli)");

    // Uji koneksi ke URL tak terjangkau -> ok:false, tidak crash
    r = await api("/api/admin/ai-config/test", adminJar, {
      method: "POST",
      body: JSON.stringify({ target: "text" }),
    });
    if (r.status !== 200 || r.data.ok !== false)
      throw new Error("Uji koneksi seharusnya melaporkan gagal dengan tenang: " + r.raw);
    console.log("9. uji koneksi ok (gagal terhubung dilaporkan dengan benar)");

    // Diagnostik
    r = await api("/api/admin/ai-config/diagnostics", adminJar);
    if (r.status !== 200 || !Array.isArray(r.data.checks) || r.data.checks.length === 0)
      throw new Error("Diagnostik gagal: " + r.raw);
    console.log("10. diagnostik ok (" + r.data.checks.length + " pemeriksaan)");
  } finally {
    // Pulihkan konfigurasi asli
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

    // Hapus riwayat yang dibuat selama uji, pulihkan flag isActive asli
    await prisma.aiconfigurationhistory.deleteMany({
      where: { createdAt: { gte: new Date(startMs) } },
    });
    for (const h of originalHistory) {
      await prisma.aiconfigurationhistory.update({
        where: { id: h.id },
        data: { isActive: h.isActive },
      });
    }

    await prisma.user.deleteMany({
      where: { email: { in: [ADMIN.email, WARGA.email] } },
    });
    console.log("11. konfigurasi & riwayat asli dipulihkan, user uji dihapus");
  }

  console.log("\nE2E PHASE 4 PASSED");
}

main()
  .catch((e) => {
    console.error("E2E PHASE 4 FAILED:", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

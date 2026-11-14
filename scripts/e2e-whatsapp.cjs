/**
 * E2E WhatsApp (Fonnte) — pengajuan nomor, persetujuan admin,
 * verifikasi OTP, perubahan nomor, dan pengiriman notifikasi.
 *
 * Script ini menjalankan mock server Fonnte dan (opsional) server Next.js
 * sendiri dengan FONNTE_API_URL diarahkan ke mock, sehingga TIDAK mengirim
 * pesan WhatsApp sungguhan.
 *
 * Jalankan:
 *   npm run build
 *   node scripts/e2e-whatsapp.cjs
 *
 * Jika ingin memakai server yang sudah berjalan:
 *   E2E_BASE_URL=http://localhost:3000 node scripts/e2e-whatsapp.cjs
 * (server tersebut harus memakai FONNTE_API_URL ke mock pada port yang
 *  dicetak script, atau set E2E_FONNTE_MOCK_PORT).
 */
const http = require("http");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const ROOT = path.resolve(__dirname, "..");
const PASSWORD = "E2eWhatsApp!1";
const APP_PORT = Number(process.env.E2E_PORT || 3105);
const MOCK_PORT = Number(process.env.E2E_FONNTE_MOCK_PORT || 0);
const BASE = process.env.E2E_BASE_URL || `http://127.0.0.1:${APP_PORT}`;
const USE_EXTERNAL_SERVER = Boolean(process.env.E2E_BASE_URL);

const USERS = {
  admin: { email: "e2e-wa-admin@test.local", name: "E2E WA Admin", role: "ADMIN" },
  petugas: { email: "e2e-wa-petugas@test.local", name: "E2E WA Petugas", role: "PETUGAS" },
  warga1: { email: "e2e-wa-warga1@test.local", name: "E2E WA Warga Satu", role: "MASYARAKAT" },
  warga2: { email: "e2e-wa-warga2@test.local", name: "E2E WA Warga Dua", role: "MASYARAKAT" },
  warga3: { email: "e2e-wa-warga3@test.local", name: "E2E WA Warga Tiga", role: "MASYARAKAT" },
};

let appProcess = null;
let mockServer = null;
const mockState = {
  port: 0,
  sends: [],
  failMode: false,
  failReason: "mock Fonnte failure",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectStatus(result, expected, label) {
  if (result.status !== expected) {
    throw new Error(
      `${label}: status ${result.status}, diharapkan ${expected}. Isi: ${result.raw}`
    );
  }
}

function expectIncludes(value, needle, label) {
  if (!String(value).includes(needle)) {
    throw new Error(
      `${label}: tidak mengandung "${needle}". Isi: ${String(value).slice(0, 500)}`
    );
  }
}

function nextPhone(seed) {
  // Nomor seluler Indonesia valid: 08 + 10 digit.
  const digits = String(seed).replace(/\D/g, "").slice(-10).padStart(10, "0");
  return `08${digits}`;
}

function normalizeTarget(value) {
  let digits = String(value || "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  return digits;
}

function makeJar() {
  const jar = new Map();
  return {
    store(res) {
      const list =
        typeof res.headers.getSetCookie === "function"
          ? res.headers.getSetCookie()
          : [];
      for (const cookie of list) {
        const [pair] = cookie.split(";");
        const idx = pair.indexOf("=");
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (value === "") jar.delete(name);
        else jar.set(name, value);
      }
    },
    header() {
      return Array.from(jar.entries())
        .map(([key, value]) => `${key}=${value}`)
        .join("; ");
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
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: jar.header(),
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password: PASSWORD,
      callbackUrl: `${BASE}/`,
      json: "true",
    }),
    redirect: "manual",
  });
  jar.store(res);
  res = await fetch(`${BASE}/api/auth/session`, {
    headers: { Cookie: jar.header() },
  });
  const session = await res.json();
  if (!session?.user?.email) throw new Error(`Login gagal: ${email}`);
  return jar;
}

async function api(pathname, jar, options = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
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

function startMockFonnte() {
  return new Promise((resolve, reject) => {
    mockServer = http.createServer((req, res) => {
      if (!req.url?.startsWith("/send") || req.method !== "POST") {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: false, reason: "not found" }));
        return;
      }
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const params = new URLSearchParams(body);
        const record = {
          target: params.get("target") || "",
          message: params.get("message") || "",
          countryCode: params.get("countryCode") || "",
          authorization: req.headers.authorization || "",
          at: new Date().toISOString(),
        };
        mockState.sends.push(record);

        if (mockState.failMode) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ status: false, reason: mockState.failReason })
          );
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: true,
            id: [`mock-${mockState.sends.length}`],
          })
        );
      });
    });
    mockServer.once("error", reject);
    mockServer.listen(MOCK_PORT, "127.0.0.1", () => {
      mockState.port = mockServer.address().port;
      resolve(mockState.port);
    });
  });
}

async function waitForApp(timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/auth/csrf`);
      if (res.ok) return;
    } catch {
      // server belum siap
    }
    await sleep(500);
  }
  throw new Error(`Server tidak siap di ${BASE}`);
}

async function waitUntil(fn, label, timeoutMs = 20_000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await fn();
    if (last) return last;
    await sleep(250);
  }
  throw new Error(`Timeout menunggu ${label}. Nilai terakhir: ${JSON.stringify(last)}`);
}

function extractOtp(message) {
  const match = String(message || "").match(/\b(\d{6})\b/);
  return match ? match[1] : null;
}

function sendsTo(phone, sinceIndex = 0) {
  const target = normalizeTarget(phone);
  return mockState.sends
    .slice(sinceIndex)
    .filter((item) => item.target === target);
}

async function createReport(jar, suffix, label) {
  const result = await api("/api/reports", jar, {
    method: "POST",
    body: JSON.stringify({
      title: `E2E WhatsApp ${label} ${suffix}`,
      description: `Laporan uji notifikasi WhatsApp ${label} ${suffix}.`,
      category: "LAMPU_JALAN",
      address: `Jl. Uji WhatsApp E2E ${label} ${suffix}`,
    }),
  });
  if (result.status !== 201 || !result.data?.id) {
    throw new Error(`Gagal membuat laporan ${label}: ${result.raw}`);
  }
  return result.data;
}

async function submit(phone) {
  return prisma.whatsapplinkrequest.findFirst({
    where: { status: "PENDING_ADMIN", phoneNormalized: normalizeTarget(phone) },
    orderBy: { createdAt: "desc" },
  });
}

async function cleanup(createdReportIds, userIds) {
  if (createdReportIds.length > 0) {
    await prisma.report.deleteMany({ where: { id: { in: createdReportIds } } });
  }
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.user.deleteMany({
    where: { email: { in: Object.values(USERS).map((user) => user.email) } },
  });
}

async function main() {
  const startedAt = Date.now();
  const suffix = String(startedAt).slice(-7);
  const phoneA = nextPhone(`${suffix}11`);
  const phoneB = nextPhone(`${suffix}22`);
  const phoneC = nextPhone(`${suffix}33`);
  const phoneD = nextPhone(`${suffix}44`);
  const phoneE = nextPhone(`${suffix}55`);
  const phoneF = nextPhone(`${suffix}66`);
  const createdReportIds = [];
  const userIds = [];

  const mockPort = await startMockFonnte();
  console.log(`Mock Fonnte aktif di http://127.0.0.1:${mockPort}/send`);

  if (!USE_EXTERNAL_SERVER) {
    const nextBin = require.resolve("next/dist/bin/next");
    appProcess = spawn(process.execPath, [nextBin, "start", "-p", String(APP_PORT)], {
      cwd: ROOT,
      env: {
        ...process.env,
        FONNTE_API_URL: `http://127.0.0.1:${mockPort}/send`,
        FONNTE_API_TOKEN: "e2e-fonnte-token",
        FONNTE_COUNTRY_CODE: "62",
        FONNTE_TIMEOUT_MS: "3000",
        NEXT_PUBLIC_APP_URL: BASE,
        NEXTAUTH_URL: BASE,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    appProcess.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      if (/error/i.test(text)) process.stderr.write(`[next] ${text}`);
    });
    appProcess.stderr.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));
  }

  await waitForApp();

  // Siapkan pengguna uji.
  const hash = await bcrypt.hash(PASSWORD, 10);
  const users = {};
  for (const [key, data] of Object.entries(USERS)) {
    const user = await prisma.user.upsert({
      where: { email: data.email },
      update: {
        name: data.name,
        password: hash,
        role: data.role,
        phone: null,
        phoneNormalized: null,
        whatsappNumber: null,
        whatsappVerifiedAt: null,
        whatsappLinkedAt: null,
        whatsappEnabled: true,
      },
      create: {
        name: data.name,
        email: data.email,
        password: hash,
        role: data.role,
      },
    });
    users[key] = user;
    userIds.push(user.id);
  }

  const adminJar = await login(USERS.admin.email);
  const petugasJar = await login(USERS.petugas.email);
  const warga1Jar = await login(USERS.warga1.email);
  const warga2Jar = await login(USERS.warga2.email);
  const warga3Jar = await login(USERS.warga3.email);

  console.log("1. pengguna uji & sesi login siap");

  const config = await api("/api/admin/whatsapp", adminJar);
  expectStatus(config, 200, "Konfigurasi admin WhatsApp");
  assert(
    config.data.env.apiUrl.includes(`127.0.0.1:${mockPort}`),
    `Server tidak memakai mock Fonnte (${config.data.env.apiUrl}). Jalankan tanpa E2E_BASE_URL atau arahkan FONNTE_API_URL ke mock.`
  );
  console.log("2. konfigurasi Fonnte terhubung ke mock & token tidak diekspos");

  // ---------------------------------------------------------------------
  // Otorisasi & validasi
  // ---------------------------------------------------------------------
  let r = await api("/api/whatsapp/request", null, {
    method: "POST",
    body: JSON.stringify({ phone: phoneA }),
  });
  expectStatus(r, 401, "Pengajuan tanpa login");

  r = await api("/api/whatsapp/request", warga1Jar, {
    method: "POST",
    body: JSON.stringify({ phone: "abc" }),
  });
  expectStatus(r, 400, "Nomor tidak valid");

  // ---------------------------------------------------------------------
  // Pengajuan -> PENDING_ADMIN
  // ---------------------------------------------------------------------
  r = await api("/api/whatsapp/request", warga1Jar, {
    method: "POST",
    body: JSON.stringify({ phone: phoneA }),
  });
  expectStatus(r, 200, "Pengajuan nomor");
  assert(
    r.data.request?.status === "PENDING_ADMIN",
    `Status awal bukan PENDING_ADMIN: ${r.raw}`
  );
  const requestA = r.data.request.id;
  console.log("3. pengajuan nomor membuat status PENDING_ADMIN");

  r = await api("/api/whatsapp/request", warga1Jar, {
    method: "POST",
    body: JSON.stringify({ phone: phoneA }),
  });
  expectStatus(r, 200, "Pengajuan duplikat");
  assert(
    r.data.changed === false && r.data.request?.id === requestA,
    `Pengajuan ganda tidak boleh membuat baris baru: ${r.raw}`
  );
  const pendingCount = await prisma.whatsapplinkrequest.count({
    where: { userId: users.warga1.id, status: "PENDING_ADMIN" },
  });
  assert(pendingCount === 1, `Jumlah pengajuan PENDING_ADMIN harus 1, dapat ${pendingCount}`);
  console.log("4. pengajuan ganda tidak menduplikasi request");

  r = await api("/api/whatsapp/request", warga2Jar, {
    method: "POST",
    body: JSON.stringify({ phone: phoneA }),
  });
  expectStatus(r, 409, "Nomor dipakai akun lain");
  console.log("5. nomor yang sudah dipakai akun lain ditolak");

  r = await api("/api/whatsapp/verification", warga2Jar);
  expectStatus(r, 403, "Akses verifikasi masyarakat");
  r = await api("/api/whatsapp/verification", petugasJar);
  expectStatus(r, 403, "Akses verifikasi petugas");
  r = await api(`/api/whatsapp/verification/${requestA}`, petugasJar, {
    method: "POST",
    body: JSON.stringify({ action: "approve" }),
  });
  expectStatus(r, 403, "Persetujuan oleh petugas");
  r = await api("/api/whatsapp/verification", adminJar);
  expectStatus(r, 200, "Akses verifikasi admin");
  assert(
    r.data.requests.some((item) => item.id === requestA),
    "Pengajuan tidak muncul di daftar verifikasi"
  );
  console.log("6. verifikasi hanya untuk admin; petugas ditolak 403");

  // ---------------------------------------------------------------------
  // Penolakan
  // ---------------------------------------------------------------------
  r = await api(`/api/whatsapp/verification/${requestA}`, adminJar, {
    method: "POST",
    body: JSON.stringify({ action: "reject", reason: "" }),
  });
  expectStatus(r, 400, "Tolak tanpa alasan");
  r = await api(`/api/whatsapp/verification/${requestA}`, adminJar, {
    method: "POST",
    body: JSON.stringify({ action: "reject", reason: "Nomor tidak dapat diverifikasi" }),
  });
  expectStatus(r, 200, "Tolak dengan alasan");
  assert(r.data.request?.status === "REJECTED", `Status harus REJECTED: ${r.raw}`);
  console.log("7. penolakan wajib alasan & status menjadi REJECTED");

  // Ajukan ulang nomor yang sama setelah ditolak.
  r = await api("/api/whatsapp/request", warga1Jar, {
    method: "POST",
    body: JSON.stringify({ phone: phoneA }),
  });
  expectStatus(r, 200, "Pengajuan ulang setelah ditolak");
  assert(
    r.data.request?.status === "PENDING_ADMIN",
    `Pengajuan ulang harus PENDING_ADMIN: ${r.raw}`
  );
  const requestA2 = r.data.request.id;
  console.log("8. pengajuan ulang setelah penolakan berhasil");

  // ---------------------------------------------------------------------
  // Self review
  // ---------------------------------------------------------------------
  const selfRequest = await prisma.whatsapplinkrequest.create({
    data: {
      userId: users.admin.id,
      phone: phoneF,
      phoneNormalized: normalizeTarget(phoneF),
      requestType: "INITIAL",
      status: "PENDING_ADMIN",
    },
  });
  r = await api(`/api/whatsapp/verification/${selfRequest.id}`, adminJar, {
    method: "POST",
    body: JSON.stringify({ action: "approve" }),
  });
  expectStatus(r, 409, "Self review");
  await prisma.whatsapplinkrequest.delete({ where: { id: selfRequest.id } });
  console.log("9. admin tidak dapat menyetujui pengajuan sendiri");

  // ---------------------------------------------------------------------
  // Persetujuan + OTP
  // ---------------------------------------------------------------------
  const sendsBeforeApprove = mockState.sends.length;
  r = await api(`/api/whatsapp/verification/${requestA2}`, adminJar, {
    method: "POST",
    body: JSON.stringify({ action: "approve" }),
  });
  expectStatus(r, 200, "Persetujuan admin");
  assert(r.data.request?.status === "PENDING_VERIFICATION", `Status harus PENDING_VERIFICATION: ${r.raw}`);
  assert(r.data.otpSent === true, `OTP harus terkirim: ${r.raw}`);
  const otpSend = sendsTo(phoneA, sendsBeforeApprove)[0];
  assert(otpSend, "Mock Fonnte tidak menerima OTP");
  const otpA = extractOtp(otpSend.message);
  assert(otpA, "Pesan OTP tidak berisi 6 digit");
  const dbRequestA2 = await prisma.whatsapplinkrequest.findUnique({ where: { id: requestA2 } });
  assert(dbRequestA2.otpHash && dbRequestA2.otpHash.length === 64, "otpHash harus 64 hex");
  assert(dbRequestA2.otpHash !== otpA, "OTP tidak boleh disimpan mentah");
  assert(dbRequestA2.otpExpiresAt && dbRequestA2.otpExpiresAt > new Date(), "OTP harus memiliki masa berlaku");
  assert(!otpSend.message.includes("e2e-fonnte-token"), "Token tidak boleh muncul di pesan");
  console.log("10. persetujuan mengirim OTP; hash tersimpan, bukan kode mentah");

  // ---------------------------------------------------------------------
  // OTP salah, batas percobaan
  // ---------------------------------------------------------------------
  r = await api("/api/whatsapp/verify", warga1Jar, {
    method: "POST",
    body: JSON.stringify({ code: otpA === "000000" ? "111111" : "000000" }),
  });
  expectStatus(r, 400, "OTP salah");
  assert(r.data.remainingAttempts === 4, `Sisa percobaan harus 4: ${r.raw}`);
  console.log("11. OTP salah menambah percobaan & mengembalikan sisa");

  // ---------------------------------------------------------------------
  // Verifikasi OTP benar
  // ---------------------------------------------------------------------
  r = await api("/api/whatsapp/verify", warga1Jar, {
    method: "POST",
    body: JSON.stringify({ code: otpA }),
  });
  expectStatus(r, 200, "Verifikasi OTP benar");
  assert(r.data.linked === true, `Nomor harus tertaut: ${r.raw}`);
  const warga1After = await prisma.user.findUnique({ where: { id: users.warga1.id } });
  assert(
    warga1After.whatsappNumber === normalizeTarget(phoneA) && warga1After.whatsappVerifiedAt,
    "Nomor terverifikasi tidak tersimpan pada user"
  );
  console.log("12. OTP benar mengaktifkan nomor & menyimpan status terverifikasi");

  r = await api("/api/whatsapp/verify", warga1Jar, {
    method: "POST",
    body: JSON.stringify({ code: otpA }),
  });
  expectStatus(r, 400, "OTP dipakai ulang");
  console.log("13. OTP bersifat satu kali pakai");

  // ---------------------------------------------------------------------
  // Notifikasi: hanya nomor terverifikasi & aktif
  // ---------------------------------------------------------------------
  const sendsBeforeUnlinked = mockState.sends.length;
  const reportUnlinked = await createReport(warga2Jar, suffix, "unlinked");
  createdReportIds.push(reportUnlinked.id);
  await sleep(1200);
  const unlinkedNotification = await prisma.notification.findFirst({
    where: { reportId: reportUnlinked.id, title: "Laporan Berhasil Dibuat" },
  });
  assert(unlinkedNotification && unlinkedNotification.whatsappSent === false, "Pengguna tanpa nomor tidak boleh menerima WhatsApp");
  assert(
    sendsTo(phoneA, sendsBeforeUnlinked).length === 0,
    "Tidak boleh ada pengiriman ke nomor pengguna lain"
  );
  console.log("14. pengguna tanpa nomor terverifikasi tidak menerima WhatsApp");

  const sendsBeforeLinkedNotif = mockState.sends.length;
  const reportLinked = await createReport(warga1Jar, suffix, "linked");
  createdReportIds.push(reportLinked.id);
  const linkedNotification = await waitUntil(async () => {
    const row = await prisma.notification.findFirst({
      where: { reportId: reportLinked.id, title: "Laporan Berhasil Dibuat" },
    });
    return row?.whatsappSent ? row : null;
  }, "notifikasi WhatsApp terkirim");
  assert(linkedNotification.whatsappMessageId, "Message ID Fonnte tidak disimpan");
  assert(
    sendsTo(phoneA, sendsBeforeLinkedNotif).length === 1,
    "Harus ada tepat satu pengiriman ke nomor terverifikasi"
  );
  console.log("15. nomor terverifikasi menerima notifikasi WhatsApp & status tersimpan");

  r = await api("/api/whatsapp/status", warga1Jar, {
    method: "PATCH",
    body: JSON.stringify({ enabled: false }),
  });
  expectStatus(r, 200, "Nonaktifkan notifikasi");
  const sendsBeforeDisabled = mockState.sends.length;
  const reportDisabled = await createReport(warga1Jar, suffix, "disabled");
  createdReportIds.push(reportDisabled.id);
  await sleep(1200);
  const disabledNotification = await prisma.notification.findFirst({
    where: { reportId: reportDisabled.id, title: "Laporan Berhasil Dibuat" },
  });
  assert(disabledNotification && disabledNotification.whatsappSent === false, "Notifikasi nonaktif tidak boleh dikirim");
  assert(
    sendsTo(phoneA, sendsBeforeDisabled).length === 0,
    "Tidak boleh ada pengiriman saat notifikasi dinonaktifkan"
  );
  r = await api("/api/whatsapp/status", warga1Jar, {
    method: "PATCH",
    body: JSON.stringify({ enabled: true }),
  });
  expectStatus(r, 200, "Aktifkan notifikasi kembali");
  console.log("16. notifikasi tidak dikirim saat kanal dinonaktifkan");

  // ---------------------------------------------------------------------
  // Perubahan nomor: nomor lama tetap aktif sampai nomor baru terverifikasi
  // ---------------------------------------------------------------------
  r = await api("/api/whatsapp/request", warga1Jar, {
    method: "POST",
    body: JSON.stringify({ phone: phoneB }),
  });
  expectStatus(r, 200, "Pengajuan perubahan nomor");
  assert(r.data.linked === true, `Nomor lama harus tetap tertaut saat pengajuan: ${r.raw}`);
  assert(
    r.data.number === normalizeTarget(phoneA),
    `Nomor aktif harus tetap nomor lama: ${r.raw}`
  );
  const requestB = r.data.request.id;
  const activeOld = await prisma.whatsapplinkrequest.findFirst({
    where: { userId: users.warga1.id, status: "ACTIVE" },
  });
  assert(activeOld && activeOld.phoneNormalized === normalizeTarget(phoneA), "Request lama harus tetap ACTIVE");
  console.log("17. pengajuan perubahan nomor tidak mencabut nomor lama");

  const sendsBeforeB = mockState.sends.length;
  r = await api(`/api/whatsapp/verification/${requestB}`, adminJar, {
    method: "POST",
    body: JSON.stringify({ action: "approve" }),
  });
  expectStatus(r, 200, "Persetujuan perubahan nomor");
  const otpB = extractOtp(sendsTo(phoneB, sendsBeforeB)[0]?.message || "");
  assert(otpB, "OTP nomor baru tidak diterima mock");
  const warga1DuringChange = await prisma.user.findUnique({ where: { id: users.warga1.id } });
  assert(
    warga1DuringChange.whatsappNumber === normalizeTarget(phoneA),
    "Nomor lama tidak boleh berubah sebelum OTP baru terverifikasi"
  );
  console.log("18. persetujuan nomor baru belum mengubah nomor aktif");

  r = await api("/api/whatsapp/verify", warga1Jar, {
    method: "POST",
    body: JSON.stringify({ code: otpB }),
  });
  expectStatus(r, 200, "Verifikasi nomor baru");
  const warga1Changed = await prisma.user.findUnique({ where: { id: users.warga1.id } });
  assert(
    warga1Changed.whatsappNumber === normalizeTarget(phoneB),
    "Nomor baru harus aktif setelah verifikasi"
  );
  const oldRevoked = await prisma.whatsapplinkrequest.findUnique({ where: { id: activeOld.id } });
  assert(oldRevoked.status === "REVOKED", "Nomor lama harus dicabut setelah nomor baru terverifikasi");
  console.log("19. nomor lama dicabut hanya setelah nomor baru terverifikasi");

  // ---------------------------------------------------------------------
  // Kirim ulang OTP: kode lama tidak berlaku
  // ---------------------------------------------------------------------
  r = await api("/api/whatsapp/request", warga2Jar, {
    method: "POST",
    body: JSON.stringify({ phone: phoneC }),
  });
  expectStatus(r, 200, "Pengajuan nomor C");
  const requestC = r.data.request.id;
  const sendsBeforeC = mockState.sends.length;
  r = await api(`/api/whatsapp/verification/${requestC}`, adminJar, {
    method: "POST",
    body: JSON.stringify({ action: "approve" }),
  });
  expectStatus(r, 200, "Persetujuan nomor C");
  const otpC1 = extractOtp(sendsTo(phoneC, sendsBeforeC)[0]?.message || "");
  assert(otpC1, "OTP pertama nomor C tidak diterima");

  const sendsBeforeResend = mockState.sends.length;
  r = await api(`/api/whatsapp/verification/${requestC}`, adminJar, {
    method: "POST",
    body: JSON.stringify({ action: "resend-otp" }),
  });
  expectStatus(r, 200, "Kirim ulang OTP");
  const otpC2 = extractOtp(sendsTo(phoneC, sendsBeforeResend)[0]?.message || "");
  assert(otpC2 && otpC2 !== otpC1, "OTP baru harus berbeda");

  r = await api("/api/whatsapp/verify", warga2Jar, {
    method: "POST",
    body: JSON.stringify({ code: otpC1 }),
  });
  expectStatus(r, 400, "OTP lama setelah resend");
  r = await api("/api/whatsapp/verify", warga2Jar, {
    method: "POST",
    body: JSON.stringify({ code: otpC2 }),
  });
  expectStatus(r, 200, "OTP baru setelah resend");
  console.log("20. kirim ulang OTP membatalkan kode lama");

  // ---------------------------------------------------------------------
  // Retry notifikasi saat Fonnte gagal (maksimal 3 percobaan)
  // ---------------------------------------------------------------------
  mockState.failMode = true;
  const sendsBeforeRetry = sendsTo(phoneC).length;
  const reportRetry = await createReport(warga2Jar, suffix, "retry");
  createdReportIds.push(reportRetry.id);
  await waitUntil(async () => {
    const rows = await prisma.notification.findMany({
      where: { reportId: reportRetry.id },
      select: { whatsappAttempts: true, whatsappSent: true },
    });
    return rows.length > 0 &&
      rows.every((row) => row.whatsappSent || row.whatsappAttempts >= 3)
      ? rows
      : null;
  }, "tiga percobaan pengiriman notifikasi", 30_000);
  const retryNotification = await prisma.notification.findFirst({
    where: { reportId: reportRetry.id, title: "Laporan Berhasil Dibuat" },
  });
  assert(retryNotification, "Notifikasi utama tidak ditemukan");
  assert(retryNotification.whatsappSent === false, "Notifikasi gagal tidak boleh ditandai terkirim");
  assert(retryNotification.whatsappError, "Error pengiriman harus dicatat");
  const retrySends = sendsTo(phoneC, sendsBeforeRetry).filter((item) =>
    item.message.includes("*Laporan Berhasil Dibuat*")
  );
  assert(
    retrySends.length === 3,
    `Harus ada tepat 3 percobaan pengiriman (tanpa duplikasi berlebih), dapat ${retrySends.length}; attempts=${retryNotification.whatsappAttempts}`
  );
  mockState.failMode = false;
  console.log("20b. pengiriman gagal dicoba ulang maksimal 3 kali & error dicatat");

  // ---------------------------------------------------------------------
  // OTP kedaluwarsa
  // ---------------------------------------------------------------------
  r = await api("/api/whatsapp/request", warga3Jar, {
    method: "POST",
    body: JSON.stringify({ phone: phoneD }),
  });
  expectStatus(r, 200, "Pengajuan nomor D");
  const requestD = r.data.request.id;
  await api(`/api/whatsapp/verification/${requestD}`, adminJar, {
    method: "POST",
    body: JSON.stringify({ action: "approve" }),
  });
  await prisma.whatsapplinkrequest.update({
    where: { id: requestD },
    data: { otpExpiresAt: new Date(Date.now() - 1000) },
  });
  r = await api("/api/whatsapp/verify", warga3Jar, {
    method: "POST",
    body: JSON.stringify({ code: "123456" }),
  });
  expectStatus(r, 400, "OTP kedaluwarsa");
  const expiredRequest = await prisma.whatsapplinkrequest.findUnique({ where: { id: requestD } });
  assert(expiredRequest.status === "EXPIRED", "Status harus EXPIRED");
  console.log("21. OTP kedaluwarsa ditolak & request menjadi EXPIRED");

  // ---------------------------------------------------------------------
  // Batas 5 percobaan
  // ---------------------------------------------------------------------
  r = await api("/api/whatsapp/request", warga3Jar, {
    method: "POST",
    body: JSON.stringify({ phone: phoneD }),
  });
  expectStatus(r, 200, "Pengajuan ulang nomor D");
  const requestD2 = r.data.request.id;
  await api(`/api/whatsapp/verification/${requestD2}`, adminJar, {
    method: "POST",
    body: JSON.stringify({ action: "approve" }),
  });
  let lastWrong = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    lastWrong = await api("/api/whatsapp/verify", warga3Jar, {
      method: "POST",
      body: JSON.stringify({ code: "999999" }),
    });
    expectStatus(lastWrong, 400, `OTP salah percobaan ${attempt}`);
  }
  assert(
    String(lastWrong.data.error || "").includes("Batas percobaan"),
    `Percobaan kelima harus mengunci OTP: ${lastWrong.raw}`
  );
  const lockedRequest = await prisma.whatsapplinkrequest.findUnique({ where: { id: requestD2 } });
  assert(lockedRequest.status === "EXPIRED", "Request harus EXPIRED setelah 5 percobaan");
  console.log("22. lima percobaan OTP salah mengunci pengajuan");

  // ---------------------------------------------------------------------
  // Gagal kirim OTP: persetujuan tetap berlaku & bisa kirim ulang
  // ---------------------------------------------------------------------
  r = await api("/api/whatsapp/request", warga3Jar, {
    method: "POST",
    body: JSON.stringify({ phone: phoneE }),
  });
  expectStatus(r, 200, "Pengajuan nomor E");
  const requestE = r.data.request.id;
  mockState.failMode = true;
  const sendsBeforeFail = mockState.sends.length;
  r = await api(`/api/whatsapp/verification/${requestE}`, adminJar, {
    method: "POST",
    body: JSON.stringify({ action: "approve" }),
  });
  expectStatus(r, 200, "Persetujuan saat Fonnte gagal");
  assert(r.data.otpSent === false, `otpSent harus false: ${r.raw}`);
  assert(r.data.request?.status === "PENDING_VERIFICATION", "Persetujuan harus tetap berlaku");
  const failedRequest = await prisma.whatsapplinkrequest.findUnique({ where: { id: requestE } });
  assert(failedRequest.otpSendError, "Error pengiriman harus dicatat");
  assert(
    sendsTo(phoneE, sendsBeforeFail).length === 1,
    "Mock harus menerima satu percobaan pengiriman gagal"
  );

  mockState.failMode = false;
  const sendsBeforeRecover = mockState.sends.length;
  r = await api(`/api/whatsapp/verification/${requestE}`, adminJar, {
    method: "POST",
    body: JSON.stringify({ action: "resend-otp" }),
  });
  expectStatus(r, 200, "Kirim ulang setelah gagal");
  assert(r.data.otpSent === true, "Kirim ulang harus berhasil");
  const otpE = extractOtp(sendsTo(phoneE, sendsBeforeRecover)[0]?.message || "");
  assert(otpE, "OTP pemulihan tidak diterima");
  r = await api("/api/whatsapp/verify", warga3Jar, {
    method: "POST",
    body: JSON.stringify({ code: otpE }),
  });
  expectStatus(r, 200, "Verifikasi setelah pemulihan");
  console.log("23. kegagalan kirim OTP tidak membatalkan persetujuan & bisa dipulihkan");

  // ---------------------------------------------------------------------
  // Uji kirim dari admin
  // ---------------------------------------------------------------------
  const sendsBeforeTest = mockState.sends.length;
  r = await api("/api/admin/whatsapp", adminJar, {
    method: "POST",
    body: JSON.stringify({ action: "test", phone: phoneF }),
  });
  expectStatus(r, 200, "Uji kirim admin");
  assert(sendsTo(phoneF, sendsBeforeTest).length === 1, "Uji kirim harus sampai ke mock");
  console.log("24. uji kirim admin memakai adapter Fonnte");

  // ---------------------------------------------------------------------
  // Putus tautan
  // ---------------------------------------------------------------------
  r = await api("/api/whatsapp/status", warga3Jar, { method: "DELETE" });
  expectStatus(r, 200, "Putus tautan");
  assert(r.data.linked === false, `Status harus tidak tertaut: ${r.raw}`);
  const warga3After = await prisma.user.findUnique({ where: { id: users.warga3.id } });
  assert(warga3After.whatsappNumber === null, "Nomor harus dihapus saat tautan diputus");
  console.log("25. pemutusan tautan membersihkan nomor aktif");

  // ---------------------------------------------------------------------
  // Chatbot & sisa referensi Telegram
  // ---------------------------------------------------------------------
  r = await api("/api/chatbot", warga2Jar, {
    method: "POST",
    body: JSON.stringify({ message: "cara tautkan whatsapp" }),
  });
  expectStatus(r, 200, "Chatbot WhatsApp");
  expectIncludes(r.data.reply, "Pengaturan WhatsApp", "Chatbot WhatsApp");
  expectIncludes(r.data.reply, "OTP", "Chatbot WhatsApp");
  console.log("26. chatbot memberi panduan WhatsApp, bukan Telegram");

  r = await api("/api/telegram/link", warga2Jar);
  expectStatus(r, 404, "Endpoint Telegram lama");

  const telegramTables = await prisma.$queryRawUnsafe(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'telegram%'"
  );
  assert(telegramTables.length === 0, "Tabel Telegram masih ada di database");
  console.log("27. endpoint & tabel Telegram sudah dihapus");

  await cleanup(createdReportIds, userIds);
  userIds.length = 0;
  createdReportIds.length = 0;
  console.log("28. data uji dibersihkan");

  console.log(`\nE2E WHATSAPP PASSED (${Math.round((Date.now() - startedAt) / 1000)}s)`);
}

main()
  .catch(async (error) => {
    console.error("E2E WHATSAPP FAILED:", error.message);
    process.exitCode = 1;
    try {
      const testUsers = await prisma.user.findMany({
        where: { email: { in: Object.values(USERS).map((user) => user.email) } },
        select: { id: true },
      });
      const ids = testUsers.map((user) => user.id);
      if (ids.length > 0) {
        await prisma.report.deleteMany({ where: { reporterId: { in: ids } } });
        await prisma.user.deleteMany({ where: { id: { in: ids } } });
      }
    } catch {
      // abaikan
    }
  })
  .finally(async () => {
    await prisma.$disconnect();
    if (appProcess) {
      spawnSync("taskkill", ["/pid", String(appProcess.pid), "/t", "/f"], {
        stdio: "ignore",
      });
    }
    if (mockServer) mockServer.close();
  });

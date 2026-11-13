/* eslint-disable no-console */
/**
 * E2E verifikasi penautan Telegram:
 * pengajuan otomatis -> persetujuan admin/petugas -> konfirmasi kontak ->
 * aktivasi -> perubahan nomor HP / penolakan / pengajuan ulang / konflik.
 *
 * Jalankan saat server pengembangan aktif:
 *   node scripts/e2e-telegram-verification.cjs
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();
const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const PASSWORD = "E2eTelegram!";
const ADMIN = { email: "e2e-tg-admin@test.local", name: "E2E TG Admin", role: "ADMIN" };
const PETUGAS = { email: "e2e-tg-petugas@test.local", name: "E2E TG Petugas", role: "PETUGAS" };
const USER_A = { email: "e2e-tg-a@test.local", name: "E2E TG A", role: "MASYARAKAT" };
const USER_B = { email: "e2e-tg-b@test.local", name: "E2E TG B", role: "MASYARAKAT" };
const USER_C = { email: "e2e-tg-c@test.local", name: "E2E TG C", role: "MASYARAKAT" };

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

async function page(jar, path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: jar ? { Cookie: jar.header() } : {},
    redirect: "manual",
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function webhook(chatId, payload, username = "e2e_tg_bot") {
  return api("/api/telegram/webhook", null, {
    method: "POST",
    body: JSON.stringify({
      update_id: Math.floor(Math.random() * 1e9),
      message: {
        message_id: Math.floor(Math.random() * 1e9),
        chat: { id: chatId, type: "private" },
        from: {
          id: chatId,
          is_bot: false,
          first_name: "E2E TG",
          username,
        },
        ...payload,
      },
    }),
  });
}

function randomChatId() {
  return 800000000 + Math.floor(Math.random() * 99999999);
}

function getRegisterActionId() {
  const candidates = [
    ".next/dev/server/app/register/page/server-reference-manifest.json",
    ".next/server/app/register/page/server-reference-manifest.json",
  ];
  for (const file of candidates) {
    const full = path.join(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    const manifest = JSON.parse(fs.readFileSync(full, "utf8"));
    const ids = Object.keys(manifest.node || {});
    if (ids.length > 0) return ids[0];
  }
  return null;
}

async function registerWithPhone(email, phone) {
  const actionId = getRegisterActionId();
  if (!actionId) {
    throw new Error("Server action registrasi tidak ditemukan");
  }
  const res = await fetch(`${BASE}/register`, {
    method: "POST",
    headers: {
      "Next-Action": actionId,
      "Content-Type": "text/plain;charset=UTF-8",
    },
    body: JSON.stringify([
      {
        name: "E2E TG Register",
        email,
        password: PASSWORD,
        phone,
      },
    ]),
  });
  if (res.status !== 200) {
    throw new Error("Registrasi HTTP gagal: " + res.status);
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("Registrasi tidak membuat pengguna");
  const request = await prisma.telegramlinkrequest.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  if (!request || request.status !== "PENDING_ADMIN") {
    throw new Error("Registrasi tidak membuat pengajuan otomatis");
  }
  return { user, request };
}

async function createTestUsers() {
  const hash = await bcrypt.hash(PASSWORD, 12);
  for (const u of [ADMIN, PETUGAS, USER_A, USER_B, USER_C]) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        password: hash,
        role: u.role,
        phone: null,
        phoneNormalized: null,
        telegramChatId: null,
        telegramLinkedAt: null,
        telegramUsername: null,
        telegramEnabled: true,
      },
      create: {
        name: u.name,
        email: u.email,
        password: hash,
        role: u.role,
      },
    });
  }
}

async function addPhone(jar, phone) {
  const r = await api("/api/telegram/phone", jar, {
    method: "PATCH",
    body: JSON.stringify({ phone }),
  });
  if (r.status !== 200) {
    throw new Error("Gagal menyimpan nomor HP: " + r.raw);
  }
  if (r.data.request) return r.data.request;
  const status = await api("/api/telegram/link", jar);
  if (!status.data?.request) {
    throw new Error("Pengajuan tidak ditemukan setelah simpan nomor HP");
  }
  return status.data.request;
}

async function approve(jar, requestId) {
  const r = await api(`/api/telegram/verification/${requestId}`, jar, {
    method: "POST",
    body: JSON.stringify({ action: "approve" }),
  });
  if (r.status !== 200) throw new Error("Gagal approve: " + r.raw);
  return r.data;
}

async function makeToken(jar) {
  const r = await api("/api/telegram/link", jar, {
    method: "POST",
    body: JSON.stringify({ action: "confirmation" }),
  });
  if (r.status !== 200 || !r.data.token) {
    throw new Error("Gagal membuat token: " + r.raw);
  }
  return r.data.token;
}

async function createReport(jar, title) {
  const r = await api("/api/reports", jar, {
    method: "POST",
    body: JSON.stringify({
      title,
      description: "Laporan uji notifikasi Telegram.",
      category: "JALAN",
      address: "Jl. Uji Telegram",
    }),
  });
  if (r.status !== 201) throw new Error("Gagal membuat laporan: " + r.raw);
  return r.data;
}

async function waitForNotification(reportId, timeoutMs = 15000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await prisma.notification.findFirst({
      where: { reportId },
      orderBy: { createdAt: "desc" },
    });
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Notifikasi tidak ditemukan untuk laporan " + reportId);
}

async function waitForTelegramAttempt(reportId, timeoutMs = 15000) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeoutMs) {
    last = await prisma.notification.findFirst({
      where: { reportId },
      orderBy: { createdAt: "desc" },
    });
    if (last && (last.telegramSent || last.telegramError)) return last;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    "Pengiriman Telegram tidak dicoba untuk laporan " + reportId
  );
}

async function confirmContact(jar, chatId, phone, contactUserId = chatId) {
  const token = await makeToken(jar);
  let r = await webhook(chatId, { text: `/start ${token}` });
  if (r.status !== 200) throw new Error("Webhook start gagal: " + r.raw);
  r = await webhook(chatId, {
    contact: {
      phone_number: phone,
      first_name: "E2E TG",
      user_id: contactUserId,
    },
  });
  if (r.status !== 200) throw new Error("Webhook contact gagal: " + r.raw);
  return token;
}

async function main() {
  await createTestUsers();
  const adminJar = await login(ADMIN.email);
  const petugasJar = await login(PETUGAS.email);
  const aJar = await login(USER_A.email);
  const bJar = await login(USER_B.email);
  const cJar = await login(USER_C.email);
  const createdReportIds = [];
  let registerEmail = null;

  try {
    // 1. Tambah nomor HP -> pengajuan otomatis, tidak duplikat.
    let requestA = await addPhone(aJar, "081111111111");
    if (requestA.status !== "PENDING_ADMIN")
      throw new Error("Status awal bukan PENDING_ADMIN");
    const sameRequest = await addPhone(aJar, "081111111111");
    if (sameRequest.id !== requestA.id)
      throw new Error("Pengajuan duplikat dibuat untuk nomor yang sama");
    console.log("1. pengajuan otomatis & anti-duplikat ok");

    // 2. Otorisasi halaman verifikasi.
    let r = await api("/api/telegram/verification", aJar);
    if (r.status !== 403) throw new Error("Masyarakat seharusnya 403");
    r = await api("/api/telegram/verification", petugasJar);
    if (r.status !== 200) throw new Error("Petugas harus dapat melihat pengajuan");
    console.log("2. otorisasi verifikasi admin/petugas ok");

    // 3. Petugas menyetujui.
    const approvedA = await approve(petugasJar, requestA.id);
    if (approvedA.request.status !== "PENDING_TELEGRAM")
      throw new Error("Status setelah approve salah");
    r = await api("/api/telegram/link", aJar);
    if (r.data.request.status !== "PENDING_TELEGRAM")
      throw new Error("Status pengguna tidak ikut berubah");
    console.log("3. persetujuan petugas ok");

    // 4. Konfirmasi dengan kontak orang lain ditolak.
    let tokenA = await makeToken(aJar);
    const chatA = randomChatId();
    r = await webhook(chatA, { text: `/start ${tokenA}` });
    if (r.status !== 200) throw new Error("Webhook start gagal");
    r = await webhook(chatA, {
      contact: {
        phone_number: "6281111111111",
        first_name: "Bukan A",
        user_id: chatA + 1,
      },
    });
    r = await api("/api/telegram/link", aJar);
    if (r.data.linked) throw new Error("Kontak orang lain tidak boleh diterima");

    // 5. Nomor HP tidak cocok ditolak.
    r = await webhook(chatA, {
      contact: {
        phone_number: "6289999999999",
        first_name: "A",
        user_id: chatA,
      },
    });
    r = await api("/api/telegram/link", aJar);
    if (r.data.linked) throw new Error("Nomor HP tidak cocok tidak boleh diterima");
    console.log("4-5. validasi kepemilikan & kecocokan nomor ok");

    // 6. Kontak sendiri + nomor cocok -> aktif.
    r = await webhook(chatA, {
      contact: {
        phone_number: "6281111111111",
        first_name: "A",
        user_id: chatA,
      },
    });
    r = await api("/api/telegram/link", aJar);
    if (!r.data.linked) throw new Error("Konfirmasi valid gagal mengaktifkan");
    const activeA = await prisma.telegramlinkrequest.findUnique({
      where: { id: requestA.id },
    });
    if (activeA.status !== "ACTIVE" || !activeA.confirmedAt)
      throw new Error("Pengajuan A tidak ACTIVE");
    console.log("6. aktivasi setelah dua verifikasi ok");

    // 7. Token sekali pakai.
    r = await webhook(chatA, { text: `/start ${tokenA}` });
    if (r.status !== 200) throw new Error("Webhook token bekas gagal");
    r = await api("/api/telegram/link", aJar);
    if (!r.data.linked) throw new Error("Token bekas merusak koneksi aktif");
    console.log("7. token sekali pakai ok");

    // 8. Identitas Telegram milik akun lain ditolak.
    requestA = await addPhone(bJar, "082222222222");
    await approve(adminJar, requestA.id);
    const tokenB = await makeToken(bJar);
    r = await webhook(chatA, { text: `/start ${tokenB}` });
    r = await webhook(chatA, {
      contact: {
        phone_number: "6282222222222",
        first_name: "B",
        user_id: chatA,
      },
    });
    r = await api("/api/telegram/link", bJar);
    if (r.data.linked)
      throw new Error("Chat milik akun A tidak boleh dipakai akun B");
    console.log("8. konflik identitas lintas akun ditolak");

    // 9. Perubahan nomor HP mencabut koneksi lama & membuat pengajuan baru.
    r = await api("/api/telegram/phone", aJar, {
      method: "PATCH",
      body: JSON.stringify({ phone: "081333333333" }),
    });
    if (
      r.status !== 200 ||
      r.data.linked !== false ||
      r.data.request.status !== "PENDING_ADMIN" ||
      r.data.request.requestType !== "PHONE_CHANGE"
    ) {
      throw new Error("Perubahan nomor HP tidak aman: " + r.raw);
    }
    const oldA = await prisma.telegramlinkrequest.findUnique({
      where: { id: activeA.id },
    });
    if (oldA.status !== "REVOKED")
      throw new Error("Koneksi lama tidak dicabut");
    if (r.data.request.previousPhoneDisplay !== "081111111111")
      throw new Error("Riwayat nomor lama tidak tersimpan");
    console.log("9. perubahan nomor HP & pencabutan koneksi lama ok");

    // 10. Penolakan + alasan + pengajuan ulang.
    const requestB2 = await addPhone(bJar, "082777777777");
    if (requestB2.status !== "PENDING_ADMIN")
      throw new Error("Pengajuan baru B bukan PENDING_ADMIN");
    r = await api(`/api/telegram/verification/${requestB2.id}`, adminJar, {
      method: "POST",
      body: JSON.stringify({ action: "reject", reason: "Nomor tidak sesuai data warga" }),
    });
    if (r.status !== 200) throw new Error("Reject gagal: " + r.raw);
    r = await api("/api/telegram/link", bJar);
    if (
      r.data.request.status !== "REJECTED" ||
      !r.data.request.rejectionReason
    )
      throw new Error("Alasan penolakan tidak tersimpan");
    r = await api("/api/telegram/link", bJar, {
      method: "POST",
      body: JSON.stringify({ action: "resubmit" }),
    });
    if (r.status !== 200 || r.data.request.status !== "PENDING_ADMIN")
      throw new Error("Pengajuan ulang gagal: " + r.raw);
    console.log("10. penolakan, alasan, dan pengajuan ulang ok");

    // 11. Token kedaluwarsa tidak dapat dipakai.
    const requestC = await addPhone(cJar, "084444444444");
    await approve(adminJar, requestC.id);
    const tokenC = await makeToken(cJar);
    await prisma.telegramlinkrequest.update({
      where: { id: requestC.id },
      data: { tokenExpiresAt: new Date(Date.now() - 60_000) },
    });
    r = await webhook(randomChatId(), { text: `/start ${tokenC}` });
    if (r.status !== 200) throw new Error("Webhook token kedaluwarsa gagal");
    r = await api("/api/telegram/link", cJar);
    if (r.data.linked) throw new Error("Token kedaluwarsa tidak boleh aktif");
    console.log("11. token kedaluwarsa ditolak");

    // 12. Konfirmasi sebelum persetujuan admin disimpan, aktif setelah approve.
    const requestD = await addPhone(cJar, "085555555555");
    const chatC = randomChatId();
    await confirmContact(cJar, chatC, "6285555555555");
    r = await api("/api/telegram/link", cJar);
    if (
      r.data.linked ||
      r.data.request.status !== "PENDING_ADMIN" ||
      !r.data.request.confirmedAt
    ) {
      throw new Error("Konfirmasi sebelum approve tidak disimpan dengan benar");
    }
    await approve(adminJar, requestD.id);
    r = await api("/api/telegram/link", cJar);
    if (!r.data.linked)
      throw new Error("Approval setelah konfirmasi tidak mengaktifkan");
    console.log("12. konfirmasi sebelum approve + aktivasi setelah approve ok");

    // 13. Pengajuan sendiri tidak boleh diverifikasi sendiri.
    const petugasUser = await prisma.user.findUnique({
      where: { email: PETUGAS.email },
    });
    const selfReq = await prisma.telegramlinkrequest.create({
      data: {
        userId: petugasUser.id,
        phone: "086666666666",
        phoneNormalized: "6286666666666",
        requestType: "INITIAL",
        status: "PENDING_ADMIN",
      },
    });
    r = await api(`/api/telegram/verification/${selfReq.id}`, petugasJar, {
      method: "POST",
      body: JSON.stringify({ action: "approve" }),
    });
    if (r.status !== 409)
      throw new Error("Self-review seharusnya ditolak, dapat " + r.status);
    console.log("13. self-review ditolak");

    // 14. Notifikasi tidak dikirim ke koneksi yang sudah dicabut.
    const aAfter = await prisma.user.findUnique({ where: { email: USER_A.email } });
    if (aAfter.telegramChatId)
      throw new Error("Chat ID lama masih menempel setelah perubahan nomor");
    const activeRequestsA = await prisma.telegramlinkrequest.count({
      where: { userId: aAfter.id, status: "ACTIVE" },
    });
    if (activeRequestsA !== 0)
      throw new Error("Masih ada koneksi ACTIVE setelah perubahan nomor");
    console.log("14. koneksi lama tidak lagi menjadi penerima notifikasi");

    // 15. Pengguna aktif menerima percobaan pengiriman notifikasi Telegram.
    const activeReport = await createReport(
      cJar,
      "E2E notifikasi Telegram aktif " + Date.now()
    );
    createdReportIds.push(activeReport.id);
    const activeNotification = await waitForTelegramAttempt(activeReport.id);
    if (!activeNotification.telegramSent && !activeNotification.telegramError)
      throw new Error("Notifikasi untuk akun aktif tidak diproses");
    console.log("15. notifikasi akun aktif diproses ke Telegram");

    // 16. Setelah nomor berubah, notifikasi tidak lagi dikirim ke koneksi lama.
    r = await api("/api/telegram/phone", cJar, {
      method: "PATCH",
      body: JSON.stringify({ phone: "087777777777" }),
    });
    if (r.status !== 200 || r.data.linked !== false)
      throw new Error("Deaktivasi nomor C gagal: " + r.raw);
    const inactiveReport = await createReport(
      cJar,
      "E2E notifikasi Telegram nonaktif " + Date.now()
    );
    createdReportIds.push(inactiveReport.id);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const inactiveNotification = await waitForNotification(inactiveReport.id);
    if (inactiveNotification.telegramSent || inactiveNotification.telegramError)
      throw new Error("Notifikasi masih dikirim ke koneksi lama");
    console.log("16. pengguna nonaktif tidak menerima notifikasi Telegram");

    // 17. Registrasi akun baru dengan nomor HP -> pengajuan otomatis.
    registerEmail = `e2e-tg-register-${Date.now()}@test.local`;
    await registerWithPhone(
      registerEmail,
      "0812" + String(Date.now()).slice(-8)
    );
    console.log("17. registrasi dengan nomor HP membuat pengajuan otomatis");

    // 18. Halaman pengguna, admin, dan petugas dapat dirender.
    let pg = await page(aJar, "/pengaturan/telegram");
    if (pg.status !== 200 || !pg.text.includes("Pengaturan Telegram"))
      throw new Error("Halaman pengaturan Telegram gagal dirender");
    pg = await page(adminJar, "/admin/telegram/verifikasi");
    if (pg.status !== 200 || !pg.text.includes("Verifikasi Telegram"))
      throw new Error("Halaman verifikasi admin gagal dirender");
    pg = await page(petugasJar, "/petugas/telegram");
    if (pg.status !== 200 || !pg.text.includes("Verifikasi Telegram"))
      throw new Error("Halaman verifikasi petugas gagal dirender");
    pg = await page(aJar, "/admin/telegram/verifikasi");
    if (pg.status !== 307 && pg.status !== 302)
      throw new Error("Masyarakat seharusnya dialihkan dari halaman admin");
    console.log("18. halaman pengguna/admin/petugas & proteksi role ok");

    console.log("\nSEMUA PENGUJIAN TELEGRAM VERIFICATION LULUS");
  } finally {
    if (createdReportIds.length > 0) {
      await prisma.report.deleteMany({ where: { id: { in: createdReportIds } } });
    }
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            ADMIN.email,
            PETUGAS.email,
            USER_A.email,
            USER_B.email,
            USER_C.email,
            ...(registerEmail ? [registerEmail] : []),
          ],
        },
      },
    });
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error("E2E TELEGRAM GAGAL:", error.message);
  await prisma.$disconnect();
  process.exit(1);
});

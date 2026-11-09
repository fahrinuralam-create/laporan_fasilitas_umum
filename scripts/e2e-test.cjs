const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const EMAIL = "e2e-temp@test.local";
const PASSWORD = "E2eTest123!";

const cookies = new Map();

function storeCookies(res) {
  const list =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  for (const c of list) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (value === "" ) cookies.delete(name);
    else cookies.set(name, value);
  }
}

function cookieHeader() {
  return Array.from(cookies.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function main() {
  // 1. Siapkan user uji (hash bcrypt baru)
  const hash = await bcrypt.hash(PASSWORD, 12);
  await prisma.user.upsert({
    where: { email: EMAIL },
    update: { password: hash },
    create: {
      name: "E2E Temp",
      email: EMAIL,
      password: hash,
      role: "MASYARAKAT",
    },
  });
  console.log("1. user uji siap");

  // 2. CSRF
  let res = await fetch(`${BASE}/api/auth/csrf`);
  storeCookies(res);
  const { csrfToken } = await res.json();
  console.log("2. csrf ok");

  // 3. Login credentials
  const body = new URLSearchParams({
    csrfToken,
    email: EMAIL,
    password: PASSWORD,
    callbackUrl: `${BASE}/masyarakat/dashboard`,
    json: "true",
  });
  res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(),
    },
    body,
    redirect: "manual",
  });
  storeCookies(res);
  console.log("3. login status", res.status);

  // 4. Session
  res = await fetch(`${BASE}/api/auth/session`, {
    headers: { Cookie: cookieHeader() },
  });
  const session = await res.json();
  if (!session?.user?.email) {
    throw new Error("Sesi tidak valid setelah login");
  }
  console.log("4. session ok sebagai", session.user.email, "role", session.user.role);

  // 5. Buat laporan
  res = await fetch(`${BASE}/api/reports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader(),
    },
    body: JSON.stringify({
      title: "E2E Uji Lampu Jalan",
      description: "Laporan otomatis untuk pengujian end-to-end.",
      category: "LAMPU_JALAN",
      address: "Jl. Pengujian No. 1",
      latitude: "-6.75",
      longitude: "108.59",
    }),
  });
  const created = await res.json();
  if (res.status !== 201 || !created.id) {
    throw new Error("Gagal membuat laporan: " + JSON.stringify(created));
  }
  console.log("5. laporan dibuat", created.reportNumber, created.id);

  // 6. Daftar laporan
  res = await fetch(`${BASE}/api/reports`, {
    headers: { Cookie: cookieHeader() },
  });
  const list = await res.json();
  if (!Array.isArray(list) || !list.some((r) => r.id === created.id)) {
    throw new Error("Laporan baru tidak muncul di daftar");
  }
  console.log("6. daftar laporan ok, total", list.length);

  // 7. Detail laporan
  res = await fetch(`${BASE}/api/reports/${created.id}`, {
    headers: { Cookie: cookieHeader() },
  });
  const detail = await res.json();
  if (!detail?.id || detail.reporthistory.length === 0) {
    throw new Error("Detail laporan / riwayat tidak lengkap");
  }
  console.log("7. detail ok, riwayat", detail.reporthistory.length);

  // 8. Notifikasi
  res = await fetch(`${BASE}/api/notifications`, {
    headers: { Cookie: cookieHeader() },
  });
  const notif = await res.json();
  if (!Array.isArray(notif.notifications) || notif.notifications.length === 0) {
    throw new Error("Notifikasi tidak terbuat");
  }
  console.log("8. notifikasi ok, jumlah", notif.notifications.length);

  // 9. Tandai dibaca
  res = await fetch(`${BASE}/api/notifications/read`, {
    method: "POST",
    headers: { Cookie: cookieHeader() },
  });
  const readRes = await res.json();
  console.log("9. tandai dibaca ok, terupdate", readRes.updated);

  // 10. Bersihkan data uji
  await prisma.report.deleteMany({ where: { reporterId: (await prisma.user.findUnique({ where: { email: EMAIL } })).id } });
  await prisma.user.delete({ where: { email: EMAIL } });
  console.log("10. data uji dibersihkan");

  console.log("\nE2E PASSED");
}

main()
  .catch(async (e) => {
    console.error("E2E FAILED:", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

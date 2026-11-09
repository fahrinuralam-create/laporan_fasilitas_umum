const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const PASSWORD = "E2ePhase3!";

const USERS = {
  reporter: { email: "e2e3-reporter@test.local", name: "E2E Reporter", role: "MASYARAKAT" },
  admin: { email: "e2e3-admin@test.local", name: "E2E Admin", role: "ADMIN" },
  petugas: { email: "e2e3-petugas@test.local", name: "E2E Petugas", role: "PETUGAS" },
};

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
  if (!session?.user?.email) throw new Error(`Login gagal untuk ${email}`);
  return { jar, session };
}

async function api(path, jar, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      Cookie: jar.header(),
      ...(options.headers || {}),
    },
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 12);

  // Siapkan user uji
  const ids = {};
  for (const [key, u] of Object.entries(USERS)) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { password: hash, role: u.role },
      create: { name: u.name, email: u.email, password: hash, role: u.role },
    });
    ids[key] = user.id;
  }
  console.log("1. user uji siap (masyarakat, admin, petugas)");

  // Reporter buat laporan
  const reporter = await login(USERS.reporter.email);
  let r = await api("/api/reports", reporter.jar, {
    method: "POST",
    body: JSON.stringify({
      title: "E2E Phase 3 - Jalan Berlubang",
      description: "Laporan uji alur admin dan petugas.",
      category: "JALAN",
      address: "Jl. Uji Phase 3",
      latitude: "-6.7",
      longitude: "108.5",
    }),
  });
  if (r.status !== 201) throw new Error("Buat laporan gagal: " + JSON.stringify(r.data));
  const reportId = r.data.id;
  console.log("2. laporan dibuat", r.data.reportNumber);

  // Pastikan bukan admin/petugas tidak bisa aksi admin
  r = await api(`/api/admin/reports/${reportId}/action`, reporter.jar, {
    method: "POST",
    body: JSON.stringify({ action: "verify" }),
  });
  if (r.status !== 403) throw new Error("Masyarakat seharusnya tidak boleh aksi admin, dapat " + r.status);
  console.log("3. otorisasi admin ok (masyarakat ditolak 403)");

  // Admin verifikasi
  const admin = await login(USERS.admin.email);
  r = await api(`/api/admin/reports/${reportId}/action`, admin.jar, {
    method: "POST",
    body: JSON.stringify({ action: "verify" }),
  });
  if (r.status !== 200 || r.data.status !== "DIVERIFIKASI")
    throw new Error("Verifikasi gagal: " + JSON.stringify(r.data));
  console.log("4. admin verifikasi -> DIVERIFIKASI");

  // Admin tugaskan
  r = await api(`/api/admin/reports/${reportId}/action`, admin.jar, {
    method: "POST",
    body: JSON.stringify({ action: "assign", officerId: ids.petugas }),
  });
  if (r.status !== 200 || r.data.status !== "DITUGASKAN" || r.data.assignedOfficerId !== ids.petugas)
    throw new Error("Penugasan gagal: " + JSON.stringify(r.data));
  console.log("5. admin tugaskan -> DITUGASKAN");

  // Petugas mulai
  const petugas = await login(USERS.petugas.email);

  // Pastikan petugas lain tidak bisa aksi pada laporan ini (pakai admin jar -> 403 karena bukan petugas)
  r = await api(`/api/petugas/tasks/${reportId}/action`, admin.jar, {
    method: "POST",
    body: JSON.stringify({ action: "start" }),
  });
  if (r.status !== 403) throw new Error("Non-petugas seharusnya 403, dapat " + r.status);
  console.log("6. otorisasi petugas ok (non-petugas ditolak 403)");

  r = await api(`/api/petugas/tasks/${reportId}/action`, petugas.jar, {
    method: "POST",
    body: JSON.stringify({ action: "start", notes: "Sedang menuju lokasi." }),
  });
  if (r.status !== 200 || r.data.status !== "DIPROSES")
    throw new Error("Mulai proses gagal: " + JSON.stringify(r.data));
  console.log("7. petugas mulai -> DIPROSES");

  // Petugas selesaikan + foto after
  const afterImage =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  r = await api(`/api/petugas/tasks/${reportId}/action`, petugas.jar, {
    method: "POST",
    body: JSON.stringify({
      action: "complete",
      notes: "Sudah diperbaiki dan diaspal.",
      afterImageDataUrl: afterImage,
    }),
  });
  if (r.status !== 200 || r.data.status !== "SELESAI")
    throw new Error("Selesaikan gagal: " + JSON.stringify(r.data));
  console.log("8. petugas selesaikan -> SELESAI");

  // Verifikasi hasil dari sisi reporter
  r = await api(`/api/reports/${reportId}`, reporter.jar);
  if (r.status !== 200) throw new Error("Reporter gagal membaca detail");
  const detail = r.data;
  if (detail.status !== "SELESAI") throw new Error("Status akhir bukan SELESAI");
  if (detail.reporthistory.length < 5)
    throw new Error("Riwayat tidak lengkap: " + detail.reporthistory.length);
  const hasAfter = detail.reportimage.some((i) => i.type === "AFTER");
  if (!hasAfter) throw new Error("Foto AFTER tidak tersimpan");
  console.log(
    "9. verifikasi akhir ok: status SELESAI, riwayat",
    detail.reporthistory.length,
    ", foto AFTER ada"
  );

  // Verifikasi notifikasi reporter
  r = await api("/api/notifications", reporter.jar);
  const titles = (r.data.notifications || []).map((n) => n.title);
  for (const t of ["Laporan Berhasil Dibuat", "Laporan Diverifikasi", "Laporan Ditugaskan", "Laporan Sedang Diproses", "Laporan Selesai"]) {
    if (!titles.includes(t)) throw new Error("Notifikasi hilang: " + t);
  }
  console.log("10. notifikasi lengkap:", titles.join(", "));

  // Bersihkan data uji
  await prisma.report.deleteMany({ where: { reporterId: ids.reporter } });
  await prisma.user.deleteMany({
    where: { email: { in: Object.values(USERS).map((u) => u.email) } },
  });
  console.log("11. data uji dibersihkan");

  console.log("\nE2E PHASE 3 PASSED");
}

main()
  .catch((e) => {
    console.error("E2E PHASE 3 FAILED:", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

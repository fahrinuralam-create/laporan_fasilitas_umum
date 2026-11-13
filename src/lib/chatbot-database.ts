import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  categoryLabel,
  cleanHistoryNotes,
  formatDateTime,
  isSystemActorNote,
  priorityLabel,
  REPORT_CATEGORIES,
  REPORT_PRIORITIES,
  REPORT_STATUSES,
  statusLabel,
} from "@/lib/report-utils";
import { getAiConfigAdminView, getAiConfigHistoryView } from "@/lib/ai-config";
import type { ChatTool } from "@/lib/ai-client";

export type ChatbotDbRole = "ADMIN" | "PETUGAS" | "MASYARAKAT";

export type ChatbotDbUser = {
  id: string;
  role: string;
  name?: string | null;
  email?: string | null;
};

const STATUS_VALUES = REPORT_STATUSES.map((item) => item.value);
const PRIORITY_VALUES = REPORT_PRIORITIES.map((item) => item.value);
const CATEGORY_VALUES = REPORT_CATEGORIES.map((item) => item.value);
const ROLE_VALUES: ChatbotDbRole[] = ["ADMIN", "PETUGAS", "MASYARAKAT"];

const MAX_SNAPSHOT_REPORTS = 2000;
const MAX_SNAPSHOT_USERS = 1000;
const MAX_SNAPSHOT_NOTIFICATIONS = 200;
const MAX_RELEVANT_REPORTS = 15;
const MAX_TOOL_ROWS = 100;
const DEFAULT_DB_CONTEXT_CHARS = 60_000;

const STOPWORDS = new Set([
  "yang",
  "dan",
  "atau",
  "dengan",
  "untuk",
  "dari",
  "pada",
  "dalam",
  "adalah",
  "itu",
  "ini",
  "ada",
  "tidak",
  "sudah",
  "belum",
  "saya",
  "aku",
  "kami",
  "kita",
  "anda",
  "kamu",
  "dia",
  "mereka",
  "nya",
  "juga",
  "saja",
  "semua",
  "seluruh",
  "tiap",
  "setiap",
  "berapa",
  "jumlah",
  "total",
  "data",
  "database",
  "db",
  "tabel",
  "daftar",
  "tampilkan",
  "tunjukkan",
  "sebutkan",
  "cari",
  "carikan",
  "minta",
  "tolong",
  "bisa",
  "dapat",
  "apakah",
  "apa",
  "siapa",
  "kapan",
  "dimana",
  "di",
  "mana",
  "bagaimana",
  "gimana",
  "mengapa",
  "kenapa",
  "berapa",
  "yang",
  "di",
  "ke",
  "the",
  "and",
  "of",
  "in",
  "on",
  "at",
  "is",
  "are",
  "was",
  "were",
  "a",
  "an",
  // Kata domain yang terlalu umum untuk dijadikan penentu relevansi laporan.
  "laporan",
  "pengguna",
  "user",
  "akun",
  "notifikasi",
  "statistik",
  "sistem",
  "aplikasi",
  "riwayat",
  "detail",
  "foto",
  "telegram",
  "kategori",
  "prioritas",
  "status",
  "tugas",
  "pelapor",
  "petugas",
  "admin",
  "masyarakat",
  "model",
  "konfigurasi",
  "provider",
  "api",
  "ai",
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string | null | undefined, max = 240): string {
  if (!value) return "";
  const oneLine = value.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

function roleOf(value: string): ChatbotDbRole {
  return value === "ADMIN" || value === "PETUGAS" ? value : "MASYARAKAT";
}

function roleLabel(role: ChatbotDbRole): string {
  return role === "ADMIN"
    ? "Admin"
    : role === "PETUGAS"
      ? "Petugas"
      : "Masyarakat";
}

function scopeLabel(role: ChatbotDbRole): string {
  if (role === "ADMIN") {
    return "Admin dapat membaca SELURUH data sistem (semua laporan, semua pengguna, semua riwayat, semua notifikasi, konfigurasi AI, dan status Telegram).";
  }
  if (role === "PETUGAS") {
    return "Petugas hanya boleh membaca data laporan yang ditugaskan kepadanya, riwayat/foto laporan tersebut, notifikasi miliknya, serta statistik agregat sistem yang tidak memuat data pribadi pengguna lain.";
  }
  return "Masyarakat hanya boleh membaca laporan miliknya sendiri, riwayat/foto laporan tersebut, notifikasi miliknya, serta statistik agregat sistem yang tidak memuat data pribadi pengguna lain.";
}

function scopeWhere(user: ChatbotDbUser): Prisma.reportWhereInput {
  const role = roleOf(user.role);
  if (role === "ADMIN") return {};
  if (role === "PETUGAS") return { assignedOfficerId: user.id };
  return { reporterId: user.id };
}

function questionTokens(question: string): string[] {
  return Array.from(
    new Set(
      normalize(question)
        .split(" ")
        .filter(
          (word) =>
            word.length >= 3 &&
            !STOPWORDS.has(word) &&
            !/^\d+$/.test(word)
        )
    )
  );
}

function filterEnums<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T[] {
  if (!Array.isArray(value)) {
    if (typeof value === "string" && value.trim()) {
      const single = value.trim().toUpperCase();
      return allowed.includes(single as T) ? [single as T] : [];
    }
    return [];
  }

  const set = new Set(allowed);
  const result: T[] = [];
  for (const raw of value) {
    const normalized = String(raw ?? "")
      .trim()
      .toUpperCase();
    if (set.has(normalized as T) && !result.includes(normalized as T)) {
      result.push(normalized as T);
    }
  }
  return result;
}

function readString(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "ya", "yes", "1"].includes(normalized)) return true;
    if (["false", "tidak", "no", "0"].includes(normalized)) return false;
  }
  return null;
}

function readLimit(value: unknown, fallback = 25, max = MAX_TOOL_ROWS): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

function parseDate(value: unknown, endOfDay = false): Date | null {
  const raw = readString(value, 40);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    date.setHours(23, 59, 59, 999);
  }
  return date;
}

function startOfWindows(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const week = new Date(today);
  week.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const year = new Date(now.getFullYear(), 0, 1);
  return { today, week, month, year };
}

const reportOverviewSelect = {
  id: true,
  reportNumber: true,
  title: true,
  description: true,
  category: true,
  priority: true,
  status: true,
  latitude: true,
  longitude: true,
  address: true,
  reporterId: true,
  assignedOfficerId: true,
  createdAt: true,
  updatedAt: true,
  verifiedAt: true,
  completedAt: true,
  aiAnalyzedAt: true,
  aiCategory: true,
  aiPriority: true,
  aiConfidence: true,
  aiReason: true,
  aiAutoRejected: true,
  aiDuplicateOfId: true,
  aiDuplicateReason: true,
  aiIsDuplicate: true,
  aiRejectionReason: true,
  reporter: { select: { id: true, name: true, email: true } },
  assignedOfficer: { select: { id: true, name: true, email: true } },
  _count: { select: { reportimage: true, reporthistory: true } },
} satisfies Prisma.reportSelect;

const reportDetailSelect = {
  ...reportOverviewSelect,
  reportimage: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      type: true,
      createdAt: true,
      aiDescription: true,
      aiImageAnalyzedAt: true,
      aiImageConfidence: true,
      aiIsRelevant: true,
      aiPossibleDamage: true,
      aiSeverity: true,
      aiImageMatchTitle: true,
      aiRejectionReason: true,
    },
  },
  reporthistory: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      oldStatus: true,
      newStatus: true,
      notes: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  },
} satisfies Prisma.reportSelect;

type OverviewReport = Prisma.reportGetPayload<{
  select: typeof reportOverviewSelect;
}>;

type DetailReport = Prisma.reportGetPayload<{
  select: typeof reportDetailSelect;
}>;

const userOverviewSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  phone: true,
  address: true,
  createdAt: true,
  updatedAt: true,
  telegramChatId: true,
  telegramEnabled: true,
  telegramUsername: true,
  telegramLinkedAt: true,
  _count: {
    select: {
      reportsReported: true,
      reportsAssigned: true,
      notification: true,
      reporthistory: true,
    },
  },
} satisfies Prisma.userSelect;

const notificationOverviewSelect = {
  id: true,
  title: true,
  message: true,
  isRead: true,
  createdAt: true,
  telegramSent: true,
  telegramSentAt: true,
  report: {
    select: {
      id: true,
      reportNumber: true,
      title: true,
      status: true,
    },
  },
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
} satisfies Prisma.notificationSelect;

const SCHEMA_TEXT = `SKEMA DATABASE APLIKASI PELAPORAN FASILITAS

1. Tabel user (akun pengguna)
   - id, name, email (unik), role (ADMIN | PETUGAS | MASYARAKAT)
   - phone, address, createdAt, updatedAt
   - telegramChatId, telegramUsername, telegramLinkedAt, telegramEnabled, phoneNormalized
   - password TIDAK PERNAH dibaca atau ditampilkan oleh chatbot.
   - Relasi: reportsReported (laporan yang dibuat), reportsAssigned (laporan yang ditugaskan), reporthistory, notification, telegramlinktoken.

2. Tabel report (laporan kerusakan fasilitas)
   - id, reportNumber (unik, format REP-YYYYMMDD-XXXX), title, description
   - category (JALAN | LAMPU_JALAN | SALURAN_AIR | JEMBATAN | FASILITAS_KESEHATAN | LAINNYA)
   - priority (RENDAH | SEDANG | TINGGI | DARURAT)
   - status (DIAJUKAN | DIVERIFIKASI | DITUGASKAN | DIPROSES | SELESAI | DITOLAK)
   - latitude, longitude, address
   - reporterId, assignedOfficerId, createdAt, updatedAt, verifiedAt, completedAt
   - aiAnalyzedAt, aiCategory, aiPriority, aiConfidence, aiReason
   - aiIsDuplicate, aiDuplicateOfId, aiDuplicateReason, aiAutoRejected, aiRejectionReason
   - Relasi: reporter, assignedOfficer, reportimage, reporthistory, notification.

3. Tabel reporthistory (riwayat perubahan status laporan)
   - id, reportId, userId, oldStatus, newStatus, notes, createdAt
   - Catatan yang diawali "[SISTEM AI]" berasal dari sistem/AI.

4. Tabel reportimage (foto laporan)
   - id, reportId, imageUrl (tidak pernah dikirim ke model), type (BEFORE | AFTER), createdAt
   - aiDescription, aiImageAnalyzedAt, aiImageConfidence, aiIsRelevant, aiPossibleDamage, aiSeverity, aiImageMatchTitle, aiRejectionReason.

5. Tabel notification (notifikasi in-app)
   - id, userId, reportId, title, message, isRead, createdAt, telegramSent, telegramSentAt, telegramError.

6. Tabel telegramlinktoken (kode tautan Telegram)
   - id, token, userId, expiresAt, usedAt, createdAt, phone.

7. Tabel aiconfiguration & aiconfigurationhistory (konfigurasi AI)
   - provider, baseUrl, model teks/vision, status API key (masking/hash), updatedByEmail.
   - API key mentah TIDAK PERNAH dibaca atau ditampilkan oleh chatbot.

RELASI PENTING:
- user 1—N report (sebagai reporter dan assignedOfficer).
- report 1—N reporthistory, report 1—N reportimage, report 1—N notification.
- user 1—N notification, user 1—N telegramlinktoken.

STATUS LAPORAN:
- DIAJUKAN: baru masuk, menunggu verifikasi admin.
- DIVERIFIKASI: valid, menunggu penugasan petugas.
- DITUGASKAN: petugas sudah ditunjuk.
- DIPROSES: petugas sedang mengerjakan.
- SELESAI: perbaikan selesai.
- DITOLAK: ditolak admin atau otomatis oleh sistem/AI.

AKSES DATA:
- Admin: seluruh data.
- Petugas: laporan yang ditugaskan kepadanya + data pribadinya.
- Masyarakat: laporan miliknya + data pribadinya.
- Statistik agregat (jumlah) boleh dipakai untuk menjawab pertanyaan umum tanpa membocorkan identitas pengguna lain.`;

function reportHistoryLine(args: {
  newStatus: string;
  notes: string | null;
  createdAt: Date;
  actor: string | null;
  isSystem: boolean;
}): string {
  const note = cleanHistoryNotes(args.notes);
  const actor = args.isSystem ? "Sistem AI" : args.actor || "Sistem";
  return `- ${statusLabel(args.newStatus)} (${formatDateTime(
    args.createdAt
  )}, ${actor})${note ? `: ${note}` : ""}`;
}

function serializeReportDetail(
  report: DetailReport,
  includeHistory = true
): string {
  const lines: string[] = [
    `### ${report.reportNumber} — ${report.title}`,
    `Status: ${statusLabel(report.status)} | Prioritas: ${priorityLabel(
      report.priority
    )} | Kategori: ${categoryLabel(report.category)}`,
    `Pelapor: ${report.reporter.name || report.reporter.email || "-"} | Petugas: ${
      report.assignedOfficer?.name ||
      report.assignedOfficer?.email ||
      "belum ditugaskan"
    }`,
    `Dibuat: ${formatDateTime(report.createdAt)} | Diperbarui: ${formatDateTime(
      report.updatedAt
    )}${report.verifiedAt ? ` | Diverifikasi: ${formatDateTime(report.verifiedAt)}` : ""}${
      report.completedAt
        ? ` | Selesai: ${formatDateTime(report.completedAt)}`
        : ""
    }`,
  ];

  if (report.address) lines.push(`Lokasi: ${report.address}`);
  if (report.latitude !== null && report.longitude !== null) {
    lines.push(`Koordinat: ${report.latitude}, ${report.longitude}`);
  }
  lines.push(`Deskripsi: ${report.description}`);

  const aiParts: string[] = [];
  if (report.aiCategory) aiParts.push(`kategori ${categoryLabel(report.aiCategory)}`);
  if (report.aiPriority) aiParts.push(`prioritas ${priorityLabel(report.aiPriority)}`);
  if (typeof report.aiConfidence === "number") {
    aiParts.push(`keyakinan ${Math.round(report.aiConfidence * 100)}%`);
  }
  if (report.aiReason) aiParts.push(`alasan: ${report.aiReason}`);
  if (aiParts.length > 0) lines.push(`Analisis AI: ${aiParts.join(", ")}`);
  if (report.aiIsDuplicate) {
    lines.push(
      `Terindikasi duplikat: ya${report.aiDuplicateReason ? ` — ${report.aiDuplicateReason}` : ""}`
    );
  } else {
    lines.push("Terindikasi duplikat: tidak");
  }
  lines.push(`Ditolak otomatis: ${report.aiAutoRejected ? "ya" : "tidak"}`);
  if (report.aiRejectionReason) {
    lines.push(`Alasan penolakan: ${report.aiRejectionReason}`);
  }

  lines.push(
    `Foto: ${report.reportimage.length} (BEFORE ${report.reportimage.filter((image) => image.type === "BEFORE").length}, AFTER ${
      report.reportimage.filter((image) => image.type === "AFTER").length
    })`
  );
  for (const image of report.reportimage) {
    const imageParts = [
      image.aiDescription,
      image.aiPossibleDamage ? `perkiraan kerusakan: ${image.aiPossibleDamage}` : "",
      image.aiSeverity ? `tingkat: ${image.aiSeverity}` : "",
      image.aiIsRelevant === false ? "AI menilai foto tidak relevan" : "",
      image.aiImageMatchTitle === false ? "AI menilai foto tidak cocok dengan judul" : "",
      typeof image.aiImageConfidence === "number"
        ? `keyakinan ${Math.round(image.aiImageConfidence * 100)}%`
        : "",
    ].filter(Boolean);
    if (imageParts.length > 0) {
      lines.push(`- Foto ${image.type}: ${imageParts.join("; ")}`);
    }
  }

  if (includeHistory) {
    if (report.reporthistory.length > 0) {
      lines.push(`Riwayat status (${report.reporthistory.length} entri):`);
      for (const history of report.reporthistory) {
        lines.push(
          reportHistoryLine({
            newStatus: history.newStatus,
            notes: history.notes,
            createdAt: history.createdAt,
            actor: history.user.name || history.user.email || null,
            isSystem: isSystemActorNote(history.notes),
          })
        );
      }
    } else {
      lines.push("Riwayat status: belum ada.");
    }
  } else {
    lines.push(`Jumlah entri riwayat: ${report.reporthistory.length}`);
  }

  return lines.join("\n");
}

function serializeReportOverview(report: OverviewReport): string {
  const reporter = report.reporter.name || report.reporter.email || "-";
  const officer =
    report.assignedOfficer?.name || report.assignedOfficer?.email || "-";
  return [
    `- ${report.reportNumber} | ${compact(report.title, 100)} | ${statusLabel(
      report.status
    )} | ${priorityLabel(report.priority)} | ${categoryLabel(report.category)}`,
    `  Pelapor: ${reporter} | Petugas: ${officer} | Dibuat: ${formatDateTime(
      report.createdAt
    )}`,
    report.address ? `  Lokasi: ${compact(report.address, 160)}` : "",
    `  Deskripsi: ${compact(report.description, 220)}`,
    `  Foto: ${report._count.reportimage} | Riwayat: ${report._count.reporthistory}${
      report.aiIsDuplicate ? " | Terindikasi duplikat" : ""
    }${report.aiAutoRejected ? " | Pernah ditolak otomatis" : ""}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function serializeUser(user: {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  phone: string | null;
  address: string | null;
  createdAt: Date;
  updatedAt: Date;
  telegramChatId: string | null;
  telegramEnabled: boolean;
  telegramUsername: string | null;
  telegramLinkedAt: Date | null;
  _count: {
    reportsReported: number;
    reportsAssigned: number;
    notification: number;
    reporthistory: number;
  };
}): string {
  return [
    `- ${user.name || "(tanpa nama)"} | ${user.email || "(tanpa email)"} | ${roleLabel(
      roleOf(user.role)
    )}`,
    `  ID: ${user.id} | Telepon: ${user.phone || "-"} | Dibuat: ${formatDateTime(
      user.createdAt
    )}`,
    user.address ? `  Alamat: ${compact(user.address, 160)}` : "",
    `  Laporan dibuat: ${user._count.reportsReported} | Laporan ditangani: ${
      user._count.reportsAssigned
    } | Notifikasi: ${user._count.notification} | Riwayat: ${user._count.reporthistory}`,
    `  Telegram: ${user.telegramChatId ? "tertaut" : "belum tertaut"}${
      user.telegramUsername ? ` (@${user.telegramUsername})` : ""
    }${user.telegramEnabled ? "" : " | notifikasi dinonaktifkan"}${
      user.telegramLinkedAt
        ? ` | sejak ${formatDateTime(user.telegramLinkedAt)}`
        : ""
    }`,
  ]
    .filter(Boolean)
    .join("\n");
}

function serializeNotification(notification: {
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
  telegramSent: boolean | null;
  report: { reportNumber: string; title: string; status: string } | null;
  user: { name: string | null; email: string | null; role: string } | null;
}): string {
  return [
    `- ${notification.title}${notification.isRead ? "" : " (belum dibaca)"} | ${formatDateTime(
      notification.createdAt
    )} | Telegram: ${notification.telegramSent ? "terkirim" : "belum/tidak"}`,
    `  Pesan: ${compact(notification.message, 300)}`,
    notification.report
      ? `  Laporan: ${notification.report.reportNumber} — ${notification.report.title} (${statusLabel(
          notification.report.status
        )})`
      : "",
    notification.user
      ? `  Penerima: ${notification.user.name || notification.user.email || "-"} (${roleLabel(
          roleOf(notification.user.role)
        )})`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function pickRelevantReports(
  reports: OverviewReport[],
  question: string,
  reportNumber: string | null
): OverviewReport[] {
  const tokens = questionTokens(question);
  if (tokens.length === 0 && !reportNumber) return [];

  const scored = reports
    .map((report) => {
      let score = 0;
      if (reportNumber && report.reportNumber === reportNumber) score += 1000;

      const title = normalize(report.title);
      const description = normalize(report.description);
      const address = normalize(report.address ?? "");
      const reporter = normalize(
        report.reporter.name || report.reporter.email || ""
      );
      const officer = normalize(
        report.assignedOfficer?.name || report.assignedOfficer?.email || ""
      );
      const number = normalize(report.reportNumber);
      const category = normalize(categoryLabel(report.category));
      const status = normalize(statusLabel(report.status));
      const priority = normalize(priorityLabel(report.priority));

      for (const token of tokens) {
        if (number.includes(token)) score += 12;
        if (title.includes(token)) score += 8;
        if (description.includes(token)) score += 3;
        if (address.includes(token)) score += 5;
        if (reporter.includes(token)) score += 7;
        if (officer.includes(token)) score += 7;
        if (category.includes(token)) score += 2;
        if (status.includes(token)) score += 1;
        if (priority.includes(token)) score += 1;
      }

      return { report, score };
    })
    .filter((item) => item.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.report.createdAt.getTime() - a.report.createdAt.getTime()
    );

  return scored.slice(0, MAX_RELEVANT_REPORTS).map((item) => item.report);
}

export type ChatbotDatabaseSnapshot = {
  text: string;
  scope: ChatbotDbRole;
  totalReports: number;
  scopedReports: number;
};

export async function buildChatbotDatabaseContext(params: {
  user: ChatbotDbUser;
  question: string;
  reportNumber?: string | null;
}): Promise<ChatbotDatabaseSnapshot> {
  const { user } = params;
  const role = roleOf(user.role);
  const question = params.question || "";
  const reportNumber = params.reportNumber
    ? params.reportNumber.toUpperCase()
    : null;
  const now = new Date();
  const windows = startOfWindows(now);
  const where = scopeWhere(user);

  const [
    statusGroups,
    priorityGroups,
    categoryGroups,
    aiFlagGroups,
    totalReports,
    roleGroups,
    globalNotifications,
    scopedReports,
    reports,
    users,
    notifications,
    aiConfig,
    aiHistory,
    telegramTotal,
    telegramActive,
    telegramUsed,
    todayCount,
    weekCount,
    monthCount,
    yearCount,
  ] = await Promise.all([
    prisma.report.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.report.groupBy({ by: ["priority"], _count: { _all: true } }),
    prisma.report.groupBy({ by: ["category"], _count: { _all: true } }),
    prisma.report.groupBy({
      by: ["aiIsDuplicate", "aiAutoRejected"],
      _count: { _all: true },
    }),
    prisma.report.count(),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
    prisma.notification.count(),
    prisma.report.count({ where }),
    prisma.report.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: MAX_SNAPSHOT_REPORTS,
      select: reportOverviewSelect,
    }),
    role === "ADMIN"
      ? prisma.user.findMany({
          orderBy: [{ role: "asc" }, { name: "asc" }],
          take: MAX_SNAPSHOT_USERS,
          select: userOverviewSelect,
        })
      : Promise.resolve([]),
    role === "ADMIN"
      ? prisma.notification.findMany({
          orderBy: { createdAt: "desc" },
          take: MAX_SNAPSHOT_NOTIFICATIONS,
          select: notificationOverviewSelect,
        })
      : prisma.notification.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: MAX_SNAPSHOT_NOTIFICATIONS,
          select: notificationOverviewSelect,
        }),
    role === "ADMIN" ? getAiConfigAdminView() : Promise.resolve(null),
    role === "ADMIN" ? getAiConfigHistoryView(5) : Promise.resolve([]),
    role === "ADMIN" ? prisma.telegramlinktoken.count() : Promise.resolve(0),
    role === "ADMIN"
      ? prisma.telegramlinktoken.count({
          where: { usedAt: null, expiresAt: { gt: now } },
        })
      : Promise.resolve(0),
    role === "ADMIN"
      ? prisma.telegramlinktoken.count({ where: { usedAt: { not: null } } })
      : Promise.resolve(0),
    prisma.report.count({ where: { createdAt: { gte: windows.today } } }),
    prisma.report.count({ where: { createdAt: { gte: windows.week } } }),
    prisma.report.count({ where: { createdAt: { gte: windows.month } } }),
    prisma.report.count({ where: { createdAt: { gte: windows.year } } }),
  ]);

  const relevantReports = pickRelevantReports(reports, question, reportNumber);
  const relevantIds = relevantReports.map((report) => report.id);
  const [relevantHistory, relevantImages] =
    relevantIds.length > 0
      ? await Promise.all([
          prisma.reporthistory.findMany({
            where: { reportId: { in: relevantIds } },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              reportId: true,
              oldStatus: true,
              newStatus: true,
              notes: true,
              createdAt: true,
              user: { select: { id: true, name: true, email: true, role: true } },
            },
          }),
          prisma.reportimage.findMany({
            where: { reportId: { in: relevantIds } },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              reportId: true,
              type: true,
              createdAt: true,
              aiDescription: true,
              aiImageAnalyzedAt: true,
              aiImageConfidence: true,
              aiIsRelevant: true,
              aiPossibleDamage: true,
              aiSeverity: true,
              aiImageMatchTitle: true,
              aiRejectionReason: true,
            },
          }),
        ])
      : [[], []];

  const detailMap = new Map<string, DetailReport>();
  for (const report of relevantReports) {
    detailMap.set(report.id, {
      ...report,
      reportimage: relevantImages.filter((image) => image.reportId === report.id),
      reporthistory: relevantHistory.filter(
        (history) => history.reportId === report.id
      ),
    } as DetailReport);
  }

  const limit = Math.max(
    8_000,
    Number(process.env.CHATBOT_DB_CONTEXT_MAX_CHARS) ||
      DEFAULT_DB_CONTEXT_CHARS
  );
  const parts: string[] = [];
  let used = 0;

  const push = (block: string, required = false): boolean => {
    const value = block.trim();
    if (!value) return true;
    if (!required && used + value.length + 2 > limit) return false;
    parts.push(value);
    used += value.length + 2;
    return true;
  };

  push(
    [
      "=== SNAPSHOT DATABASE PELAPORAN FASILITAS ===",
      `Waktu snapshot: ${formatDateTime(now)}`,
      `Cakupan data: ${scopeLabel(role)}`,
      `Pengguna yang bertanya: ${user.name || user.email || "Pengguna"} (${roleLabel(
        role
      )}, ${user.email || "tanpa email"})`,
      relevantReports.length > 0
        ? `Laporan yang paling relevan dengan pertanyaan (detail lengkap): ${relevantReports
            .map((report) => report.reportNumber)
            .join(", ")}`
        : "Tidak ada laporan spesifik yang terdeteksi dari pertanyaan.",
    ].join("\n"),
    true
  );

  const statusCounts: Record<string, number> = {};
  for (const status of STATUS_VALUES) statusCounts[status] = 0;
  for (const group of statusGroups) statusCounts[group.status] = group._count._all;

  const priorityCounts: Record<string, number> = {};
  for (const priority of PRIORITY_VALUES) priorityCounts[priority] = 0;
  for (const group of priorityGroups) {
    priorityCounts[group.priority] = group._count._all;
  }

  const categoryCounts: Record<string, number> = {};
  for (const category of CATEGORY_VALUES) categoryCounts[category] = 0;
  for (const group of categoryGroups) {
    categoryCounts[group.category] = group._count._all;
  }

  const roleCounts: Record<string, number> = {};
  for (const roleValue of ROLE_VALUES) roleCounts[roleValue] = 0;
  for (const group of roleGroups) {
    roleCounts[group.role] = group._count._all;
  }

  const duplicateCount = aiFlagGroups
    .filter((group) => group.aiIsDuplicate === true)
    .reduce((sum, group) => sum + group._count._all, 0);
  const autoRejectedCount = aiFlagGroups
    .filter((group) => group.aiAutoRejected === true)
    .reduce((sum, group) => sum + group._count._all, 0);

  push(
    [
      "=== STATISTIK GLOBAL SISTEM (seluruh database) ===",
      `Total laporan: ${totalReports}`,
      `Per status: ${STATUS_VALUES.map(
        (status) => `${statusLabel(status)}=${statusCounts[status] ?? 0}`
      ).join(", ")}`,
      `Per prioritas: ${PRIORITY_VALUES.map(
        (priority) => `${priorityLabel(priority)}=${priorityCounts[priority] ?? 0}`
      ).join(", ")}`,
      `Per kategori: ${CATEGORY_VALUES.map(
        (category) => `${categoryLabel(category)}=${categoryCounts[category] ?? 0}`
      ).join(", ")}`,
      `Terindikasi duplikat: ${duplicateCount} | Ditolak otomatis: ${autoRejectedCount}`,
      `Waktu: hari ini=${todayCount}, minggu ini=${weekCount}, bulan ini=${monthCount}, tahun ini=${yearCount}`,
      `Pengguna: total=${Object.values(roleCounts).reduce(
        (sum, value) => sum + value,
        0
      )}, admin=${roleCounts.ADMIN ?? 0}, petugas=${roleCounts.PETUGAS ?? 0}, masyarakat=${
        roleCounts.MASYARAKAT ?? 0
      }`,
      `Notifikasi tersimpan: ${globalNotifications}`,
      role === "ADMIN"
        ? `Kode tautan Telegram: total=${telegramTotal}, aktif=${telegramActive}, sudah dipakai=${telegramUsed}`
        : "",
      `Data dalam cakupan pengguna ini: ${scopedReports} laporan.`,
    ]
      .filter(Boolean)
      .join("\n")
  );

  if (role === "ADMIN") {
    push(
      [
        "=== DIREKTORI PENGGUNA (seluruh akun) ===",
        users.length === 0
          ? "(tidak ada pengguna)"
          : users.map((item) => serializeUser(item)).join("\n"),
        users.length >= MAX_SNAPSHOT_USERS
          ? `Catatan: ditampilkan ${MAX_SNAPSHOT_USERS} pengguna pertama. Gunakan tool query_database entity=users untuk mencari pengguna lain.`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    );

    if (aiConfig) {
      push(
        [
          "=== KONFIGURASI AI (API key hanya masking, tidak pernah mentah) ===",
          `Model teks: provider=${aiConfig.text.provider}, baseUrl=${aiConfig.text.baseUrl}, model=${aiConfig.text.model}, key=${aiConfig.text.maskedKey || "(kosong)"}, sumber=${aiConfig.text.keySource}`,
          `Model vision: provider=${aiConfig.vision.provider}, baseUrl=${aiConfig.vision.baseUrl}, model=${aiConfig.vision.model}, key=${aiConfig.vision.maskedKey || "(kosong)"}, sumber=${aiConfig.vision.keySource}`,
          `Diperbarui: ${aiConfig.updatedAt || "-"} oleh ${aiConfig.updatedByEmail || "-"}`,
          aiHistory.length > 0
            ? `Riwayat konfigurasi terbaru: ${aiHistory
                .map(
                  (item) =>
                    `${item.createdAt} (${item.textModel}, ${item.textKeySource}, aktif=${item.isActive})`
                )
                .join("; ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      );
    }
  }

  push(
    [
      "=== NOTIFIKASI ===",
      notifications.length === 0
        ? "(tidak ada notifikasi)"
        : notifications.map((item) => serializeNotification(item)).join("\n"),
      notifications.length >= MAX_SNAPSHOT_NOTIFICATIONS
        ? `Catatan: ditampilkan ${MAX_SNAPSHOT_NOTIFICATIONS} notifikasi terbaru. Gunakan tool query_database entity=notifications untuk data lain.`
        : "",
    ]
      .filter(Boolean)
      .join("\n")
  );

  if (relevantReports.length > 0) {
    push("=== DETAIL LENGKAP LAPORAN YANG RELEVAN DENGAN PERTANYAAN ===");
    for (const report of relevantReports) {
      const detail = detailMap.get(report.id);
      if (!detail) continue;
      if (!push(serializeReportDetail(detail, true))) break;
    }
  }

  const detailedIds = new Set(relevantReports.map((report) => report.id));
  const remainingReports = reports.filter((report) => !detailedIds.has(report.id));
  const overviewBlocks: string[] = [
    "=== DAFTAR LAPORAN DALAM CAKUPAN (ringkas) ===",
    `Total dalam cakupan: ${scopedReports}.`,
  ];
  let overviewUsed = overviewBlocks.join("\n\n").length;
  let overviewAdded = 0;

  for (const report of remainingReports) {
    const block = serializeReportOverview(report);
    if (used + overviewUsed + block.length + 2 > limit) break;
    overviewBlocks.push(block);
    overviewUsed += block.length + 2;
    overviewAdded += 1;
  }

  overviewBlocks[1] = `Total dalam cakupan: ${scopedReports}. Ditampilkan: ${overviewAdded} dari ${remainingReports.length} laporan.`;

  // Blok overview dimasukkan setelah detail. Jika budget sudah habis, header
  // overview tetap dimuat agar model tahu masih ada data lain.
  push(overviewBlocks.join("\n\n"));

  push(
    [
      "=== SKEMA & PENGETAHUAN DATABASE ===",
      SCHEMA_TEXT,
      reports.length >= MAX_SNAPSHOT_REPORTS
        ? `Catatan: snapshot mengambil ${MAX_SNAPSHOT_REPORTS} laporan terbaru. Gunakan tool query_database untuk mencari laporan yang lebih lama atau memfilter berdasarkan status/kategori/tanggal/pelapor/petugas.`
        : "",
      overviewAdded < remainingReports.length
        ? `Catatan: sebagian laporan tidak dimuat karena batas konteks. Gunakan tool query_database entity=reports dengan filter/pencarian untuk mengambil data yang belum tampil.`
        : "",
      "Gunakan tool query_database bila membutuhkan data yang belum ada di snapshot. Jangan mengarang data.",
    ]
      .filter(Boolean)
      .join("\n")
  );

  return {
    text: parts.join("\n\n"),
    scope: role,
    totalReports,
    scopedReports,
  };
}

export const CHATBOT_DATABASE_TOOL: ChatTool = {
  type: "function",
  function: {
    name: "query_database",
    description:
      "Membaca data langsung dari database aplikasi Pelaporan Fasilitas. Gunakan untuk mencari laporan, detail laporan, pengguna, riwayat, foto, notifikasi, statistik, konfigurasi AI, status Telegram, atau skema database. Hak akses peran selalu diterapkan oleh server. Jangan mengarang data jika tool mengembalikan kosong.",
    parameters: {
      type: "object",
      properties: {
        entity: {
          type: "string",
          enum: [
            "reports",
            "report_detail",
            "users",
            "user_detail",
            "notifications",
            "statistics",
            "ai_config",
            "telegram",
            "schema",
            "summary",
          ],
          description:
            "Jenis data yang dibaca: reports (cari/daftar laporan), report_detail (satu laporan lengkap dengan riwayat/foto), users (daftar pengguna, admin), user_detail (profil + laporan + notifikasi pengguna), notifications, statistics, ai_config (admin), telegram, schema, summary.",
        },
        search: {
          type: "string",
          description:
            "Kata kunci bebas untuk mencari judul, deskripsi, alamat, nomor laporan, nama/email pelapor atau petugas.",
        },
        reportNumber: {
          type: "string",
          description: "Nomor laporan persis, mis. REP-20261112-1234.",
        },
        status: {
          type: "array",
          items: { type: "string", enum: STATUS_VALUES },
          description: "Filter status laporan (boleh lebih dari satu).",
        },
        priority: {
          type: "array",
          items: { type: "string", enum: PRIORITY_VALUES },
          description: "Filter prioritas laporan.",
        },
        category: {
          type: "array",
          items: { type: "string", enum: CATEGORY_VALUES },
          description: "Filter kategori laporan.",
        },
        role: {
          type: "string",
          enum: ROLE_VALUES,
          description: "Filter peran untuk entity users (admin).",
        },
        reporter: {
          type: "string",
          description: "Filter nama/email pelapor laporan.",
        },
        officer: {
          type: "string",
          description: "Filter nama/email petugas yang ditugaskan.",
        },
        dateFrom: {
          type: "string",
          description: "Tanggal awal filter, format YYYY-MM-DD.",
        },
        dateTo: {
          type: "string",
          description: "Tanggal akhir filter, format YYYY-MM-DD.",
        },
        unreadOnly: {
          type: "boolean",
          description: "Untuk notifications: hanya notifikasi belum dibaca.",
        },
        groupBy: {
          type: "string",
          enum: ["status", "priority", "category", "officer", "reporter", "month", "day"],
          description: "Untuk statistics: kelompokkan jumlah laporan.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_TOOL_ROWS,
          description: "Jumlah baris maksimum yang dikembalikan (1-100).",
        },
      },
      required: ["entity"],
    },
  },
};

function relationSearch(value: string): Prisma.userWhereInput {
  return {
    OR: [
      { name: { contains: value } },
      { email: { contains: value } },
      { phone: { contains: value } },
    ],
  };
}

function buildReportWhere(
  user: ChatbotDbUser,
  input: Record<string, unknown>
): Prisma.reportWhereInput {
  const where: Prisma.reportWhereInput = { ...scopeWhere(user) };
  const search = readString(input.search ?? input.q, 200);
  const reportNumber = readString(input.reportNumber, 40);

  if (reportNumber) {
    where.reportNumber = { contains: reportNumber.toUpperCase() };
  }

  if (search) {
    where.OR = [
      { reportNumber: { contains: search } },
      { title: { contains: search } },
      { description: { contains: search } },
      { address: { contains: search } },
      { reporter: { is: relationSearch(search) } },
      { assignedOfficer: { is: relationSearch(search) } },
    ];
  }

  const statuses = filterEnums(input.status, STATUS_VALUES);
  if (statuses.length > 0) where.status = { in: statuses };

  const priorities = filterEnums(input.priority, PRIORITY_VALUES);
  if (priorities.length > 0) where.priority = { in: priorities };

  const categories = filterEnums(input.category, CATEGORY_VALUES);
  if (categories.length > 0) where.category = { in: categories };

  const reporter = readString(input.reporter, 120);
  if (reporter) where.reporter = { is: relationSearch(reporter) };

  const officer = readString(input.officer, 120);
  if (officer) where.assignedOfficer = { is: relationSearch(officer) };

  const dateFrom = parseDate(input.dateFrom);
  const dateTo = parseDate(input.dateTo, true);
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  return where;
}

function toolReport(report: OverviewReport, withDescription = true): Record<string, unknown> {
  return {
    reportNumber: report.reportNumber,
    title: report.title,
    ...(withDescription ? { description: report.description } : {}),
    category: categoryLabel(report.category),
    priority: priorityLabel(report.priority),
    status: statusLabel(report.status),
    address: report.address,
    latitude: report.latitude,
    longitude: report.longitude,
    reporter: report.reporter.name || report.reporter.email || null,
    reporterEmail: report.reporter.email,
    assignedOfficer:
      report.assignedOfficer?.name || report.assignedOfficer?.email || null,
    assignedOfficerEmail: report.assignedOfficer?.email ?? null,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    verifiedAt: report.verifiedAt?.toISOString() ?? null,
    completedAt: report.completedAt?.toISOString() ?? null,
    imageCount: report._count.reportimage,
    historyCount: report._count.reporthistory,
    ai: {
      analyzedAt: report.aiAnalyzedAt?.toISOString() ?? null,
      category: report.aiCategory ? categoryLabel(report.aiCategory) : null,
      priority: report.aiPriority ? priorityLabel(report.aiPriority) : null,
      confidence: report.aiConfidence,
      reason: report.aiReason,
      isDuplicate: Boolean(report.aiIsDuplicate),
      duplicateOfId: report.aiDuplicateOfId,
      duplicateReason: report.aiDuplicateReason,
      autoRejected: Boolean(report.aiAutoRejected),
      rejectionReason: report.aiRejectionReason,
    },
  };
}

function toolReportDetail(report: DetailReport): Record<string, unknown> {
  return {
    ...toolReport(report, true),
    images: report.reportimage.map((image) => ({
      type: image.type,
      createdAt: image.createdAt.toISOString(),
      description: image.aiDescription,
      analyzedAt: image.aiImageAnalyzedAt?.toISOString() ?? null,
      confidence: image.aiImageConfidence,
      isRelevant: image.aiIsRelevant,
      possibleDamage: image.aiPossibleDamage,
      severity: image.aiSeverity,
      matchesTitle: image.aiImageMatchTitle,
      rejectionReason: image.aiRejectionReason,
    })),
    history: report.reporthistory.map((history) => ({
      oldStatus: statusLabel(history.oldStatus),
      newStatus: statusLabel(history.newStatus),
      notes: cleanHistoryNotes(history.notes),
      actor: isSystemActorNote(history.notes)
        ? "Sistem AI"
        : history.user.name || history.user.email || "Sistem",
      actorRole: history.user.role,
      createdAt: history.createdAt.toISOString(),
    })),
  };
}

async function executeReportsQuery(
  user: ChatbotDbUser,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const limit = readLimit(input.limit, 25);
  const where = buildReportWhere(user, input);
  const [total, rows] = await Promise.all([
    prisma.report.count({ where }),
    prisma.report.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: reportOverviewSelect,
    }),
  ]);

  return {
    ok: true,
    entity: "reports",
    total,
    returned: rows.length,
    reports: rows.map((report) => toolReport(report)),
  };
}

async function executeReportDetailQuery(
  user: ChatbotDbUser,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const reportNumber = readString(input.reportNumber, 40).toUpperCase();
  const search = readString(input.search, 200);
  const where: Prisma.reportWhereInput = { ...scopeWhere(user) };

  if (reportNumber) {
    where.reportNumber = reportNumber;
  } else if (search) {
    where.OR = [
      { reportNumber: { contains: search } },
      { title: { contains: search } },
      { description: { contains: search } },
      { address: { contains: search } },
    ];
  } else {
    return {
      ok: false,
      error:
        "Sebutkan reportNumber atau search untuk mengambil detail laporan.",
    };
  }

  const report = await prisma.report.findFirst({
    where,
    orderBy: { createdAt: "desc" },
    select: reportDetailSelect,
  });

  if (!report) {
    return {
      ok: false,
      error:
        "Laporan tidak ditemukan atau bukan hak akses pengguna ini. Jangan mengarang detailnya.",
    };
  }

  return { ok: true, entity: "report_detail", report: toolReportDetail(report) };
}

async function executeUsersQuery(
  user: ChatbotDbUser,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const role = roleOf(user.role);
  const limit = readLimit(input.limit, 50);
  const search = readString(input.search, 120);
  const roleFilter = filterEnums(input.role, ROLE_VALUES);

  const where: Prisma.userWhereInput =
    role === "ADMIN"
      ? {
          ...(search ? relationSearch(search) : {}),
          ...(roleFilter.length > 0 ? { role: { in: roleFilter } } : {}),
        }
      : { id: user.id };

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ role: "asc" }, { name: "asc" }],
      take: limit,
      select: userOverviewSelect,
    }),
  ]);

  return {
    ok: true,
    entity: "users",
    total,
    returned: rows.length,
    users: rows.map((item) => ({
      id: item.id,
      name: item.name,
      email: item.email,
      role: roleLabel(roleOf(item.role)),
      phone: item.phone,
      address: item.address,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      telegramLinked: Boolean(item.telegramChatId),
      telegramUsername: item.telegramUsername,
      telegramEnabled: item.telegramEnabled,
      telegramLinkedAt: item.telegramLinkedAt?.toISOString() ?? null,
      reportCount: item._count.reportsReported,
      assignedCount: item._count.reportsAssigned,
      notificationCount: item._count.notification,
      historyCount: item._count.reporthistory,
    })),
  };
}

async function executeUserDetailQuery(
  user: ChatbotDbUser,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const currentRole = roleOf(user.role);
  const search = readString(input.search, 120);
  const where: Prisma.userWhereInput =
    currentRole === "ADMIN"
      ? search
        ? relationSearch(search)
        : { id: user.id }
      : { id: user.id };

  const target = await prisma.user.findFirst({
    where,
    orderBy: { createdAt: "asc" },
    select: userOverviewSelect,
  });

  if (!target) {
    return {
      ok: false,
      error:
        "Pengguna tidak ditemukan atau bukan hak akses pengguna ini. Jangan mengarang datanya.",
    };
  }

  const reportScope: Prisma.reportWhereInput =
    currentRole === "ADMIN"
      ? target.role === "PETUGAS"
        ? { assignedOfficerId: target.id }
        : target.role === "MASYARAKAT"
          ? { reporterId: target.id }
          : { OR: [{ reporterId: target.id }, { assignedOfficerId: target.id }] }
      : scopeWhere(user);

  const [reports, notifications] = await Promise.all([
    prisma.report.findMany({
      where: reportScope,
      orderBy: { createdAt: "desc" },
      take: 20,
      select: reportOverviewSelect,
    }),
    prisma.notification.findMany({
      where: { userId: target.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: notificationOverviewSelect,
    }),
  ]);

  return {
    ok: true,
    entity: "user_detail",
    user: {
      id: target.id,
      name: target.name,
      email: target.email,
      role: roleLabel(roleOf(target.role)),
      phone: target.phone,
      address: target.address,
      createdAt: target.createdAt.toISOString(),
      telegramLinked: Boolean(target.telegramChatId),
      telegramUsername: target.telegramUsername,
      telegramEnabled: target.telegramEnabled,
      telegramLinkedAt: target.telegramLinkedAt?.toISOString() ?? null,
      reportCount: target._count.reportsReported,
      assignedCount: target._count.reportsAssigned,
      notificationCount: target._count.notification,
      historyCount: target._count.reporthistory,
    },
    reports: reports.map((report) => toolReport(report)),
    notifications: notifications.map((item) => ({
      title: item.title,
      message: item.message,
      isRead: item.isRead,
      createdAt: item.createdAt.toISOString(),
      reportNumber: item.report?.reportNumber ?? null,
      reportTitle: item.report?.title ?? null,
      reportStatus: item.report ? statusLabel(item.report.status) : null,
      telegramSent: item.telegramSent,
    })),
  };
}

async function executeNotificationsQuery(
  user: ChatbotDbUser,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const role = roleOf(user.role);
  const limit = readLimit(input.limit, 30);
  const search = readString(input.search, 120);
  const unreadOnly = readBoolean(input.unreadOnly);

  const where: Prisma.notificationWhereInput = {};
  if (role !== "ADMIN") {
    where.userId = user.id;
  } else if (search) {
    where.user = { is: relationSearch(search) };
  }

  if (unreadOnly === true) where.isRead = false;
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { message: { contains: search } },
      { report: { is: { reportNumber: { contains: search } } } },
      { report: { is: { title: { contains: search } } } },
    ];
  }

  const dateFrom = parseDate(input.dateFrom);
  const dateTo = parseDate(input.dateTo, true);
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  const [total, rows] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: notificationOverviewSelect,
    }),
  ]);

  return {
    ok: true,
    entity: "notifications",
    total,
    returned: rows.length,
    notifications: rows.map((item) => ({
      id: item.id,
      title: item.title,
      message: item.message,
      isRead: item.isRead,
      createdAt: item.createdAt.toISOString(),
      telegramSent: item.telegramSent,
      telegramSentAt: item.telegramSentAt?.toISOString() ?? null,
      reportNumber: item.report.reportNumber,
      reportTitle: item.report.title,
      reportStatus: statusLabel(item.report.status),
      recipient: item.user.name || item.user.email,
      recipientRole: roleLabel(roleOf(item.user.role)),
    })),
  };
}

async function executeStatisticsQuery(
  user: ChatbotDbUser,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const groupBy = readString(input.groupBy, 20).toLowerCase() || "status";
  const where = buildReportWhere(user, input);
  const total = await prisma.report.count({ where });

  if (groupBy === "status") {
    const rows = await prisma.report.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    });
    return {
      ok: true,
      entity: "statistics",
      groupBy,
      total,
      groups: rows.map((row) => ({
        label: statusLabel(row.status),
        value: row.status,
        count: row._count._all,
      })),
    };
  }

  if (groupBy === "priority") {
    const rows = await prisma.report.groupBy({
      by: ["priority"],
      where,
      _count: { _all: true },
    });
    return {
      ok: true,
      entity: "statistics",
      groupBy,
      total,
      groups: rows.map((row) => ({
        label: priorityLabel(row.priority),
        value: row.priority,
        count: row._count._all,
      })),
    };
  }

  if (groupBy === "category") {
    const rows = await prisma.report.groupBy({
      by: ["category"],
      where,
      _count: { _all: true },
    });
    return {
      ok: true,
      entity: "statistics",
      groupBy,
      total,
      groups: rows.map((row) => ({
        label: categoryLabel(row.category),
        value: row.category,
        count: row._count._all,
      })),
    };
  }

  if (groupBy === "officer") {
    const rows = await prisma.report.groupBy({
      by: ["assignedOfficerId"],
      where: { ...where, assignedOfficerId: { not: null } },
      _count: { _all: true },
    });
    const ids = rows
      .map((row) => row.assignedOfficerId)
      .filter((id): id is string => Boolean(id));
    const officers = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true },
    });
    return {
      ok: true,
      entity: "statistics",
      groupBy,
      total,
      groups: rows.map((row) => {
        const officer = officers.find((item) => item.id === row.assignedOfficerId);
        return {
          label: officer?.name || officer?.email || "Tidak diketahui",
          value: row.assignedOfficerId,
          count: row._count._all,
        };
      }),
    };
  }

  if (groupBy === "reporter") {
    const rows = await prisma.report.groupBy({
      by: ["reporterId"],
      where,
      _count: { _all: true },
    });
    const ids = rows.map((row) => row.reporterId);
    const reporters = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true },
    });
    return {
      ok: true,
      entity: "statistics",
      groupBy,
      total,
      groups: rows.map((row) => {
        const reporter = reporters.find((item) => item.id === row.reporterId);
        return {
          label: reporter?.name || reporter?.email || "Tidak diketahui",
          value: row.reporterId,
          count: row._count._all,
        };
      }),
    };
  }

  const reports = await prisma.report.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: 5000,
    select: { createdAt: true },
  });
  const groups = new Map<string, number>();
  for (const report of reports) {
    const key =
      groupBy === "day"
        ? report.createdAt.toISOString().slice(0, 10)
        : report.createdAt.toISOString().slice(0, 7);
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }

  return {
    ok: true,
    entity: "statistics",
    groupBy: groupBy === "day" ? "day" : "month",
    total,
    groups: Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, count]) => ({ label, value: label, count })),
  };
}

async function executeTelegramQuery(
  user: ChatbotDbUser,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const role = roleOf(user.role);
  const now = new Date();
  const limit = readLimit(input.limit, 20);

  if (role === "ADMIN") {
    const [total, active, used, tokens] = await Promise.all([
      prisma.telegramlinktoken.count(),
      prisma.telegramlinktoken.count({
        where: { usedAt: null, expiresAt: { gt: now } },
      }),
      prisma.telegramlinktoken.count({ where: { usedAt: { not: null } } }),
      prisma.telegramlinktoken.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          token: true,
          createdAt: true,
          expiresAt: true,
          usedAt: true,
          phone: true,
          user: { select: { name: true, email: true, role: true } },
        },
      }),
    ]);

    return {
      ok: true,
      entity: "telegram",
      total,
      active,
      used,
      expired: Math.max(0, total - active - used),
      tokens: tokens.map((item) => ({
        token:
          item.token.length > 8
            ? `${item.token.slice(0, 4)}…${item.token.slice(-4)}`
            : "…",
        user: item.user.name || item.user.email,
        role: roleLabel(roleOf(item.user.role)),
        phone: item.phone,
        createdAt: item.createdAt.toISOString(),
        expiresAt: item.expiresAt.toISOString(),
        usedAt: item.usedAt?.toISOString() ?? null,
      })),
    };
  }

  const [total, active, used] = await Promise.all([
    prisma.telegramlinktoken.count({ where: { userId: user.id } }),
    prisma.telegramlinktoken.count({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: now } },
    }),
    prisma.telegramlinktoken.count({
      where: { userId: user.id, usedAt: { not: null } },
    }),
  ]);

  return {
    ok: true,
    entity: "telegram",
    total,
    active,
    used,
    expired: Math.max(0, total - active - used),
    note: "Hanya kode tautan milik pengguna ini yang dihitung.",
  };
}

export async function executeChatbotDatabaseQuery(
  user: ChatbotDbUser,
  rawArgs: unknown
): Promise<Record<string, unknown>> {
  let input: Record<string, unknown>;
  if (typeof rawArgs === "string") {
    try {
      input = JSON.parse(rawArgs || "{}") as Record<string, unknown>;
    } catch {
      return { ok: false, error: "Argumen tool bukan JSON yang valid." };
    }
  } else if (rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)) {
    input = rawArgs as Record<string, unknown>;
  } else {
    return { ok: false, error: "Argumen tool tidak valid." };
  }

  const entity = readString(input.entity ?? input.action, 40).toLowerCase();
  const role = roleOf(user.role);

  try {
    switch (entity) {
      case "reports":
      case "report":
        return await executeReportsQuery(user, input);
      case "report_detail":
      case "reportdetail":
        return await executeReportDetailQuery(user, input);
      case "users":
      case "user":
        return await executeUsersQuery(user, input);
      case "user_detail":
      case "userdetail":
        return await executeUserDetailQuery(user, input);
      case "notifications":
      case "notification":
        return await executeNotificationsQuery(user, input);
      case "statistics":
      case "stats":
        return await executeStatisticsQuery(user, input);
      case "ai_config":
      case "aiconfig":
        if (role !== "ADMIN") {
          return {
            ok: false,
            error: "Konfigurasi AI hanya dapat dibaca oleh admin.",
          };
        }
        return {
          ok: true,
          entity: "ai_config",
          config: await getAiConfigAdminView(),
          history: await getAiConfigHistoryView(10),
        };
      case "telegram":
        return await executeTelegramQuery(user, input);
      case "schema":
        return { ok: true, entity: "schema", schema: SCHEMA_TEXT };
      case "summary":
        return await executeSummaryQuery(user);
      default:
        return {
          ok: false,
          error: `Entity tidak dikenal: ${entity || "(kosong)"}. Gunakan salah satu: reports, report_detail, users, user_detail, notifications, statistics, ai_config, telegram, schema, summary.`,
        };
    }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Gagal membaca database.",
    };
  }
}

async function executeSummaryQuery(
  user: ChatbotDbUser
): Promise<Record<string, unknown>> {
  const where = scopeWhere(user);
  const [totalReports, scopedReports, statusGroups, priorityGroups, categoryGroups] =
    await Promise.all([
      prisma.report.count(),
      prisma.report.count({ where }),
      prisma.report.groupBy({ by: ["status"], where, _count: { _all: true } }),
      prisma.report.groupBy({ by: ["priority"], where, _count: { _all: true } }),
      prisma.report.groupBy({ by: ["category"], where, _count: { _all: true } }),
    ]);

  return {
    ok: true,
    entity: "summary",
    role: roleLabel(roleOf(user.role)),
    totalReportsInSystem: totalReports,
    reportsInScope: scopedReports,
    status: statusGroups.map((row) => ({
      label: statusLabel(row.status),
      count: row._count._all,
    })),
    priority: priorityGroups.map((row) => ({
      label: priorityLabel(row.priority),
      count: row._count._all,
    })),
    category: categoryGroups.map((row) => ({
      label: categoryLabel(row.category),
      count: row._count._all,
    })),
  };
}

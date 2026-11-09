import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { escapeHtml, sendTelegramMessage } from "@/lib/telegram";
import { statusLabel } from "@/lib/report-utils";

type TelegramUpdate = {
  message?: {
    chat?: { id?: number | string };
    from?: { username?: string; first_name?: string };
    text?: string;
  };
};

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function helpText(linked: boolean): string {
  const lines = [
    "🤖 <b>Bot Pelaporan Fasilitas</b>",
    "",
    "<b>Perintah tersedia:</b>",
    "/status - ringkasan akun & laporan",
    "/laporan - 5 laporan terbaru",
    "/cek &lt;nomor&gt; - cek status laporan",
    "/lapor - buka formulir laporan",
    "/bantuan - tampilkan bantuan ini",
  ];
  if (!linked) {
    lines.push(
      "",
      `Akun Telegram Anda belum tertaut. Buka <a href="${appUrl()}/pengaturan/telegram">Pengaturan Telegram</a> untuk mendapatkan kode tautan.`
    );
  }
  return lines.join("\n");
}

function reportLink(
  role: string,
  reportId: string
): string {
  if (role === "ADMIN") return `${appUrl()}/admin/laporan/${reportId}`;
  if (role === "PETUGAS") return `${appUrl()}/petugas/tugas/${reportId}`;
  return `${appUrl()}/masyarakat/laporan/${reportId}`;
}

async function handleStart(
  chatId: string,
  token: string,
  username: string | null
): Promise<string> {
  const tokenRow = await prisma.telegramlinktoken.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          telegramChatId: true,
        },
      },
    },
  });

  const linkedName =
    tokenRow?.user.name || tokenRow?.user.email || "pengguna";

  // Klik/ kirim /start dua kali: jangan tampilkan error jika sudah tertaut.
  if (tokenRow?.user.telegramChatId === chatId) {
    return [
      "✅ <b>Akun Telegram ini sudah tertaut.</b>",
      "",
      `Terhubung dengan ${escapeHtml(linkedName)}.`,
      "Ketik /bantuan untuk melihat perintah.",
    ].join("\n");
  }

  if (!tokenRow || tokenRow.usedAt || tokenRow.expiresAt.getTime() < Date.now()) {
    return [
      "❌ <b>Kode tautan tidak valid atau sudah kedaluwarsa.</b>",
      "",
      `Buka <a href="${appUrl()}/pengaturan/telegram">Pengaturan Telegram</a> untuk membuat kode baru.`,
    ].join("\n");
  }

  await prisma.$transaction(async (tx) => {
    // Pastikan satu chat hanya tertaut ke satu akun.
    await tx.user.updateMany({
      where: { telegramChatId: chatId, id: { not: tokenRow.userId } },
      data: {
        telegramChatId: null,
        telegramLinkedAt: null,
        telegramUsername: null,
      },
    });

    await tx.user.update({
      where: { id: tokenRow.userId },
      data: {
        telegramChatId: chatId,
        telegramLinkedAt: new Date(),
        telegramUsername: username,
        ...(tokenRow.phone ? { phone: tokenRow.phone } : {}),
      },
    });

    await tx.telegramlinktoken.update({
      where: { token },
      data: { usedAt: new Date() },
    });
  });

  const name =
    tokenRow.user.name || tokenRow.user.email || "pengguna";

  return [
    "✅ <b>Akun berhasil ditautkan!</b>",
    "",
    `Halo ${escapeHtml(name)}, Anda akan menerima notifikasi laporan di chat ini.`,
    "",
    "Ketik /bantuan untuk melihat perintah yang tersedia.",
  ].join("\n");
}

async function handleCommand(
  chatId: string,
  text: string,
  username: string | null
): Promise<string> {
  const parts = text.split(/\s+/).filter(Boolean);
  const command = (parts[0] || "").toLowerCase().split("@")[0];
  const payload = parts.slice(1).join(" ").trim();

  if (command === "/start") {
    if (payload) return handleStart(chatId, payload, username);
    return helpText(false);
  }

  const user = await prisma.user.findFirst({
    where: { telegramChatId: chatId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      telegramEnabled: true,
    },
  });

  if (!user) {
    return helpText(false);
  }

  const reportWhere =
    user.role === "PETUGAS"
      ? { assignedOfficerId: user.id }
      : user.role === "ADMIN"
        ? {}
        : { reporterId: user.id };

  if (command === "/status") {
    const [total, active] = await Promise.all([
      prisma.report.count({ where: reportWhere }),
      prisma.report.count({
        where: {
          ...reportWhere,
          status: { in: ["DIAJUKAN", "DIVERIFIKASI", "DITUGASKAN", "DIPROSES"] },
        },
      }),
    ]);

    return [
      "👤 <b>Status Akun</b>",
      "",
      `Nama: ${escapeHtml(user.name || "-")}`,
      `Email: ${escapeHtml(user.email || "-")}`,
      `Peran: ${escapeHtml(user.role)}`,
      `Notifikasi Telegram: ${
        user.telegramEnabled ? "aktif" : "nonaktif"
      }`,
      "",
      `Total laporan: ${total}`,
      `Sedang berjalan: ${active}`,
    ].join("\n");
  }

  if (command === "/laporan" || command === "/laporanku") {
    const reports = await prisma.report.findMany({
      where: reportWhere,
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        reportNumber: true,
        title: true,
        status: true,
      },
    });

    if (reports.length === 0) {
      return "📭 Belum ada laporan. Ketik /lapor untuk membuat laporan baru.";
    }

    const lines = ["📋 <b>5 Laporan Terbaru</b>", ""];
    reports.forEach((report, index) => {
      lines.push(
        `${index + 1}. <b>${escapeHtml(report.reportNumber)}</b> — ${escapeHtml(
          statusLabel(report.status)
        )}`,
        `   ${escapeHtml(report.title)}`,
        `   <a href="${reportLink(user.role, report.id)}">Lihat detail</a>`
      );
    });
    return lines.join("\n");
  }

  if (command === "/cek") {
    if (!payload) {
      return "Format: <code>/cek REP-20260101-1234</code>";
    }

    const report = await prisma.report.findFirst({
      where: {
        reportNumber: payload.toUpperCase(),
        ...(user.role === "ADMIN"
          ? {}
          : user.role === "PETUGAS"
            ? { assignedOfficerId: user.id }
            : { reporterId: user.id }),
      },
      select: {
        id: true,
        reportNumber: true,
        title: true,
        status: true,
        updatedAt: true,
      },
    });

    if (!report) {
      return `❌ Laporan <code>${escapeHtml(
        payload
      )}</code> tidak ditemukan untuk akun Anda.`;
    }

    return [
      `📄 <b>${escapeHtml(report.reportNumber)}</b>`,
      escapeHtml(report.title),
      "",
      `Status: <b>${escapeHtml(statusLabel(report.status))}</b>`,
      `Diperbarui: ${report.updatedAt.toLocaleString("id-ID")}`,
      "",
      `<a href="${reportLink(user.role, report.id)}">Lihat detail</a>`,
    ].join("\n");
  }

  if (command === "/lapor") {
    return [
      "📝 <b>Buat Laporan Baru</b>",
      "",
      `Buka formulir berikut untuk melaporkan kerusakan fasilitas:`,
      `<a href="${appUrl()}/masyarakat/laporan/buat">${appUrl()}/masyarakat/laporan/buat</a>`,
    ].join("\n");
  }

  return helpText(true);
}

export async function POST(request: NextRequest) {
  const secret = (process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  if (
    secret &&
    request.headers.get("x-telegram-bot-api-secret-token") !== secret
  ) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as
    | TelegramUpdate
    | null;

  const message = update?.message;
  const chatIdRaw = message?.chat?.id;
  if (!message || chatIdRaw === undefined || chatIdRaw === null) {
    return NextResponse.json({ ok: true });
  }

  const chatId = String(chatIdRaw);
  const text = (message.text || "").trim();
  const username = message.from?.username || null;

  if (text) {
    try {
      const reply = await handleCommand(chatId, text, username);
      if (reply) {
        await sendTelegramMessage(chatId, reply);
      }
    } catch (error) {
      console.error("Gagal memproses perintah Telegram:", error);
    }
  }

  return NextResponse.json({ ok: true });
}

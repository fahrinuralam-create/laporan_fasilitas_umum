import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { escapeHtml, sendTelegramMessage } from "@/lib/telegram";
import { statusLabel } from "@/lib/report-utils";
import { generateChatbotReply } from "@/lib/chatbot";
import {
  confirmTelegramIdentity,
  hashTelegramToken,
} from "@/lib/telegram-link";
import { normalizePhoneNumber } from "@/lib/phone";

// Pesan bebas diproses oleh SiLapor yang dapat memanggil model AI + database.
export const maxDuration = 60;

type TelegramUpdate = {
  message?: {
    chat?: { id?: number | string };
    from?: { id?: number; username?: string; first_name?: string };
    text?: string;
    contact?: {
      phone_number?: string;
      first_name?: string;
      user_id?: number;
    };
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
    "",
    "Anda juga bisa bertanya dengan kalimat biasa, misalnya:",
    "berapa laporan saya?",
    "tampilkan laporan kategori jalan",
    "siapa petugas untuk laporan REP-...",
    "berapa pengguna terdaftar?",
  ];
  if (!linked) {
    lines.push(
      "",
      `Akun Telegram Anda belum aktif. Simpan nomor HP di <a href="${appUrl()}/pengaturan/telegram">Pengaturan Telegram</a>, tunggu persetujuan admin/petugas, lalu buka tautan konfirmasi dari halaman tersebut.`
    );
  }
  return lines.join("\n");
}

function reportLink(role: string, reportId: string): string {
  if (role === "ADMIN") return `${appUrl()}/admin/laporan/${reportId}`;
  if (role === "PETUGAS") return `${appUrl()}/petugas/tugas/${reportId}`;
  return `${appUrl()}/masyarakat/laporan/${reportId}`;
}

const CONTACT_KEYBOARD = {
  keyboard: [
    [{ text: "Bagikan Nomor HP", request_contact: true }],
    [{ text: "/bantuan" }],
  ],
  resize_keyboard: true,
  one_time_keyboard: true,
};

async function handleStart(
  chatId: string,
  token: string,
  username: string | null,
  fromId: string
): Promise<{ text: string; replyMarkup?: unknown }> {
  const request = await prisma.telegramlinkrequest.findUnique({
    where: { tokenHash: hashTelegramToken(token) },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phoneNormalized: true,
        },
      },
    },
  });

  if (!request) {
    return {
      text: [
        "❌ <b>Kode konfirmasi tidak valid atau sudah kedaluwarsa.</b>",
        "",
        `Buka <a href="${appUrl()}/pengaturan/telegram">Pengaturan Telegram</a> untuk membuat kode baru.`,
      ].join("\n"),
    };
  }

  const linkedName = request.user.name || request.user.email || "pengguna";

  if (
    request.status === "ACTIVE" &&
    request.telegramChatId === chatId
  ) {
    return {
      text: [
        "✅ <b>Akun Telegram ini sudah aktif.</b>",
        "",
        `Terhubung dengan ${escapeHtml(linkedName)}.`,
        "Ketik /bantuan untuk melihat perintah.",
      ].join("\n"),
    };
  }

  if (
    request.confirmedAt &&
    request.telegramChatId === chatId &&
    request.status === "PENDING_ADMIN"
  ) {
    return {
      text: [
        "✅ <b>Identitas Telegram sudah dikonfirmasi.</b>",
        "",
        "Pengajuan masih menunggu persetujuan admin/petugas. Koneksi akan aktif setelah disetujui.",
      ].join("\n"),
    };
  }

  if (request.tokenUsedAt) {
    return {
      text: [
        "❌ <b>Kode konfirmasi sudah pernah digunakan.</b>",
        "",
        `Buka <a href="${appUrl()}/pengaturan/telegram">Pengaturan Telegram</a> untuk membuat kode baru.`,
      ].join("\n"),
    };
  }

  if (
    !request.tokenExpiresAt ||
    request.tokenExpiresAt.getTime() < Date.now()
  ) {
    await prisma.telegramlinkrequest.updateMany({
      where: { id: request.id, tokenHash: hashTelegramToken(token) },
      data: {
        tokenHash: null,
        tokenExpiresAt: null,
        candidateTelegramUserId: null,
        candidateTelegramChatId: null,
        candidateUsername: null,
        confirmationStartedAt: null,
      },
    });
    return {
      text: [
        "❌ <b>Kode konfirmasi sudah kedaluwarsa.</b>",
        "",
        `Buat kode baru di <a href="${appUrl()}/pengaturan/telegram">Pengaturan Telegram</a>.`,
      ].join("\n"),
    };
  }

  if (
    request.status !== "PENDING_ADMIN" &&
    request.status !== "PENDING_TELEGRAM"
  ) {
    return {
      text: "❌ <b>Pengajuan ini tidak dapat dikonfirmasi.</b> Silakan buat pengajuan baru dari Pengaturan Telegram.",
    };
  }

  // Satu chat Telegram hanya boleh memiliki satu sesi konfirmasi aktif.
  await prisma.$transaction(async (tx) => {
    await tx.telegramlinkrequest.updateMany({
      where: {
        candidateTelegramChatId: chatId,
        id: { not: request.id },
        status: { in: ["PENDING_ADMIN", "PENDING_TELEGRAM"] },
      },
      data: {
        candidateTelegramUserId: null,
        candidateTelegramChatId: null,
        candidateUsername: null,
        confirmationStartedAt: null,
      },
    });

    await tx.telegramlinkrequest.update({
      where: { id: request.id },
      data: {
        candidateTelegramUserId: fromId,
        candidateTelegramChatId: chatId,
        candidateUsername: username,
        confirmationStartedAt: new Date(),
      },
    });
  });

  return {
    text: [
      "🔐 <b>Konfirmasi Identitas Telegram</b>",
      "",
      `Halo ${escapeHtml(linkedName)}.`,
      "Untuk membuktikan bahwa akun Telegram ini milik Anda, tekan tombol <b>Bagikan Nomor HP</b> di bawah.",
      "",
      "Nomor yang dibagikan harus nomor HP yang terdaftar di aplikasi:",
      `<code>${escapeHtml(request.phoneNormalized)}</code>`,
      "",
      "Kontak milik orang lain tidak akan diterima.",
    ].join("\n"),
    replyMarkup: CONTACT_KEYBOARD,
  };
}

async function handleContact(
  chatId: string,
  contact: NonNullable<NonNullable<TelegramUpdate["message"]>["contact"]>,
  fromId: string,
  username: string | null
): Promise<{ text: string; replyMarkup?: unknown }> {
  if (
    contact.user_id === undefined ||
    String(contact.user_id) !== String(fromId)
  ) {
    return {
      text: [
        "❌ <b>Kontak tidak valid.</b>",
        "",
        "Anda harus membagikan kontak akun Telegram Anda sendiri, bukan kontak orang lain.",
      ].join("\n"),
      replyMarkup: CONTACT_KEYBOARD,
    };
  }

  const request = await prisma.telegramlinkrequest.findFirst({
    where: {
      candidateTelegramChatId: chatId,
      status: { in: ["PENDING_ADMIN", "PENDING_TELEGRAM"] },
      confirmationStartedAt: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      user: { select: { phone: true, phoneNormalized: true } },
    },
  });

  if (!request) {
    return {
      text: [
        "❌ <b>Tidak ada sesi konfirmasi yang aktif.</b>",
        "",
        `Buka <a href="${appUrl()}/pengaturan/telegram">Pengaturan Telegram</a> dan buka tautan konfirmasi terbaru.`,
      ].join("\n"),
    };
  }

  if (
    !request.tokenExpiresAt ||
    request.tokenExpiresAt.getTime() < Date.now()
  ) {
    await prisma.telegramlinkrequest.updateMany({
      where: { id: request.id },
      data: {
        tokenHash: null,
        tokenExpiresAt: null,
        candidateTelegramUserId: null,
        candidateTelegramChatId: null,
        candidateUsername: null,
        confirmationStartedAt: null,
      },
    });
    return {
      text: [
        "❌ <b>Sesi konfirmasi sudah kedaluwarsa.</b>",
        "",
        `Buat tautan konfirmasi baru di <a href="${appUrl()}/pengaturan/telegram">Pengaturan Telegram</a>.`,
      ].join("\n"),
    };
  }

  const contactPhone = normalizePhoneNumber(contact.phone_number);
  const accountPhone =
    request.user.phoneNormalized ??
    normalizePhoneNumber(request.user.phone);

  if (!contactPhone) {
    return {
      text: "❌ Nomor HP pada kontak tidak valid. Gunakan nomor HP Indonesia yang terdaftar.",
      replyMarkup: CONTACT_KEYBOARD,
    };
  }

  if (
    contactPhone !== request.phoneNormalized ||
    contactPhone !== accountPhone
  ) {
    return {
      text: [
        "❌ <b>Nomor HP tidak cocok.</b>",
        "",
        `Nomor yang dibagikan: <code>${escapeHtml(contactPhone)}</code>`,
        `Nomor terdaftar: <code>${escapeHtml(request.phoneNormalized)}</code>`,
        "",
        "Pastikan Anda membagikan kontak dengan nomor HP yang sama seperti di aplikasi.",
      ].join("\n"),
      replyMarkup: CONTACT_KEYBOARD,
    };
  }

  const result = await confirmTelegramIdentity({
    requestId: request.id,
    telegramUserId: String(fromId),
    telegramChatId: chatId,
    telegramUsername: username,
  });

  if (!result.ok) {
    switch (result.code) {
      case "TELEGRAM_IN_USE":
        return {
          text: [
            "❌ <b>Akun Telegram ini sudah terhubung ke akun aplikasi lain.</b>",
            "",
            "Satu akun Telegram hanya boleh digunakan oleh satu akun aplikasi. Hubungi admin/petugas jika ini keliru.",
          ].join("\n"),
        };
      case "PHONE_CHANGED":
        return {
          text: "❌ Nomor HP akun sudah berubah. Pengajuan ini dicabut; silakan ajukan penautan ulang dari Pengaturan Telegram.",
        };
      case "TOKEN_EXPIRED":
        return {
          text: "❌ Sesi konfirmasi sudah kedaluwarsa. Buat tautan konfirmasi baru dari Pengaturan Telegram.",
        };
      case "INVALID_STATE":
        return {
          text: "❌ Pengajuan ini sudah diproses. Buka Pengaturan Telegram untuk melihat status terbaru.",
        };
      default:
        return {
          text: "❌ Konfirmasi gagal. Silakan buat tautan konfirmasi baru dari Pengaturan Telegram.",
        };
    }
  }

  if (result.activated) {
    return {
      text: [
        "✅ <b>Akun Telegram berhasil diaktifkan!</b>",
        "",
        "Mulai sekarang notifikasi laporan akan dikirim ke chat ini.",
        "Ketik /bantuan untuk melihat perintah yang tersedia.",
      ].join("\n"),
      replyMarkup: { remove_keyboard: true },
    };
  }

  return {
    text: [
      "✅ <b>Identitas Telegram berhasil dikonfirmasi.</b>",
      "",
      "Pengajuan masih menunggu persetujuan admin/petugas. Koneksi akan aktif otomatis setelah disetujui.",
    ].join("\n"),
    replyMarkup: { remove_keyboard: true },
  };
}

async function handleCommand(
  chatId: string,
  text: string
): Promise<string> {
  const parts = text.split(/\s+/).filter(Boolean);
  const command = (parts[0] || "").toLowerCase().split("@")[0];
  const payload = parts.slice(1).join(" ").trim();

  if (command === "/start") {
    if (!payload) return helpText(false);
    // Token ditangani di POST karena membutuhkan message.from.id.
    return "";
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

  // Pesan bebas (bukan perintah) dijawab oleh SiLapor dengan akses baca ke
  // database sesuai peran pengguna. Hasil di-escape agar aman untuk HTML
  // Telegram.
  if (!text.startsWith("/")) {
    const result = await generateChatbotReply(
      { id: user.id, role: user.role },
      text,
      []
    );
    if (result.reply) return escapeHtml(result.reply);
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
  const fromId =
    message.from?.id !== undefined ? String(message.from.id) : null;

  try {
    if (message.contact) {
      if (!fromId) {
        await sendTelegramMessage(
          chatId,
          "❌ Tidak dapat memverifikasi pengirim pesan."
        );
        return NextResponse.json({ ok: true });
      }
      const reply = await handleContact(
        chatId,
        message.contact,
        fromId,
        username
      );
      await sendTelegramMessage(chatId, reply.text, {
        replyMarkup: reply.replyMarkup,
      });
      return NextResponse.json({ ok: true });
    }

    if (text) {
      const parts = text.split(/\s+/).filter(Boolean);
      const command = (parts[0] || "").toLowerCase().split("@")[0];
      const payload = parts.slice(1).join(" ").trim();

      if (command === "/start" && payload) {
        if (!fromId) {
          await sendTelegramMessage(
            chatId,
            "❌ Tidak dapat memverifikasi pengirim pesan."
          );
          return NextResponse.json({ ok: true });
        }
        const reply = await handleStart(chatId, payload, username, fromId);
        await sendTelegramMessage(chatId, reply.text, {
          replyMarkup: reply.replyMarkup,
        });
        return NextResponse.json({ ok: true });
      }

      const reply = await handleCommand(chatId, text);
      if (reply) {
        await sendTelegramMessage(chatId, reply);
      }
    }
  } catch (error) {
    console.error("Gagal memproses perintah Telegram:", error);
  }

  return NextResponse.json({ ok: true });
}

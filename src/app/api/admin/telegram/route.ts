import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  deleteTelegramWebhook,
  getBotToken,
  getBotUsername,
  getTelegramMe,
  getTelegramWebhookInfo,
  isTelegramConfigured,
  sendTelegramMessage,
  setTelegramWebhook,
} from "@/lib/telegram";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (user.role !== "ADMIN") {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { user };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const [linkedUsers, totalNotifications, sent, failed, me, webhook] =
    await Promise.all([
      prisma.user.count({ where: { telegramChatId: { not: null } } }),
      prisma.notification.count(),
      prisma.notification.count({ where: { telegramSent: true } }),
      prisma.notification.count({
        where: { telegramSent: false, telegramError: { not: null } },
      }),
      getTelegramMe(),
      getTelegramWebhookInfo(),
    ]);

  return NextResponse.json({
    configured: isTelegramConfigured(),
    botUsername:
      getBotUsername() || (me.ok ? me.result?.username ?? null : null),
    env: {
      hasToken: Boolean(getBotToken()),
      hasWebhookSecret: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
      appUrl:
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXTAUTH_URL ||
        null,
    },
    me,
    webhook,
    counts: { linkedUsers, totalNotifications, sent, failed },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const action = String(body.action ?? "");

  if (action === "set-webhook") {
    if (!isTelegramConfigured()) {
      return NextResponse.json(
        { ok: false, error: "TELEGRAM_BOT_TOKEN belum diatur di .env" },
        { status: 400 }
      );
    }

    const base = (
      process.env.TELEGRAM_WEBHOOK_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL ||
      ""
    ).trim();

    if (!base) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "NEXT_PUBLIC_APP_URL / NEXTAUTH_URL belum diatur untuk menentukan URL webhook",
        },
        { status: 400 }
      );
    }

    const url =
      process.env.TELEGRAM_WEBHOOK_URL?.trim() ||
      `${base.replace(/\/$/, "")}/api/telegram/webhook`;

    const result = await setTelegramWebhook(
      url,
      process.env.TELEGRAM_WEBHOOK_SECRET
    );

    return NextResponse.json(
      { ...result, webhookUrl: url },
      { status: result.ok ? 200 : 502 }
    );
  }

  if (action === "delete-webhook") {
    const result = await deleteTelegramWebhook();
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  }

  if (action === "test") {
    const user = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { telegramChatId: true },
    });

    if (!user?.telegramChatId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Akun admin belum menautkan Telegram. Buka Pengaturan Telegram terlebih dahulu.",
        },
        { status: 400 }
      );
    }

    const result = await sendTelegramMessage(
      user.telegramChatId,
      "✅ <b>Uji koneksi berhasil.</b>\nBot Pelaporan Fasilitas siap mengirim notifikasi."
    );

    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  }

  return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
}

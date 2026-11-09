import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  getBotToken,
  getBotUsername,
  getTelegramMe,
  getTelegramWebhookInfo,
  isTelegramConfigured,
} from "@/lib/telegram";
import TelegramAdminPanel from "@/components/admin/TelegramAdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminTelegramPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/unauthorized");

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

  const initial = {
    configured: isTelegramConfigured(),
    botUsername:
      getBotUsername() || (me.ok ? me.result?.username ?? null : null),
    env: {
      hasToken: Boolean(getBotToken()),
      hasWebhookSecret: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
      appUrl:
        process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || null,
    },
    me: {
      ok: me.ok,
      result: me.result
        ? {
            username: me.result.username,
            first_name: me.result.first_name,
          }
        : undefined,
      error: me.error,
    },
    webhook: {
      ok: webhook.ok,
      result: webhook.result
        ? {
            url: webhook.result.url,
            pending_update_count: webhook.result.pending_update_count,
            last_error_message: webhook.result.last_error_message,
          }
        : undefined,
      error: webhook.error,
    },
    counts: { linkedUsers, totalNotifications, sent, failed },
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          href="/admin/dashboard"
          className="text-sm font-medium text-blue-600 hover:text-blue-500"
        >
          &larr; Kembali ke dashboard
        </Link>
        <h1 className="text-2xl font-bold text-zinc-900 mt-2">
          Telegram Bot
        </h1>
        <p className="text-zinc-600">
          Pantau koneksi bot, atur webhook, dan lihat statistik notifikasi
          Telegram.
        </p>
      </div>

      <TelegramAdminPanel initial={initial} />
    </div>
  );
}

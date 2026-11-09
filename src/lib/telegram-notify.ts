import prisma from "@/lib/prisma";
import {
  escapeHtml,
  isTelegramConfigured,
  sendTelegramMessage,
} from "@/lib/telegram";

/**
 * Mengirim notifikasi ke Telegram pengguna (jika akun sudah tertaut dan
 * notifikasi Telegram aktif). Tidak pernah melempar error ke pemanggil.
 */
export async function deliverTelegramNotification(
  notificationId: string
): Promise<void> {
  try {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
      include: {
        user: {
          select: {
            telegramChatId: true,
            telegramEnabled: true,
          },
        },
        report: { select: { reportNumber: true } },
      },
    });

    if (!notification) return;
    if (!notification.user.telegramChatId) return;
    if (!notification.user.telegramEnabled) return;

    if (!isTelegramConfigured()) {
      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          telegramSent: false,
          telegramError: "Bot Telegram belum dikonfigurasi oleh admin.",
        },
      });
      return;
    }

    const text = [
      `<b>${escapeHtml(notification.title)}</b>`,
      escapeHtml(notification.message),
      "",
      `Nomor: <code>${escapeHtml(
        notification.report.reportNumber
      )}</code>`,
    ].join("\n");

    const result = await sendTelegramMessage(
      notification.user.telegramChatId,
      text
    );

    await prisma.notification.update({
      where: { id: notificationId },
      data: result.ok
        ? {
            telegramSent: true,
            telegramSentAt: new Date(),
            telegramError: null,
          }
        : {
            telegramSent: false,
            telegramError: result.error || "Gagal mengirim ke Telegram",
          },
    });
  } catch (error) {
    console.error("Gagal mengirim notifikasi Telegram:", error);
  }
}

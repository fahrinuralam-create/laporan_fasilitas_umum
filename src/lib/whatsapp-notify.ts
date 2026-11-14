import prisma from "@/lib/prisma";
import {
  isFonnteConfigured,
  maskWhatsAppNumber,
  sanitizeFonnteError,
  sendWhatsAppMessage,
} from "@/lib/fonnte";

const MAX_DELIVERY_ATTEMPTS = 3;
const CLAIM_STALE_MS = 5 * 60 * 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatNotificationText(notification: {
  title: string;
  message: string;
  reportNumber: string;
}): string {
  return [
    `*${notification.title}*`,
    "",
    notification.message,
    "",
    `Nomor laporan: ${notification.reportNumber}`,
  ].join("\n");
}

/**
 * Mengirim notifikasi internal ke WhatsApp pengguna yang nomornya sudah
 * terverifikasi dan aktif. Fungsi ini tidak pernah melempar error ke
 * pemanggil sehingga transaksi bisnis utama tidak ikut gagal.
 */
export async function deliverWhatsAppNotification(
  notificationId: string
): Promise<void> {
  try {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
      include: {
        user: {
          select: {
            id: true,
            whatsappNumber: true,
            whatsappVerifiedAt: true,
            whatsappEnabled: true,
          },
        },
        report: { select: { reportNumber: true } },
      },
    });

    if (!notification) return;
    if (notification.whatsappSent) return;
    if (!notification.user.whatsappEnabled) return;
    if (
      !notification.user.whatsappNumber ||
      !notification.user.whatsappVerifiedAt
    ) {
      return;
    }

    // Hanya kirim jika ada penautan ACTIVE yang cocok dengan nomor terverifikasi.
    const activeLink = await prisma.whatsapplinkrequest.findFirst({
      where: {
        userId: notification.userId,
        status: "ACTIVE",
        phoneNormalized: notification.user.whatsappNumber,
      },
      select: { id: true },
    });
    if (!activeLink) return;

    if (!isFonnteConfigured()) {
      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          whatsappSent: false,
          whatsappError: "FONNTE_API_TOKEN belum dikonfigurasi oleh admin.",
        },
      });
      return;
    }

    if (notification.whatsappAttempts >= MAX_DELIVERY_ATTEMPTS) return;

    // Klaim atomik mencegah dua proses mengirim pesan yang sama bersamaan.
    const now = new Date();
    const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS);
    const claimed = await prisma.notification.updateMany({
      where: {
        id: notificationId,
        whatsappSent: false,
        OR: [
          { whatsappProcessingAt: null },
          { whatsappProcessingAt: { lt: staleBefore } },
        ],
      },
      data: { whatsappProcessingAt: now },
    });
    if (claimed.count === 0) return;

    const text = formatNotificationText({
      title: notification.title,
      message: notification.message,
      reportNumber: notification.report.reportNumber,
    });

    let attempts = notification.whatsappAttempts;
    let lastError = "Gagal mengirim ke WhatsApp.";

    while (attempts < MAX_DELIVERY_ATTEMPTS) {
      attempts += 1;
      const result = await sendWhatsAppMessage(
        notification.user.whatsappNumber,
        text
      );

      if (result.ok) {
        await prisma.notification.update({
          where: { id: notificationId },
          data: {
            whatsappSent: true,
            whatsappSentAt: new Date(),
            whatsappError: null,
            whatsappAttempts: attempts,
            whatsappProcessingAt: null,
            whatsappMessageId: result.messageId,
          },
        });
        return;
      }

      lastError = result.error || "Gagal mengirim ke WhatsApp.";

      if (attempts < MAX_DELIVERY_ATTEMPTS) {
        await prisma.notification.update({
          where: { id: notificationId },
          data: {
            whatsappAttempts: attempts,
            whatsappError: sanitizeFonnteError(lastError),
          },
        });
        await sleep(attempts === 1 ? 1000 : 2500);
      }
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        whatsappSent: false,
        whatsappAttempts: attempts,
        whatsappError: sanitizeFonnteError(lastError),
        whatsappProcessingAt: null,
      },
    });

    console.error(
      "Gagal mengirim notifikasi WhatsApp ke",
      maskWhatsAppNumber(notification.user.whatsappNumber),
      `(notifikasi ${notificationId}).`
    );
  } catch (error) {
    console.error(
      "Gagal memproses notifikasi WhatsApp:",
      notificationId,
      sanitizeFonnteError(error)
    );
    try {
      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          whatsappError: sanitizeFonnteError(error),
          whatsappProcessingAt: null,
        },
      });
    } catch {
      // Abaikan: kegagalan pencatatan tidak boleh mengganggu alur utama.
    }
  }
}

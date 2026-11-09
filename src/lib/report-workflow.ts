import { Prisma, report_status } from "@prisma/client";
import prisma from "@/lib/prisma";
import { deliverTelegramNotification } from "@/lib/telegram-notify";

export type TransitionInput = {
  reportId: string;
  actorId: string;
  newStatus: report_status;
  notes: string;
  notificationTitle: string;
  notificationMessage: string;
  extraData?: Prisma.reportUncheckedUpdateInput;
  afterImageDataUrl?: string | null;
};

/**
 * Mengubah status laporan secara atomik: update status, catat riwayat,
 * kirim notifikasi ke pelapor, dan (opsional) simpan foto "setelah".
 */
export async function transitionReport(input: TransitionInput) {
  const report = await prisma.report.findUnique({
    where: { id: input.reportId },
  });

  if (!report) {
    throw new Error("Laporan tidak ditemukan");
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.report.update({
      where: { id: input.reportId },
      data: {
        status: input.newStatus,
        ...(input.extraData ?? {}),
      },
    });

    await tx.reporthistory.create({
      data: {
        reportId: input.reportId,
        userId: input.actorId,
        oldStatus: report.status,
        newStatus: input.newStatus,
        notes: input.notes,
      },
    });

    const notification = await tx.notification.create({
      data: {
        userId: report.reporterId,
        reportId: input.reportId,
        title: input.notificationTitle,
        message: input.notificationMessage,
      },
    });

    if (input.afterImageDataUrl) {
      await tx.reportimage.create({
        data: {
          reportId: input.reportId,
          imageUrl: input.afterImageDataUrl,
          type: "AFTER",
        },
      });
    }

    return { updated, notificationId: notification.id };
  });

  void deliverTelegramNotification(result.notificationId).catch((error) => {
    console.error("Gagal mengirim notifikasi Telegram:", error);
  });

  return result.updated;
}

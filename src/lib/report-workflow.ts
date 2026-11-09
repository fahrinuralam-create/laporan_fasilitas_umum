import { Prisma, report_status } from "@prisma/client";
import prisma from "@/lib/prisma";
import { deliverTelegramNotification } from "@/lib/telegram-notify";
import { SYSTEM_ACTOR_NOTE_PREFIX } from "@/lib/report-utils";

const AUTO_REJECTABLE_STATUSES: report_status[] = [
  "DIAJUKAN",
  "DIVERIFIKASI",
];

export type AutoRejectInput = {
  reportId: string;
  actorId: string;
  reasonDetail: string;
  extraData?: Prisma.reportUncheckedUpdateInput;
};

/**
 * Menolak laporan secara otomatis dan atomik. Hanya berjalan jika status
 * laporan masih DIAJUKAN/DIVERIFIKASI, sehingga laporan yang sudah diproses
 * tidak berubah status karena analisis AI yang terlambat.
 */
export async function autoRejectReport(input: AutoRejectInput): Promise<{
  rejected: boolean;
  notificationId?: string;
}> {
  const reasonDetail = input.reasonDetail.trim().replace(/[.]+$/, "");
  const safeReason =
    reasonDetail || "laporan tidak memenuhi kriteria verifikasi otomatis";

  const result = await prisma.$transaction(async (tx) => {
    const report = await tx.report.findUnique({
      where: { id: input.reportId },
      select: {
        id: true,
        reportNumber: true,
        reporterId: true,
        status: true,
      },
    });

    if (!report || !AUTO_REJECTABLE_STATUSES.includes(report.status)) {
      return { rejected: false as const };
    }

    const updated = await tx.report.updateMany({
      where: { id: input.reportId, status: report.status },
      data: {
        ...(input.extraData ?? {}),
        status: "DITOLAK",
      },
    });

    // Proses lain sudah mengubah status lebih dulu; jangan buat riwayat ganda.
    if (updated.count === 0) {
      return { rejected: false as const };
    }

    await tx.reporthistory.create({
      data: {
        reportId: input.reportId,
        userId: input.actorId,
        oldStatus: report.status,
        newStatus: "DITOLAK",
        notes: `${SYSTEM_ACTOR_NOTE_PREFIX} Laporan ditolak otomatis karena ${safeReason}.`,
      },
    });

    const notification = await tx.notification.create({
      data: {
        userId: report.reporterId,
        reportId: input.reportId,
        title: "Laporan Ditolak Otomatis",
        message:
          `Laporan Anda dengan nomor ${report.reportNumber} ditolak otomatis oleh sistem. ` +
          `Alasan: ${safeReason}. Silakan periksa detail laporan atau buat laporan ` +
          "baru dengan data/foto yang sesuai.",
      },
    });

    return { rejected: true as const, notificationId: notification.id };
  });

  if (result.rejected && result.notificationId) {
    void deliverTelegramNotification(result.notificationId).catch((error) => {
      console.error(
        "Gagal mengirim notifikasi Telegram penolakan otomatis:",
        error
      );
    });
  }

  return result;
}

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

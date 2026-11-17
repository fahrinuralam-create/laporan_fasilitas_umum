import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { buildReportNumber, inferPriority } from "@/lib/report-utils";
import { validateReportInput } from "@/lib/report-validation";
import { analyzeReportById } from "@/lib/report-ai";
import { deliverWhatsAppNotification } from "@/lib/whatsapp-notify";

export async function GET() {
  const auth = await requireUser();
  if (!auth.user) return auth.response;
  const user = auth.user;

  const where =
    user.role === "ADMIN"
      ? {}
      : user.role === "PETUGAS"
        ? { assignedOfficerId: user.id }
        : { reporterId: user.id };

  const reports = await prisma.report.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      reporter: { select: { id: true, name: true, email: true } },
      assignedOfficer: { select: { id: true, name: true } },
      reportimage: {
        where: { type: "BEFORE" },
        take: 1,
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json(reports);
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.user) return auth.response;
  const user = auth.user;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const validation = validateReportInput(body);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.errors.join(", ") },
      { status: 400 }
    );
  }

  const { title, description, category, address, imageDataUrl, latitude, longitude } =
    validation.data;

  // Prioritas ditentukan otomatis oleh sistem (rule-based), lalu dapat
  // disempurnakan oleh analisis AI setelah laporan dibuat.
  const priority = inferPriority({ category, title, description });

  let lastError: unknown = null;

  for (let attempt = 0; attempt < 6; attempt++) {
    const reportNumber = buildReportNumber();

    try {
      const created = await prisma.report.create({
        data: {
          reportNumber,
          title,
          description,
          category: category as never,
          priority: priority as never,
          status: "DIAJUKAN",
          address,
          latitude,
          longitude,
          reporterId: user.id,
          reportimage: imageDataUrl
            ? {
                create: [{ imageUrl: imageDataUrl, type: "BEFORE" }],
              }
            : undefined,
          reporthistory: {
            create: [
              {
                userId: user.id,
                oldStatus: "DIAJUKAN",
                newStatus: "DIAJUKAN",
                notes: "Laporan baru dibuat oleh masyarakat.",
              },
            ],
          },
          notification: {
            create: [
              {
                userId: user.id,
                title: "Laporan Berhasil Dibuat",
                message: `Laporan Anda dengan nomor ${reportNumber} telah berhasil dibuat dan menunggu verifikasi.`,
              },
            ],
          },
        },
        include: {
          reportimage: true,
          reporthistory: true,
          notification: true,
        },
      });

      const notificationId = created.notification[0]?.id;
      if (notificationId) {
        void deliverWhatsAppNotification(notificationId).catch((error) => {
          console.error("Gagal mengirim notifikasi WhatsApp:", error);
        });
      }

      // Analisis AI berjalan di latar belakang agar pembuatan laporan tetap cepat.
      void analyzeReportById(created.id).catch((error) => {
        console.error("Analisis AI otomatis gagal:", error);
      });

      return NextResponse.json(created, { status: 201 });
    } catch (error) {
      lastError = error;
      const code = (error as { code?: string }).code;
      // P2002 = unique constraint (nomor laporan sudah dipakai) -> coba lagi
      if (code !== "P2002") break;
    }
  }

  console.error("Gagal membuat laporan:", lastError);
  return NextResponse.json(
    { error: "Gagal membuat laporan. Silakan coba lagi." },
    { status: 500 }
  );
}

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  buildReportNumber,
  REPORT_CATEGORIES,
  REPORT_PRIORITIES,
} from "@/lib/report-utils";

const CATEGORY_VALUES = REPORT_CATEGORIES.map((c) => c.value);
const PRIORITY_VALUES = REPORT_PRIORITIES.map((p) => p.value);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const category = String(body.category ?? "");
  const priority = String(body.priority ?? "SEDANG");
  const address = body.address ? String(body.address).trim() : null;
  const imageDataUrl = body.imageDataUrl ? String(body.imageDataUrl) : null;

  const latitude =
    body.latitude !== undefined && body.latitude !== null && body.latitude !== ""
      ? Number(body.latitude)
      : null;
  const longitude =
    body.longitude !== undefined &&
    body.longitude !== null &&
    body.longitude !== ""
      ? Number(body.longitude)
      : null;

  const errors: string[] = [];
  if (!title) errors.push("Judul wajib diisi");
  if (title.length > 190) errors.push("Judul maksimal 190 karakter");
  if (!description) errors.push("Deskripsi wajib diisi");
  if (!CATEGORY_VALUES.includes(category as never))
    errors.push("Kategori tidak valid");
  if (!PRIORITY_VALUES.includes(priority as never))
    errors.push("Prioritas tidak valid");
  if (latitude !== null && Number.isNaN(latitude))
    errors.push("Latitude tidak valid");
  if (longitude !== null && Number.isNaN(longitude))
    errors.push("Longitude tidak valid");
  if (imageDataUrl && imageDataUrl.length > 4_000_000)
    errors.push("Ukuran gambar terlalu besar");

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(", ") }, { status: 400 });
  }

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
        },
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

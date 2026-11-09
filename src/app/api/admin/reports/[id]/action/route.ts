import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { transitionReport } from "@/lib/report-workflow";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const report = await prisma.report.findUnique({ where: { id } });

  if (!report) {
    return NextResponse.json(
      { error: "Laporan tidak ditemukan" },
      { status: 404 }
    );
  }

  if (action === "verify") {
    if (report.status !== "DIAJUKAN") {
      return NextResponse.json(
        { error: "Hanya laporan berstatus Diajukan yang dapat diverifikasi" },
        { status: 400 }
      );
    }

    const updated = await transitionReport({
      reportId: id,
      actorId: user.id,
      newStatus: "DIVERIFIKASI",
      notes: "Laporan telah diverifikasi oleh Admin.",
      notificationTitle: "Laporan Diverifikasi",
      notificationMessage: `Laporan Anda dengan nomor ${report.reportNumber} telah diverifikasi oleh Admin.`,
      extraData: { verifiedAt: new Date() },
    });

    return NextResponse.json(updated);
  }

  if (action === "assign") {
    const officerId = String(body.officerId ?? "");
    if (!officerId) {
      return NextResponse.json(
        { error: "Petugas wajib dipilih" },
        { status: 400 }
      );
    }

    const officer = await prisma.user.findFirst({
      where: { id: officerId, role: "PETUGAS" },
      select: { id: true, name: true, email: true },
    });

    if (!officer) {
      return NextResponse.json(
        { error: "Petugas tidak ditemukan" },
        { status: 400 }
      );
    }

    if (report.status !== "DIVERIFIKASI") {
      return NextResponse.json(
        { error: "Verifikasi laporan terlebih dahulu sebelum menugaskan" },
        { status: 400 }
      );
    }

    const officerName = officer.name || officer.email || "petugas";

    const updated = await transitionReport({
      reportId: id,
      actorId: user.id,
      newStatus: "DITUGASKAN",
      notes: `Ditugaskan kepada petugas ${officerName}.`,
      notificationTitle: "Laporan Ditugaskan",
      notificationMessage: `Laporan Anda dengan nomor ${report.reportNumber} telah ditugaskan kepada petugas ${officerName}.`,
      extraData: { assignedOfficerId: officer.id },
    });

    return NextResponse.json(updated);
  }

  if (action === "reject") {
    const reason = String(body.reason ?? "").trim();
    if (!reason) {
      return NextResponse.json(
        { error: "Alasan penolakan wajib diisi" },
        { status: 400 }
      );
    }

    if (!["DIAJUKAN", "DIVERIFIKASI"].includes(report.status)) {
      return NextResponse.json(
        { error: "Laporan pada status ini tidak dapat ditolak" },
        { status: 400 }
      );
    }

    const updated = await transitionReport({
      reportId: id,
      actorId: user.id,
      newStatus: "DITOLAK",
      notes: `Laporan ditolak oleh Admin: ${reason}`,
      notificationTitle: "Laporan Ditolak",
      notificationMessage: `Laporan Anda dengan nomor ${report.reportNumber} ditolak. Alasan: ${reason}`,
    });

    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
}

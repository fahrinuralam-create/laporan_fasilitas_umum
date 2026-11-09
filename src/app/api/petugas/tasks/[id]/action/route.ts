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
  if (user.role !== "PETUGAS") {
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
  const notes = body.notes ? String(body.notes).trim() : "";

  const report = await prisma.report.findUnique({ where: { id } });

  if (!report) {
    return NextResponse.json(
      { error: "Laporan tidak ditemukan" },
      { status: 404 }
    );
  }

  if (report.assignedOfficerId !== user.id) {
    return NextResponse.json(
      { error: "Laporan ini bukan tugas Anda" },
      { status: 403 }
    );
  }

  if (action === "start") {
    if (report.status !== "DITUGASKAN") {
      return NextResponse.json(
        { error: "Hanya tugas berstatus Ditugaskan yang dapat dimulai" },
        { status: 400 }
      );
    }

    const updated = await transitionReport({
      reportId: id,
      actorId: user.id,
      newStatus: "DIPROSES",
      notes: notes
        ? `Pekerjaan mulai diproses oleh petugas. ${notes}`
        : "Pekerjaan mulai diproses oleh petugas.",
      notificationTitle: "Laporan Sedang Diproses",
      notificationMessage: `Laporan Anda (${report.reportNumber}) sedang diproses/dikerjakan oleh petugas lapangan.`,
    });

    return NextResponse.json(updated);
  }

  if (action === "complete") {
    if (report.status !== "DIPROSES") {
      return NextResponse.json(
        { error: "Hanya tugas yang sedang diproses yang dapat diselesaikan" },
        { status: 400 }
      );
    }

    const afterImageDataUrl = body.afterImageDataUrl
      ? String(body.afterImageDataUrl)
      : null;

    if (afterImageDataUrl && afterImageDataUrl.length > 4_000_000) {
      return NextResponse.json(
        { error: "Ukuran gambar terlalu besar" },
        { status: 400 }
      );
    }

    const updated = await transitionReport({
      reportId: id,
      actorId: user.id,
      newStatus: "SELESAI",
      notes: notes
        ? `Pekerjaan telah diselesaikan oleh petugas. ${notes}`
        : "Pekerjaan telah diselesaikan oleh petugas.",
      notificationTitle: "Laporan Selesai",
      notificationMessage: `Laporan Anda (${report.reportNumber}) telah selesai dikerjakan. Terima kasih atas laporan Anda.`,
      extraData: { completedAt: new Date() },
      afterImageDataUrl,
    });

    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
}

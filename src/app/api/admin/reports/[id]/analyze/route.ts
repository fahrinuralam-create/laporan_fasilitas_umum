import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { analyzeReportById } from "@/lib/report-ai";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole("ADMIN");
  if (!auth.user) return auth.response;

  const { id } = await params;

  try {
    const result = await analyzeReportById(id);

    const autoRejected = result.autoRejected === true;
    const rejectionReason = result.rejectionReason ?? null;

    if (result.skipped) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          skipped: true,
          duplicate: result.duplicate,
          autoRejected,
          rejectionReason,
        },
        { status: autoRejected ? 200 : 400 }
      );
    }

    if (!result.ok && !autoRejected) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error || "Analisis AI gagal",
          duplicate: result.duplicate,
          autoRejected,
          rejectionReason,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: result.ok,
      usedVision: result.usedVision,
      analysis: result.analysis,
      duplicate: result.duplicate,
      autoRejected,
      rejectionReason,
    });
  } catch (error) {
    const message =
      (error as Error).message === "Laporan tidak ditemukan"
        ? "Laporan tidak ditemukan"
        : "Gagal menganalisis laporan";
    const status = message === "Laporan tidak ditemukan" ? 404 : 500;
    console.error("Analisis AI gagal:", error);
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { analyzeReportById } from "@/lib/report-ai";

export async function POST(
  _request: Request,
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

  try {
    const result = await analyzeReportById(id);

    if (result.skipped) {
      return NextResponse.json(
        { error: result.error, skipped: true, duplicate: result.duplicate },
        { status: 400 }
      );
    }

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error || "Analisis AI gagal",
          duplicate: result.duplicate,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      usedVision: result.usedVision,
      analysis: result.analysis,
      duplicate: result.duplicate,
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

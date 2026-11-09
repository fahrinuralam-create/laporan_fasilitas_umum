import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getAiConfigRow, getResolvedAiConfig } from "@/lib/ai-config";
import { maskSecret } from "@/lib/ai-config-crypto";
import prisma from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [row, resolved, historyCount] = await Promise.all([
    getAiConfigRow(),
    getResolvedAiConfig(),
    prisma.aiconfigurationhistory.count(),
  ]);

  const checks = [
    {
      name: "Baris konfigurasi database",
      ok: Boolean(row),
      detail: row ? `Diperbarui ${row.updatedAt.toISOString()}` : "Belum ada",
    },
    {
      name: "API key teks",
      ok: resolved.text.keySource !== "none",
      detail:
        resolved.text.keySource === "none"
          ? "Belum dikonfigurasi"
          : `Sumber: ${resolved.text.keySource}`,
    },
    {
      name: "API key vision",
      ok: resolved.vision.keySource !== "none",
      detail:
        resolved.vision.keySource === "none"
          ? "Belum dikonfigurasi"
          : `Sumber: ${resolved.vision.keySource}`,
    },
    {
      name: "Riwayat perubahan",
      ok: true,
      detail: `${historyCount} entri`,
    },
  ];

  return NextResponse.json({
    checks,
    text: {
      provider: resolved.text.provider,
      baseUrl: resolved.text.baseUrl,
      model: resolved.text.model,
      keySource: resolved.text.keySource,
      maskedKey: maskSecret(resolved.text.apiKey),
    },
    vision: {
      provider: resolved.vision.provider,
      baseUrl: resolved.vision.baseUrl,
      model: resolved.vision.model,
      keySource: resolved.vision.keySource,
      maskedKey: maskSecret(resolved.vision.apiKey),
    },
  });
}

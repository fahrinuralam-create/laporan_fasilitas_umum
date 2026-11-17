import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { getAiConfigRow, getResolvedAiConfig } from "@/lib/ai-config";
import { maskSecret } from "@/lib/ai-config-crypto";
import prisma from "@/lib/prisma";

export async function GET() {
  const auth = await requireRole("ADMIN");
  if (!auth.user) return auth.response;

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

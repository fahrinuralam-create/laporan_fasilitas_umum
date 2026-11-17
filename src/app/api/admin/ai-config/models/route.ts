import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { getResolvedAiConfig } from "@/lib/ai-config";

export async function GET(request: NextRequest) {
  const auth = await requireRole("ADMIN");
  if (!auth.user) return auth.response;

  const target =
    request.nextUrl.searchParams.get("target") === "vision"
      ? "vision"
      : "text";
  const resolved = await getResolvedAiConfig();
  const cfg = resolved[target];

  if (!cfg.apiKey) {
    return NextResponse.json(
      { error: "API key belum dikonfigurasi" },
      { status: 400 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${cfg.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Gagal mengambil model (HTTP ${res.status})` },
        { status: 502 }
      );
    }

    const data = await res.json().catch(() => null);
    const models: string[] = Array.isArray(data?.data)
      ? data.data.map((m: { id?: string }) => m.id).filter(Boolean)
      : [];

    return NextResponse.json({ models: models.slice(0, 200) });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      {
        error:
          err.name === "AbortError"
            ? "Koneksi timeout"
            : err.message || "Gagal terhubung ke provider",
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getResolvedAiConfig } from "@/lib/ai-config";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

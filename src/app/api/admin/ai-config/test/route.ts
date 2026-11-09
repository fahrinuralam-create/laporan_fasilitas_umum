import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getResolvedAiConfig } from "@/lib/ai-config";

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const resolved = await getResolvedAiConfig();
  const target = body.target === "vision" ? "vision" : "text";
  const baseUrl = String(body.baseUrl ?? resolved[target].baseUrl)
    .trim()
    .replace(/\/+$/, "");
  const apiKey = String(body.apiKey ?? resolved[target].apiKey);

  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "API key belum dikonfigurasi. Isi API key terlebih dahulu.",
      },
      { status: 400 }
    );
  }
  if (!isValidUrl(baseUrl)) {
    return NextResponse.json(
      { ok: false, error: "Base URL tidak valid" },
      { status: 400 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json({
        ok: false,
        status: res.status,
        error: (text || res.statusText || "Permintaan gagal").slice(0, 400),
      });
    }

    const data = await res.json().catch(() => null);
    const count = Array.isArray(data?.data) ? data.data.length : undefined;

    return NextResponse.json({ ok: true, status: res.status, count });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json({
      ok: false,
      error:
        err.name === "AbortError"
          ? "Koneksi timeout (15 detik)"
          : err.message || "Gagal terhubung ke provider",
    });
  } finally {
    clearTimeout(timeout);
  }
}

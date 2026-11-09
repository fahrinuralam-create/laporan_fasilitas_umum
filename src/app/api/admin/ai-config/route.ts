import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  getAiConfigAdminView,
  updateAiConfig,
  type AiConfigUpdateInput,
} from "@/lib/ai-config";

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const view = await getAiConfigAdminView();
  return NextResponse.json(view);
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const input: AiConfigUpdateInput = {
    textProvider: String(body.textProvider ?? ""),
    textBaseUrl: String(body.textBaseUrl ?? ""),
    textModel: String(body.textModel ?? ""),
    textApiKey: body.textApiKey ? String(body.textApiKey) : undefined,
    clearTextKey: body.clearTextKey === true,
    visionProvider: String(body.visionProvider ?? ""),
    visionBaseUrl: String(body.visionBaseUrl ?? ""),
    visionModel: String(body.visionModel ?? ""),
    visionApiKey: body.visionApiKey
      ? String(body.visionApiKey)
      : undefined,
    clearVisionKey: body.clearVisionKey === true,
  };

  if (input.textBaseUrl && !isValidUrl(input.textBaseUrl)) {
    return NextResponse.json(
      { error: "Base URL teks tidak valid (harus http/https)" },
      { status: 400 }
    );
  }
  if (input.visionBaseUrl && !isValidUrl(input.visionBaseUrl)) {
    return NextResponse.json(
      { error: "Base URL vision tidak valid (harus http/https)" },
      { status: 400 }
    );
  }
  if (!input.textModel.trim()) {
    return NextResponse.json(
      { error: "Model teks wajib diisi" },
      { status: 400 }
    );
  }
  if (!input.visionModel.trim()) {
    return NextResponse.json(
      { error: "Model vision wajib diisi" },
      { status: 400 }
    );
  }

  const view = await updateAiConfig(
    input,
    user.email || user.name || "admin"
  );

  return NextResponse.json(view);
}

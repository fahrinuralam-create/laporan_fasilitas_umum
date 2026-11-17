import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import {
  getWhatsAppLinkStatus,
  revokeWhatsAppLink,
  setWhatsAppEnabled,
} from "@/lib/whatsapp-link";

export async function GET() {
  const auth = await requireRole(
    "MASYARAKAT",
    "Fitur WhatsApp hanya tersedia untuk masyarakat."
  );
  if (!auth.user) return auth.response;
  const sessionUser = auth.user;

  const status = await getWhatsAppLinkStatus(sessionUser.id);
  if (!status) {
    return NextResponse.json(
      { error: "Pengguna tidak ditemukan" },
      { status: 404 }
    );
  }

  return NextResponse.json(status);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRole(
    "MASYARAKAT",
    "Fitur WhatsApp hanya tersedia untuk masyarakat."
  );
  if (!auth.user) return auth.response;
  const sessionUser = auth.user;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  if (typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "Field 'enabled' harus berupa boolean" },
      { status: 400 }
    );
  }

  await setWhatsAppEnabled(sessionUser.id, body.enabled);

  return NextResponse.json({ enabled: body.enabled });
}

export async function DELETE() {
  const auth = await requireRole(
    "MASYARAKAT",
    "Fitur WhatsApp hanya tersedia untuk masyarakat."
  );
  if (!auth.user) return auth.response;
  const sessionUser = auth.user;

  await revokeWhatsAppLink(sessionUser.id);

  const status = await getWhatsAppLinkStatus(sessionUser.id);
  return NextResponse.json({
    ...status,
    linked: false,
    message: "Penautan WhatsApp diputuskan.",
  });
}

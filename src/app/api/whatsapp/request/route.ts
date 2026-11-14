import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  getWhatsAppLinkStatus,
  resubmitWhatsAppRequest,
  submitWhatsAppNumber,
} from "@/lib/whatsapp-link";

function errorMessage(code: string): string {
  switch (code) {
    case "INVALID_PHONE":
      return "Nomor WhatsApp tidak valid. Gunakan format 08..., 62..., atau +62....";
    case "PHONE_IN_USE":
      return "Nomor WhatsApp sudah digunakan oleh akun lain.";
    case "USER_NOT_FOUND":
      return "Pengguna tidak ditemukan.";
    case "NO_PHONE":
      return "Belum ada nomor WhatsApp yang dapat diajukan.";
    case "ALREADY_ACTIVE":
      return "Nomor WhatsApp ini sudah aktif.";
    default:
      return "Gagal membuat pengajuan nomor WhatsApp.";
  }
}

export async function POST(request: NextRequest) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (sessionUser.role !== "MASYARAKAT") {
    return NextResponse.json(
      { error: "Fitur WhatsApp hanya tersedia untuk masyarakat." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const action = String(body.action ?? "");

  if (action === "resubmit") {
    const result = await resubmitWhatsAppRequest(sessionUser.id);
    if (!result.ok) {
      return NextResponse.json(
        { error: errorMessage(result.code) },
        { status: result.code === "ALREADY_ACTIVE" ? 409 : 400 }
      );
    }

    const status = await getWhatsAppLinkStatus(sessionUser.id);
    return NextResponse.json({ ...status, message: result.message });
  }

  if (typeof body.phone !== "string") {
    return NextResponse.json(
      { error: "Field 'phone' harus berupa teks" },
      { status: 400 }
    );
  }

  const result = await submitWhatsAppNumber(sessionUser.id, body.phone);
  if (!result.ok) {
    return NextResponse.json(
      { error: errorMessage(result.code) },
      { status: result.code === "PHONE_IN_USE" ? 409 : 400 }
    );
  }

  const status = await getWhatsAppLinkStatus(sessionUser.id);
  return NextResponse.json({
    ...status,
    changed: result.changed,
    message: result.message,
  });
}

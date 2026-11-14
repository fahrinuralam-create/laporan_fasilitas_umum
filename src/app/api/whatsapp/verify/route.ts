import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  getWhatsAppLinkStatus,
  verifyWhatsAppOtp,
} from "@/lib/whatsapp-link";

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_STATE:
    "Tidak ada pengajuan yang sedang menunggu verifikasi OTP.",
  OTP_EXPIRED:
    "Kode OTP sudah kedaluwarsa. Ajukan ulang atau minta admin mengirim OTP baru.",
  INVALID_OTP: "Kode OTP salah.",
  TOO_MANY_ATTEMPTS:
    "Batas percobaan OTP tercapai. Pengajuan kedaluwarsa; silakan ajukan ulang.",
  PHONE_IN_USE: "Nomor WhatsApp sudah digunakan oleh akun lain.",
};

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

  const result = await verifyWhatsAppOtp(sessionUser.id, body.code);
  if (!result.ok) {
    const message = ERROR_MESSAGES[result.code] || "Verifikasi OTP gagal.";
    return NextResponse.json(
      {
        error: message,
        remainingAttempts: result.remainingAttempts,
      },
      { status: result.code === "PHONE_IN_USE" ? 409 : 400 }
    );
  }

  const status = await getWhatsAppLinkStatus(sessionUser.id);
  return NextResponse.json({
    ...status,
    message:
      "Nomor WhatsApp berhasil diverifikasi dan aktif menerima notifikasi.",
  });
}

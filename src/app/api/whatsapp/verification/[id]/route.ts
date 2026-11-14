import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  approveWhatsAppRequest,
  rejectWhatsAppRequest,
  resendWhatsAppOtp,
} from "@/lib/whatsapp-link";

const ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "Pengajuan tidak ditemukan.",
  INVALID_STATE:
    "Pengajuan sudah diproses atau statusnya berubah. Muat ulang halaman.",
  SELF_REVIEW: "Anda tidak dapat memverifikasi pengajuan milik sendiri.",
  PHONE_CHANGED:
    "Nomor pengguna sudah berubah. Pengajuan ini dicabut dan pengguna harus mengajukan ulang.",
};

export async function POST(
  request: NextRequest,
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (action === "approve") {
    const result = await approveWhatsAppRequest(id, user.id);
    if (!result.ok) {
      return NextResponse.json(
        { error: ERROR_MESSAGES[result.code] || "Gagal memproses pengajuan." },
        { status: result.code === "NOT_FOUND" ? 404 : 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      request: result.request,
      otpSent: Boolean(result.otpDelivery?.ok),
      message: result.otpDelivery?.ok
        ? "Pengajuan disetujui. Kode OTP telah dikirim melalui WhatsApp."
        : `Pengajuan disetujui, tetapi OTP gagal dikirim: ${
            result.otpDelivery?.error || "kesalahan tidak diketahui"
          }. Gunakan tombol Kirim Ulang OTP.`,
    });
  }

  if (action === "reject") {
    if (!reason) {
      return NextResponse.json(
        { error: "Alasan penolakan wajib diisi." },
        { status: 400 }
      );
    }
    const result = await rejectWhatsAppRequest(id, user.id, reason);
    if (!result.ok) {
      return NextResponse.json(
        { error: ERROR_MESSAGES[result.code] || "Gagal menolak pengajuan." },
        { status: result.code === "NOT_FOUND" ? 404 : 409 }
      );
    }
    return NextResponse.json({ ok: true, request: result.request });
  }

  if (action === "resend-otp") {
    const result = await resendWhatsAppOtp(id);
    if (!result.ok) {
      return NextResponse.json(
        { error: ERROR_MESSAGES[result.code] || "Gagal mengirim ulang OTP." },
        { status: result.code === "NOT_FOUND" ? 404 : 409 }
      );
    }
    return NextResponse.json({
      ok: true,
      request: result.request,
      otpSent: Boolean(result.otpDelivery?.ok),
      message: result.otpDelivery?.ok
        ? "Kode OTP baru telah dikirim melalui WhatsApp."
        : `OTP gagal dikirim: ${
            result.otpDelivery?.error || "kesalahan tidak diketahui"
          }.`,
    });
  }

  return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  approveTelegramRequest,
  rejectTelegramRequest,
} from "@/lib/telegram-link";

const ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "Pengajuan tidak ditemukan.",
  INVALID_STATE:
    "Pengajuan sudah diproses atau statusnya berubah. Muat ulang halaman.",
  SELF_REVIEW: "Anda tidak dapat memverifikasi pengajuan milik sendiri.",
  PHONE_CHANGED:
    "Nomor HP pengguna sudah berubah. Pengajuan ini dicabut dan pengguna harus mengajukan ulang.",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "ADMIN" && user.role !== "PETUGAS") {
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

  let result;
  if (action === "approve") {
    result = await approveTelegramRequest(id, user.id);
  } else if (action === "reject") {
    if (!reason) {
      return NextResponse.json(
        { error: "Alasan penolakan wajib diisi." },
        { status: 400 }
      );
    }
    result = await rejectTelegramRequest(id, user.id, reason);
  } else {
    return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
  }

  if (!result.ok) {
    return NextResponse.json(
      { error: ERROR_MESSAGES[result.code] || "Gagal memproses pengajuan." },
      { status: result.code === "NOT_FOUND" ? 404 : 409 }
    );
  }

  return NextResponse.json({
    ok: true,
    activated: result.activated,
    warning:
      result.warning === "TELEGRAM_IN_USE"
        ? "Identitas Telegram pada pengajuan ini sudah dipakai akun lain. Pengajuan disetujui, tetapi pengguna harus mengonfirmasi ulang dengan akun Telegram miliknya."
        : null,
    request: result.request,
  });
}

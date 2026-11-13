import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  getTelegramLinkStatus,
  updateUserPhone,
} from "@/lib/telegram-link";

function errorMessage(code: string): string {
  switch (code) {
    case "INVALID_PHONE":
      return "Nomor HP tidak valid. Gunakan format 08..., 62..., atau +62....";
    case "PHONE_IN_USE":
      return "Nomor HP sudah digunakan oleh akun lain.";
    case "USER_NOT_FOUND":
      return "Pengguna tidak ditemukan.";
    default:
      return "Gagal menyimpan nomor HP.";
  }
}

export async function PATCH(request: NextRequest) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (sessionUser.role !== "MASYARAKAT") {
    return NextResponse.json(
      { error: "Fitur Telegram hanya tersedia untuk masyarakat." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  if (typeof body.phone !== "string") {
    return NextResponse.json(
      { error: "Field 'phone' harus berupa teks" },
      { status: 400 }
    );
  }

  const result = await updateUserPhone(sessionUser.id, body.phone);
  if (!result.ok) {
    return NextResponse.json(
      { error: errorMessage(result.code) },
      { status: result.code === "PHONE_IN_USE" ? 409 : 400 }
    );
  }

  const status = await getTelegramLinkStatus(sessionUser.id);
  return NextResponse.json({
    ...status,
    changed: result.changed,
    message: result.changed
      ? "Nomor HP disimpan. Pengajuan penautan Telegram dibuat otomatis dan menunggu persetujuan admin/petugas."
      : "Nomor HP tidak berubah.",
  });
}

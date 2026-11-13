import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  buildTelegramDeepLink,
  createTelegramConfirmationToken,
  getTelegramLinkStatus,
  resubmitTelegramRequest,
  revokeUserTelegramConnections,
} from "@/lib/telegram-link";

function tokenError(code: string) {
  switch (code) {
    case "NO_PHONE":
      return {
        status: 400,
        body: {
          error:
            "Tambahkan nomor HP terlebih dahulu sebelum menautkan Telegram.",
        },
      };
    case "ALREADY_ACTIVE":
      return {
        status: 409,
        body: { error: "Akun Telegram sudah aktif." },
      };
    case "NEEDS_RESUBMIT":
      return {
        status: 409,
        body: {
          error:
            "Pengajuan sebelumnya sudah ditolak/dicabut. Ajukan ulang terlebih dahulu.",
          needsResubmit: true,
        },
      };
    case "USER_NOT_FOUND":
      return {
        status: 404,
        body: { error: "Pengguna tidak ditemukan." },
      };
    default:
      return { status: 400, body: { error: "Gagal membuat kode konfirmasi." } };
  }
}

export async function GET() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (sessionUser.role !== "MASYARAKAT") {
    return NextResponse.json(
      { error: "Fitur tautan Telegram hanya tersedia untuk masyarakat." },
      { status: 403 }
    );
  }

  const status = await getTelegramLinkStatus(sessionUser.id);
  if (!status) {
    return NextResponse.json(
      { error: "Pengguna tidak ditemukan" },
      { status: 404 }
    );
  }

  return NextResponse.json(status);
}

export async function POST(request: NextRequest) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (sessionUser.role !== "MASYARAKAT") {
    return NextResponse.json(
      { error: "Fitur tautan Telegram hanya tersedia untuk masyarakat." },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const action = String(body.action ?? "confirmation");

  if (action === "resubmit") {
    const result = await resubmitTelegramRequest(sessionUser.id);
    if (!result.ok) {
      const mapped = tokenError(result.code);
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    const status = await getTelegramLinkStatus(sessionUser.id);
    return NextResponse.json({
      ...status,
      message:
        "Pengajuan ulang dibuat dan menunggu persetujuan admin/petugas.",
    });
  }

  const result = await createTelegramConfirmationToken(sessionUser.id);
  if (!result.ok) {
    const mapped = tokenError(result.code);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }

  const status = await getTelegramLinkStatus(sessionUser.id);
  return NextResponse.json({
    ...status,
    token: result.token,
    expiresAt: result.expiresAt.toISOString(),
    command: `/start ${result.token}`,
    deepLink: buildTelegramDeepLink(result.token),
  });
}

export async function PATCH(request: NextRequest) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (sessionUser.role !== "MASYARAKAT") {
    return NextResponse.json(
      { error: "Fitur tautan Telegram hanya tersedia untuk masyarakat." },
      { status: 403 }
    );
  }

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

  await prisma.user.update({
    where: { id: sessionUser.id },
    data: { telegramEnabled: body.enabled },
  });

  return NextResponse.json({ enabled: body.enabled });
}

export async function DELETE() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (sessionUser.role !== "MASYARAKAT") {
    return NextResponse.json(
      { error: "Fitur tautan Telegram hanya tersedia untuk masyarakat." },
      { status: 403 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await revokeUserTelegramConnections(tx, sessionUser.id);
  });

  const status = await getTelegramLinkStatus(sessionUser.id);
  return NextResponse.json({
    ...status,
    linked: false,
    message: "Tautan Telegram diputuskan.",
  });
}

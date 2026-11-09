import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getBotUsername, isTelegramConfigured } from "@/lib/telegram";

function statusPayload(user: {
  telegramChatId: string | null;
  telegramUsername: string | null;
  telegramLinkedAt: Date | null;
  telegramEnabled: boolean;
}) {
  return {
    linked: Boolean(user.telegramChatId),
    username: user.telegramUsername,
    linkedAt: user.telegramLinkedAt ? user.telegramLinkedAt.toISOString() : null,
    enabled: user.telegramEnabled,
    botConfigured: isTelegramConfigured(),
    botUsername: getBotUsername() || null,
  };
}

export async function GET() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      telegramChatId: true,
      telegramUsername: true,
      telegramLinkedAt: true,
      telegramEnabled: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Pengguna tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json(statusPayload(user));
}

export async function POST() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Batalkan token lama yang belum dipakai agar hanya satu token aktif.
  await prisma.telegramlinktoken.updateMany({
    where: {
      userId: sessionUser.id,
      usedAt: null,
      expiresAt: { gt: now },
    },
    data: { expiresAt: new Date(0) },
  });

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);

  await prisma.telegramlinktoken.create({
    data: { token, userId: sessionUser.id, expiresAt },
  });

  const botUsername = getBotUsername();

  return NextResponse.json({
    token,
    expiresAt: expiresAt.toISOString(),
    command: `/start ${token}`,
    deepLink: botUsername ? `https://t.me/${botUsername}?start=${token}` : null,
    botConfigured: isTelegramConfigured(),
    botUsername: botUsername || null,
  });
}

export async function PATCH(request: NextRequest) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  await prisma.user.update({
    where: { id: sessionUser.id },
    data: {
      telegramChatId: null,
      telegramLinkedAt: null,
      telegramUsername: null,
    },
  });

  return NextResponse.json({ linked: false });
}

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getFonnteConfig, sendWhatsAppMessage } from "@/lib/fonnte";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (user.role !== "ADMIN") {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { user };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const [
    verifiedUsers,
    totalNotifications,
    sent,
    failed,
    pendingAdmin,
    pendingVerification,
    activeLinks,
  ] = await Promise.all([
    prisma.user.count({ where: { whatsappNumber: { not: null } } }),
    prisma.notification.count(),
    prisma.notification.count({ where: { whatsappSent: true } }),
    prisma.notification.count({
      where: { whatsappSent: false, whatsappError: { not: null } },
    }),
    prisma.whatsapplinkrequest.count({ where: { status: "PENDING_ADMIN" } }),
    prisma.whatsapplinkrequest.count({
      where: { status: "PENDING_VERIFICATION" },
    }),
    prisma.whatsapplinkrequest.count({ where: { status: "ACTIVE" } }),
  ]);

  const config = getFonnteConfig();

  return NextResponse.json({
    configured: config.configured,
    env: {
      hasToken: config.configured,
      apiUrl: config.apiUrl,
      countryCode: config.countryCode,
      timeoutMs: config.timeoutMs,
    },
    counts: {
      verifiedUsers,
      totalNotifications,
      sent,
      failed,
      pendingAdmin,
      pendingVerification,
      activeLinks,
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const action = String(body.action ?? "");

  if (action === "test") {
    if (!getFonnteConfig().configured) {
      return NextResponse.json(
        { ok: false, error: "FONNTE_API_TOKEN belum diatur di .env" },
        { status: 400 }
      );
    }

    const target =
      typeof body.phone === "string" && body.phone.trim()
        ? body.phone.trim()
        : (
            await prisma.user.findUnique({
              where: { id: auth.user.id },
              select: { whatsappNumber: true },
            })
          )?.whatsappNumber;

    if (!target) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Masukkan nomor WhatsApp tujuan uji atau tautkan nomor pada akun Anda terlebih dahulu.",
        },
        { status: 400 }
      );
    }

    const result = await sendWhatsAppMessage(
      target,
      "✅ *Uji koneksi berhasil.*\n\nKanal notifikasi WhatsApp Pelaporan Fasilitas siap digunakan."
    );

    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  }

  return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
}

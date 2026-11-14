"use server";

import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";
import { createWhatsAppLinkRequest } from "@/lib/whatsapp-link";

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  phone?: string;
}) {
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existingUser) {
    return { error: "Email sudah terdaftar" };
  }

  const rawPhone = (data.phone || "").trim();
  const phoneNormalized = rawPhone ? normalizePhoneNumber(rawPhone) : null;
  if (rawPhone && !phoneNormalized) {
    return {
      error: "Nomor HP tidak valid. Gunakan format 08..., 62..., atau +62....",
    };
  }

  if (phoneNormalized) {
    const phoneOwner = await prisma.user.findFirst({
      where: { phoneNormalized },
      select: { id: true },
    });
    if (phoneOwner) {
      return { error: "Nomor HP sudah digunakan oleh akun lain" };
    }

    const pendingOwner = await prisma.whatsapplinkrequest.findFirst({
      where: {
        phoneNormalized,
        status: { in: ["PENDING_ADMIN", "PENDING_VERIFICATION", "ACTIVE"] },
      },
      select: { id: true },
    });
    if (pendingOwner) {
      return { error: "Nomor HP sedang digunakan oleh akun lain" };
    }
  }

  const hashedPassword = await bcrypt.hash(data.password, 12);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          password: hashedPassword,
          role: "MASYARAKAT",
          phone: phoneNormalized
            ? `0${phoneNormalized.slice(2)}`
            : rawPhone || null,
          phoneNormalized,
        },
      });

      // Pengajuan otomatis dibuat atomik bersama akun.
      if (phoneNormalized) {
        await createWhatsAppLinkRequest(tx, {
          userId: created.id,
          phoneNormalized,
          requestType: "INITIAL",
          previousPhoneNormalized: null,
        });
      }

      return created;
    });

    return {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { error: "Email atau nomor HP sudah terdaftar" };
    }
    console.error("Gagal membuat akun:", error);
    return { error: "Terjadi kesalahan saat pendaftaran" };
  }
}

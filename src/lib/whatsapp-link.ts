import crypto from "crypto";
import { Prisma, whatsapp_link_status } from "@prisma/client";
import prisma from "@/lib/prisma";
import { formatPhoneNumber, normalizePhoneNumber } from "@/lib/phone";
import {
  isFonnteConfigured,
  maskWhatsAppNumber,
  sanitizeFonnteError,
  sendWhatsAppMessage,
} from "@/lib/fonnte";

export const WHATSAPP_OTP_TTL_MS = 10 * 60 * 1000;
export const WHATSAPP_OTP_MAX_ATTEMPTS = 5;
export const WHATSAPP_OTP_LENGTH = 6;

const PENDING_STATUSES: whatsapp_link_status[] = [
  "PENDING_ADMIN",
  "PENDING_VERIFICATION",
];

const OTP_SECRET =
  process.env.WHATSAPP_OTP_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  "pelaporan-fasilitas-otp-dev-secret";

export const WHATSAPP_REQUEST_STATUS_LABEL: Record<
  whatsapp_link_status,
  string
> = {
  PENDING_ADMIN: "Menunggu Persetujuan Admin",
  PENDING_VERIFICATION: "Menunggu Verifikasi OTP",
  ACTIVE: "Aktif",
  REJECTED: "Ditolak",
  REVOKED: "Dicabut",
  EXPIRED: "Kedaluwarsa",
};

export const WHATSAPP_REQUEST_TYPE_LABEL: Record<string, string> = {
  INITIAL: "Penautan Awal",
  PHONE_CHANGE: "Perubahan Nomor",
  RELINK: "Penautan Ulang",
};

type RequestWithReviewer = Prisma.whatsapplinkrequestGetPayload<{
  include: {
    reviewedBy: { select: { id: true; name: true; email: true } };
  };
}>;

export type WhatsAppRequestView = {
  id: string;
  userId: string;
  status: whatsapp_link_status;
  statusLabel: string;
  requestType: string;
  requestTypeLabel: string;
  phone: string;
  phoneDisplay: string;
  phoneNormalized: string;
  previousPhoneNormalized: string | null;
  previousPhoneDisplay: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  reviewerName: string | null;
  reviewerEmail: string | null;
  createdAt: string;
  updatedAt: string;
  otpExpiresAt: string | null;
  otpSentAt: string | null;
  otpSendError: string | null;
  otpAttempts: number;
  otpMaxAttempts: number;
  otpVerifiedAt: string | null;
  active: boolean;
};

export type WhatsAppLinkStatus = {
  linked: boolean;
  number: string | null;
  numberDisplay: string | null;
  linkedAt: string | null;
  verifiedAt: string | null;
  enabled: boolean;
  fonnteConfigured: boolean;
  phone: string | null;
  phoneNormalized: string | null;
  request: WhatsAppRequestView | null;
};

export function hashWhatsAppOtp(requestId: string, otp: string): string {
  return crypto
    .createHmac("sha256", OTP_SECRET)
    .update(`${requestId}:${otp}`)
    .digest("hex");
}

export function generateWhatsAppOtp(): string {
  const min = 10 ** (WHATSAPP_OTP_LENGTH - 1);
  const max = 10 ** WHATSAPP_OTP_LENGTH;
  return String(crypto.randomInt(min, max));
}

function safeCompareHash(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function whatsAppRequestToView(
  request: RequestWithReviewer
): WhatsAppRequestView {
  return {
    id: request.id,
    userId: request.userId,
    status: request.status,
    statusLabel: WHATSAPP_REQUEST_STATUS_LABEL[request.status],
    requestType: request.requestType,
    requestTypeLabel:
      WHATSAPP_REQUEST_TYPE_LABEL[request.requestType] || request.requestType,
    phone: request.phone,
    phoneDisplay: formatPhoneNumber(request.phoneNormalized),
    phoneNormalized: request.phoneNormalized,
    previousPhoneNormalized: request.previousPhoneNormalized,
    previousPhoneDisplay: request.previousPhoneNormalized
      ? formatPhoneNumber(request.previousPhoneNormalized)
      : null,
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
    rejectionReason: request.rejectionReason,
    reviewerName: request.reviewedBy?.name ?? null,
    reviewerEmail: request.reviewedBy?.email ?? null,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    otpExpiresAt: request.otpExpiresAt?.toISOString() ?? null,
    otpSentAt: request.otpSentAt?.toISOString() ?? null,
    otpSendError: request.otpSendError,
    otpAttempts: request.otpAttempts,
    otpMaxAttempts: WHATSAPP_OTP_MAX_ATTEMPTS,
    otpVerifiedAt: request.otpUsedAt?.toISOString() ?? null,
    active: request.status === "ACTIVE",
  };
}

const reviewerInclude = {
  reviewedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.whatsapplinkrequestInclude;

export async function getLatestWhatsAppRequest(userId: string) {
  return prisma.whatsapplinkrequest.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: reviewerInclude,
  });
}

export async function getWhatsAppLinkStatus(
  userId: string
): Promise<WhatsAppLinkStatus | null> {
  const [user, request] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        phone: true,
        phoneNormalized: true,
        whatsappNumber: true,
        whatsappLinkedAt: true,
        whatsappVerifiedAt: true,
        whatsappEnabled: true,
      },
    }),
    getLatestWhatsAppRequest(userId),
  ]);

  if (!user) return null;

  // Nomor lama tetap dianggap tertaut selama pengajuan perubahan nomor belum
  // terverifikasi. Karena itu status ACTIVE dicari terpisah dari pengajuan
  // terbaru (yang mungkin masih PENDING_ADMIN/PENDING_VERIFICATION).
  const activeRequest = user.whatsappNumber
    ? await prisma.whatsapplinkrequest.findFirst({
        where: {
          userId,
          status: "ACTIVE",
          phoneNormalized: user.whatsappNumber,
        },
        orderBy: { createdAt: "desc" },
        include: reviewerInclude,
      })
    : null;

  const linked = Boolean(
    user.whatsappNumber && user.whatsappVerifiedAt && activeRequest
  );

  return {
    linked,
    number: linked ? user.whatsappNumber : null,
    numberDisplay: linked ? formatPhoneNumber(user.whatsappNumber) : null,
    linkedAt: linked ? user.whatsappLinkedAt?.toISOString() ?? null : null,
    verifiedAt: linked ? user.whatsappVerifiedAt?.toISOString() ?? null : null,
    enabled: user.whatsappEnabled,
    fonnteConfigured: isFonnteConfigured(),
    phone: user.phone,
    phoneNormalized: user.phoneNormalized,
    request: request ? whatsAppRequestToView(request) : null,
  };
}

function clearOtpData() {
  return {
    otpHash: null,
    otpExpiresAt: null,
    otpUsedAt: null,
    otpAttempts: 0,
  };
}

function revokePendingRequestData(now: Date) {
  return {
    status: "REVOKED" as const,
    ...clearOtpData(),
    updatedAt: now,
  };
}

export async function createWhatsAppLinkRequest(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    phoneNormalized: string;
    requestType: "INITIAL" | "PHONE_CHANGE" | "RELINK";
    previousPhoneNormalized?: string | null;
  }
) {
  return tx.whatsapplinkrequest.create({
    data: {
      userId: input.userId,
      phone: formatPhoneNumber(input.phoneNormalized),
      phoneNormalized: input.phoneNormalized,
      previousPhoneNormalized: input.previousPhoneNormalized ?? null,
      requestType: input.requestType,
      status: "PENDING_ADMIN",
    },
    include: reviewerInclude,
  });
}

export type SubmitWhatsAppNumberResult =
  | {
      ok: true;
      changed: boolean;
      request: WhatsAppRequestView | null;
      message: string;
    }
  | {
      ok: false;
      code: "INVALID_PHONE" | "PHONE_IN_USE" | "USER_NOT_FOUND" | "ALREADY_ACTIVE";
    };

/**
 * Mengajukan nomor WhatsApp baru. Nomor yang sudah aktif TIDAK dicabut di sini;
 * pencabutan nomor lama hanya terjadi setelah nomor baru lolos verifikasi OTP.
 */
export async function submitWhatsAppNumber(
  userId: string,
  phoneInput: unknown
): Promise<SubmitWhatsAppNumberResult> {
  const raw = typeof phoneInput === "string" ? phoneInput.trim() : "";
  const phoneNormalized = raw ? normalizePhoneNumber(raw) : null;
  if (!phoneNormalized) {
    return { ok: false, code: "INVALID_PHONE" };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          phone: true,
          phoneNormalized: true,
          whatsappNumber: true,
          whatsappVerifiedAt: true,
        },
      });
      if (!user) {
        return { ok: false as const, code: "USER_NOT_FOUND" as const };
      }

      const activeSame =
        user.whatsappNumber === phoneNormalized &&
        Boolean(user.whatsappVerifiedAt);
      if (activeSame) {
        const active = await tx.whatsapplinkrequest.findFirst({
          where: {
            userId,
            status: "ACTIVE",
            phoneNormalized,
          },
          orderBy: { createdAt: "desc" },
          include: reviewerInclude,
        });
        return {
          ok: true as const,
          changed: false,
          request: active ? whatsAppRequestToView(active) : null,
          message: "Nomor WhatsApp ini sudah aktif dan terverifikasi.",
        };
      }

      const conflict = await tx.user.findFirst({
        where: {
          id: { not: userId },
          OR: [
            { whatsappNumber: phoneNormalized },
            { phoneNormalized },
          ],
        },
        select: { id: true },
      });
      if (conflict) {
        return { ok: false as const, code: "PHONE_IN_USE" as const };
      }

      // Cegah dua pengguna mengajukan nomor yang sama sebelum nomor tersebut
      // sempat tersimpan di tabel user.
      const requestConflict = await tx.whatsapplinkrequest.findFirst({
        where: {
          userId: { not: userId },
          phoneNormalized,
          status: { in: [...PENDING_STATUSES, "ACTIVE"] },
        },
        select: { id: true },
      });
      if (requestConflict) {
        return { ok: false as const, code: "PHONE_IN_USE" as const };
      }

      const pending = await tx.whatsapplinkrequest.findFirst({
        where: { userId, status: { in: PENDING_STATUSES } },
        orderBy: { createdAt: "desc" },
        include: reviewerInclude,
      });

      if (pending && pending.phoneNormalized === phoneNormalized) {
        return {
          ok: true as const,
          changed: false,
          request: whatsAppRequestToView(pending),
          message:
            "Pengajuan untuk nomor ini sudah ada dan sedang menunggu proses berikutnya.",
        };
      }

      if (pending) {
        await tx.whatsapplinkrequest.update({
          where: { id: pending.id },
          data: revokePendingRequestData(new Date()),
        });
      }

      const previous = user.whatsappNumber ?? user.phoneNormalized;
      const created = await createWhatsAppLinkRequest(tx, {
        userId,
        phoneNormalized,
        requestType: previous ? "PHONE_CHANGE" : "INITIAL",
        previousPhoneNormalized: previous,
      });

      return {
        ok: true as const,
        changed: true,
        request: whatsAppRequestToView(created),
        message:
          "Pengajuan nomor WhatsApp dibuat dan menunggu persetujuan admin.",
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, code: "PHONE_IN_USE" };
    }
    throw error;
  }
}

export type ResubmitWhatsAppResult =
  | { ok: true; request: WhatsAppRequestView; message: string }
  | { ok: false; code: "NO_PHONE" | "USER_NOT_FOUND" | "ALREADY_ACTIVE" };

export async function resubmitWhatsAppRequest(
  userId: string
): Promise<ResubmitWhatsAppResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      phone: true,
      phoneNormalized: true,
      whatsappNumber: true,
      whatsappVerifiedAt: true,
    },
  });
  if (!user) return { ok: false, code: "USER_NOT_FOUND" };

  const latest = await getLatestWhatsAppRequest(userId);
  const phoneNormalized =
    latest?.phoneNormalized ??
    user.whatsappNumber ??
    user.phoneNormalized ??
    normalizePhoneNumber(user.phone);
  if (!phoneNormalized) return { ok: false, code: "NO_PHONE" };

  if (
    user.whatsappNumber === phoneNormalized &&
    user.whatsappVerifiedAt &&
    latest?.status === "ACTIVE"
  ) {
    return { ok: false, code: "ALREADY_ACTIVE" };
  }

  const request = await prisma.$transaction(async (tx) => {
    await tx.whatsapplinkrequest.updateMany({
      where: { userId, status: { in: PENDING_STATUSES } },
      data: revokePendingRequestData(new Date()),
    });

    return createWhatsAppLinkRequest(tx, {
      userId,
      phoneNormalized,
      requestType: "RELINK",
      previousPhoneNormalized: user.whatsappNumber ?? user.phoneNormalized,
    });
  });

  return {
    ok: true,
    request: whatsAppRequestToView(request),
    message: "Pengajuan ulang dibuat dan menunggu persetujuan admin.",
  };
}

export type OtpDeliveryResult = { ok: boolean; error?: string };

function buildOtpMessage(otp: string): string {
  const minutes = Math.round(WHATSAPP_OTP_TTL_MS / 60_000);
  return [
    "*Pelaporan Fasilitas*",
    "",
    `Kode verifikasi WhatsApp Anda: *${otp}*`,
    "",
    `Kode berlaku ${minutes} menit dan hanya dapat digunakan satu kali.`,
    "Jangan bagikan kode ini kepada siapa pun.",
  ].join("\n");
}

async function deliverOtp(
  requestId: string,
  phoneNormalized: string,
  otp: string
): Promise<OtpDeliveryResult> {
  const result = await sendWhatsAppMessage(phoneNormalized, buildOtpMessage(otp));

  try {
    await prisma.whatsapplinkrequest.update({
      where: { id: requestId },
      data: result.ok
        ? {
            otpSentAt: new Date(),
            otpSendError: null,
          }
        : {
            otpSentAt: null,
            otpSendError: result.error || "Gagal mengirim OTP.",
          },
    });
  } catch (error) {
    console.error(
      "Gagal menyimpan status pengiriman OTP WhatsApp:",
      requestId,
      sanitizeFonnteError(error)
    );
  }

  if (!result.ok) {
    console.error(
      "Gagal mengirim OTP WhatsApp ke",
      maskWhatsAppNumber(phoneNormalized),
      "-",
      result.error
    );
  }

  return { ok: result.ok, error: result.ok ? undefined : result.error };
}

type ApproveTxResult =
  | {
      ok: true;
      request: RequestWithReviewer;
      otp: string;
      phoneNormalized: string;
    }
  | {
      ok: false;
      code: "NOT_FOUND" | "INVALID_STATE" | "SELF_REVIEW" | "PHONE_CHANGED";
    };

export type ReviewWhatsAppResult =
  | {
      ok: true;
      request: WhatsAppRequestView;
      otpDelivery?: OtpDeliveryResult;
    }
  | {
      ok: false;
      code: "NOT_FOUND" | "INVALID_STATE" | "SELF_REVIEW" | "PHONE_CHANGED";
    };

export async function approveWhatsAppRequest(
  requestId: string,
  reviewerId: string
): Promise<ReviewWhatsAppResult> {
  const result = await prisma.$transaction(async (tx): Promise<ApproveTxResult> => {
    const request = await tx.whatsapplinkrequest.findUnique({
      where: { id: requestId },
    });

    if (!request) return { ok: false, code: "NOT_FOUND" };
    if (request.userId === reviewerId) {
      return { ok: false, code: "SELF_REVIEW" };
    }
    if (request.status !== "PENDING_ADMIN") {
      return { ok: false, code: "INVALID_STATE" };
    }

    const now = new Date();
    const otp = generateWhatsAppOtp();
    const otpHash = hashWhatsAppOtp(request.id, otp);
    const expiresAt = new Date(now.getTime() + WHATSAPP_OTP_TTL_MS);

    const updated = await tx.whatsapplinkrequest.updateMany({
      where: { id: request.id, status: "PENDING_ADMIN" },
      data: {
        status: "PENDING_VERIFICATION",
        reviewedById: reviewerId,
        reviewedAt: now,
        rejectionReason: null,
        otpHash,
        otpExpiresAt: expiresAt,
        otpUsedAt: null,
        otpAttempts: 0,
        otpSentAt: null,
        otpSendError: null,
      },
    });

    if (updated.count === 0) return { ok: false, code: "INVALID_STATE" };

    const fresh = await tx.whatsapplinkrequest.findUniqueOrThrow({
      where: { id: request.id },
      include: reviewerInclude,
    });

    return {
      ok: true,
      request: fresh,
      otp,
      phoneNormalized: request.phoneNormalized,
    };
  });

  if (!result.ok) return result;

  const otpDelivery = await deliverOtp(
    result.request.id,
    result.phoneNormalized,
    result.otp
  );

  const fresh = await prisma.whatsapplinkrequest.findUniqueOrThrow({
    where: { id: result.request.id },
    include: reviewerInclude,
  });

  return {
    ok: true,
    request: whatsAppRequestToView(fresh),
    otpDelivery,
  };
}

export async function resendWhatsAppOtp(
  requestId: string
): Promise<ReviewWhatsAppResult> {
  const request = await prisma.whatsapplinkrequest.findUnique({
    where: { id: requestId },
  });

  if (!request) return { ok: false, code: "NOT_FOUND" };
  if (request.status !== "PENDING_VERIFICATION") {
    return { ok: false, code: "INVALID_STATE" };
  }

  const now = new Date();
  const otp = generateWhatsAppOtp();
  const otpHash = hashWhatsAppOtp(request.id, otp);
  const expiresAt = new Date(now.getTime() + WHATSAPP_OTP_TTL_MS);

  const updated = await prisma.whatsapplinkrequest.updateMany({
    where: { id: request.id, status: "PENDING_VERIFICATION" },
    data: {
      otpHash,
      otpExpiresAt: expiresAt,
      otpUsedAt: null,
      otpAttempts: 0,
      otpSentAt: null,
      otpSendError: null,
    },
  });

  if (updated.count === 0) return { ok: false, code: "INVALID_STATE" };

  const otpDelivery = await deliverOtp(
    request.id,
    request.phoneNormalized,
    otp
  );

  const fresh = await prisma.whatsapplinkrequest.findUniqueOrThrow({
    where: { id: request.id },
    include: reviewerInclude,
  });

  return {
    ok: true,
    request: whatsAppRequestToView(fresh),
    otpDelivery,
  };
}

export type RejectWhatsAppResult =
  | { ok: true; request: WhatsAppRequestView }
  | {
      ok: false;
      code: "NOT_FOUND" | "INVALID_STATE" | "SELF_REVIEW";
    };

export async function rejectWhatsAppRequest(
  requestId: string,
  reviewerId: string,
  reason: string
): Promise<RejectWhatsAppResult> {
  return prisma.$transaction(async (tx) => {
    const request = await tx.whatsapplinkrequest.findUnique({
      where: { id: requestId },
      select: { id: true, userId: true, status: true },
    });

    if (!request) return { ok: false as const, code: "NOT_FOUND" as const };
    if (request.userId === reviewerId) {
      return { ok: false as const, code: "SELF_REVIEW" as const };
    }
    if (request.status !== "PENDING_ADMIN") {
      return { ok: false as const, code: "INVALID_STATE" as const };
    }

    const now = new Date();
    const updated = await tx.whatsapplinkrequest.updateMany({
      where: { id: request.id, status: "PENDING_ADMIN" },
      data: {
        status: "REJECTED",
        reviewedById: reviewerId,
        reviewedAt: now,
        rejectionReason: reason.trim().slice(0, 1000) || null,
        ...clearOtpData(),
      },
    });

    if (updated.count === 0) {
      return { ok: false as const, code: "INVALID_STATE" as const };
    }

    const fresh = await tx.whatsapplinkrequest.findUniqueOrThrow({
      where: { id: request.id },
      include: reviewerInclude,
    });

    return { ok: true as const, request: whatsAppRequestToView(fresh) };
  });
}

export type VerifyWhatsAppOtpResult =
  | {
      ok: true;
      request: WhatsAppRequestView;
      linked: true;
    }
  | {
      ok: false;
      code:
        | "INVALID_STATE"
        | "OTP_EXPIRED"
        | "INVALID_OTP"
        | "TOO_MANY_ATTEMPTS"
        | "PHONE_IN_USE";
      remainingAttempts?: number;
    };

export async function verifyWhatsAppOtp(
  userId: string,
  otpInput: unknown
): Promise<VerifyWhatsAppOtpResult> {
  const otp = typeof otpInput === "string" ? otpInput.trim() : "";
  if (!new RegExp(`^\\d{${WHATSAPP_OTP_LENGTH}}$`).test(otp)) {
    return { ok: false, code: "INVALID_OTP" };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const request = await tx.whatsapplinkrequest.findFirst({
        where: { userId, status: "PENDING_VERIFICATION" },
        orderBy: { createdAt: "desc" },
      });

      if (!request || !request.otpHash) {
        return { ok: false as const, code: "INVALID_STATE" as const };
      }

      if (request.otpAttempts >= WHATSAPP_OTP_MAX_ATTEMPTS) {
        await tx.whatsapplinkrequest.update({
          where: { id: request.id },
          data: { status: "EXPIRED", ...clearOtpData() },
        });
        return { ok: false as const, code: "TOO_MANY_ATTEMPTS" as const };
      }

      if (!request.otpExpiresAt || request.otpExpiresAt.getTime() < Date.now()) {
        await tx.whatsapplinkrequest.update({
          where: { id: request.id },
          data: { status: "EXPIRED", ...clearOtpData() },
        });
        return { ok: false as const, code: "OTP_EXPIRED" as const };
      }

      const expectedHash = hashWhatsAppOtp(request.id, otp);
      if (!safeCompareHash(expectedHash, request.otpHash)) {
        const nextAttempts = request.otpAttempts + 1;
        if (nextAttempts >= WHATSAPP_OTP_MAX_ATTEMPTS) {
          await tx.whatsapplinkrequest.update({
            where: { id: request.id },
            data: { status: "EXPIRED", ...clearOtpData() },
          });
          return { ok: false as const, code: "TOO_MANY_ATTEMPTS" as const };
        }

        await tx.whatsapplinkrequest.update({
          where: { id: request.id },
          data: { otpAttempts: nextAttempts },
        });

        return {
          ok: false as const,
          code: "INVALID_OTP" as const,
          remainingAttempts: WHATSAPP_OTP_MAX_ATTEMPTS - nextAttempts,
        };
      }

      // Nomor tidak boleh dipakai akun lain. Pemeriksaan dilakukan tepat
      // sebelum aktivasi agar pengajuan paralel tidak menghasilkan duplikat.
      const conflict = await tx.user.findFirst({
        where: {
          id: { not: userId },
          OR: [
            { whatsappNumber: request.phoneNormalized },
            { phoneNormalized: request.phoneNormalized },
          ],
        },
        select: { id: true },
      });
      if (conflict) {
        return { ok: false as const, code: "PHONE_IN_USE" as const };
      }

      const requestConflict = await tx.whatsapplinkrequest.findFirst({
        where: {
          id: { not: request.id },
          phoneNormalized: request.phoneNormalized,
          status: { in: [...PENDING_STATUSES, "ACTIVE"] },
        },
        select: { id: true },
      });
      if (requestConflict) {
        return { ok: false as const, code: "PHONE_IN_USE" as const };
      }

      const now = new Date();

      // Nomor lama baru dinonaktifkan setelah OTP nomor baru terbukti valid.
      await tx.whatsapplinkrequest.updateMany({
        where: { userId, status: "ACTIVE", id: { not: request.id } },
        data: {
          status: "REVOKED",
          ...clearOtpData(),
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: {
          whatsappNumber: request.phoneNormalized,
          whatsappVerifiedAt: now,
          whatsappLinkedAt: now,
          whatsappEnabled: true,
          phone: formatPhoneNumber(request.phoneNormalized),
          phoneNormalized: request.phoneNormalized,
        },
      });

      const updated = await tx.whatsapplinkrequest.update({
        where: { id: request.id },
        data: {
          status: "ACTIVE",
          otpUsedAt: now,
          otpHash: null,
          otpExpiresAt: null,
          otpAttempts: 0,
          otpSendError: null,
        },
        include: reviewerInclude,
      });

      return {
        ok: true as const,
        request: whatsAppRequestToView(updated),
        linked: true as const,
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, code: "PHONE_IN_USE" };
    }
    throw error;
  }
}

export async function setWhatsAppEnabled(
  userId: string,
  enabled: boolean
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { whatsappEnabled: enabled },
  });
}

export async function revokeWhatsAppLink(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.whatsapplinkrequest.updateMany({
      where: {
        userId,
        status: { in: [...PENDING_STATUSES, "ACTIVE"] },
      },
      data: {
        status: "REVOKED",
        ...clearOtpData(),
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        whatsappNumber: null,
        whatsappVerifiedAt: null,
        whatsappLinkedAt: null,
      },
    });
  });
}

export type VerificationRequestView = WhatsAppRequestView & {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    phoneNormalized: string | null;
    whatsappNumber: string | null;
  };
};

export async function getWhatsAppVerificationData() {
  const [pendingAdmin, pendingVerification, active, requests] =
    await Promise.all([
      prisma.whatsapplinkrequest.count({ where: { status: "PENDING_ADMIN" } }),
      prisma.whatsapplinkrequest.count({
        where: { status: "PENDING_VERIFICATION" },
      }),
      prisma.whatsapplinkrequest.count({ where: { status: "ACTIVE" } }),
      prisma.whatsapplinkrequest.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          ...reviewerInclude,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              phoneNormalized: true,
              whatsappNumber: true,
            },
          },
        },
      }),
    ]);

  return {
    counts: {
      pendingAdmin,
      pendingVerification,
      active,
      total: await prisma.whatsapplinkrequest.count(),
    },
    requests: requests.map<VerificationRequestView>((request) => ({
      ...whatsAppRequestToView(request),
      user: {
        id: request.user.id,
        name: request.user.name,
        email: request.user.email,
        phone: request.user.phone,
        phoneNormalized: request.user.phoneNormalized,
        whatsappNumber: request.user.whatsappNumber,
      },
    })),
  };
}

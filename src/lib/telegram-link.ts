import crypto from "crypto";
import { Prisma, telegram_link_status } from "@prisma/client";
import prisma from "@/lib/prisma";
import { formatPhoneNumber, normalizePhoneNumber } from "@/lib/phone";
import { getBotUsername, isTelegramConfigured } from "@/lib/telegram";

export const TELEGRAM_TOKEN_TTL_MS = 15 * 60 * 1000;

const PENDING_STATUSES: telegram_link_status[] = [
  "PENDING_ADMIN",
  "PENDING_TELEGRAM",
];

export const TELEGRAM_REQUEST_STATUS_LABEL: Record<
  telegram_link_status,
  string
> = {
  PENDING_ADMIN: "Menunggu Persetujuan Admin",
  PENDING_TELEGRAM: "Menunggu Konfirmasi Telegram",
  ACTIVE: "Aktif",
  REJECTED: "Ditolak",
  REVOKED: "Dicabut",
  EXPIRED: "Kedaluwarsa",
};

export const TELEGRAM_REQUEST_TYPE_LABEL: Record<string, string> = {
  INITIAL: "Penautan Awal",
  PHONE_CHANGE: "Perubahan Nomor HP",
  RELINK: "Penautan Ulang",
};

type RequestWithReviewer = Prisma.telegramlinkrequestGetPayload<{
  include: {
    reviewedBy: { select: { id: true; name: true; email: true } };
  };
}>;

export type TelegramRequestView = {
  id: string;
  userId: string;
  status: telegram_link_status;
  statusLabel: string;
  requestType: string;
  requestTypeLabel: string;
  phone: string;
  phoneDisplay: string;
  phoneNormalized: string;
  previousPhoneNormalized: string | null;
  previousPhoneDisplay: string | null;
  telegramUserId: string | null;
  telegramChatId: string | null;
  telegramUsername: string | null;
  confirmedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  reviewerName: string | null;
  reviewerEmail: string | null;
  createdAt: string;
  updatedAt: string;
  tokenExpiresAt: string | null;
  confirmationStarted: boolean;
};

export type TelegramLinkStatus = {
  linked: boolean;
  username: string | null;
  linkedAt: string | null;
  enabled: boolean;
  botConfigured: boolean;
  botUsername: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  request: TelegramRequestView | null;
};

export function hashTelegramToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateTelegramToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function telegramRequestToView(
  request: RequestWithReviewer
): TelegramRequestView {
  return {
    id: request.id,
    userId: request.userId,
    status: request.status,
    statusLabel: TELEGRAM_REQUEST_STATUS_LABEL[request.status],
    requestType: request.requestType,
    requestTypeLabel:
      TELEGRAM_REQUEST_TYPE_LABEL[request.requestType] || request.requestType,
    phone: request.phone,
    phoneDisplay: formatPhoneNumber(request.phoneNormalized),
    phoneNormalized: request.phoneNormalized,
    previousPhoneNormalized: request.previousPhoneNormalized,
    previousPhoneDisplay: request.previousPhoneNormalized
      ? formatPhoneNumber(request.previousPhoneNormalized)
      : null,
    telegramUserId: request.telegramUserId,
    telegramChatId: request.telegramChatId,
    telegramUsername: request.telegramUsername,
    confirmedAt: request.confirmedAt?.toISOString() ?? null,
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
    rejectionReason: request.rejectionReason,
    reviewerName: request.reviewedBy?.name ?? null,
    reviewerEmail: request.reviewedBy?.email ?? null,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    tokenExpiresAt: request.tokenExpiresAt?.toISOString() ?? null,
    confirmationStarted: Boolean(request.confirmationStartedAt),
  };
}

const reviewerInclude = {
  reviewedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.telegramlinkrequestInclude;

export async function getLatestTelegramRequest(userId: string) {
  return prisma.telegramlinkrequest.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: reviewerInclude,
  });
}

export async function getTelegramLinkStatus(
  userId: string
): Promise<TelegramLinkStatus | null> {
  const [user, request] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        phone: true,
        phoneNormalized: true,
        telegramChatId: true,
        telegramUsername: true,
        telegramLinkedAt: true,
        telegramEnabled: true,
      },
    }),
    getLatestTelegramRequest(userId),
  ]);

  if (!user) return null;

  const activeRequest =
    request &&
    request.status === "ACTIVE" &&
    request.telegramChatId === user.telegramChatId
      ? request
      : null;
  // Akun lama tanpa riwayat pengajuan tetap dianggap tertaut. Jika sudah ada
  // riwayat pengajuan, hanya koneksi ACTIVE yang cocok yang dianggap aktif.
  const linked = Boolean(user.telegramChatId) && (!request || Boolean(activeRequest));

  return {
    linked,
    username: linked ? user.telegramUsername : null,
    linkedAt: linked ? user.telegramLinkedAt?.toISOString() ?? null : null,
    enabled: user.telegramEnabled,
    botConfigured: isTelegramConfigured(),
    botUsername: getBotUsername() || null,
    phone: user.phone,
    phoneNormalized: user.phoneNormalized,
    request: request ? telegramRequestToView(request) : null,
  };
}

function revokeRequestData(now: Date) {
  return {
    status: "REVOKED" as const,
    tokenHash: null,
    tokenExpiresAt: null,
    candidateTelegramUserId: null,
    candidateTelegramChatId: null,
    candidateUsername: null,
    confirmationStartedAt: null,
    updatedAt: now,
  };
}

export async function revokeUserTelegramConnections(
  tx: Prisma.TransactionClient,
  userId: string
) {
  const now = new Date();
  await tx.telegramlinkrequest.updateMany({
    where: {
      userId,
      status: { in: [...PENDING_STATUSES, "ACTIVE"] },
    },
    data: revokeRequestData(now),
  });

  await tx.user.update({
    where: { id: userId },
    data: {
      telegramChatId: null,
      telegramLinkedAt: null,
      telegramUsername: null,
    },
  });
}

export async function createTelegramLinkRequest(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    phoneNormalized: string;
    requestType: "INITIAL" | "PHONE_CHANGE" | "RELINK";
    previousPhoneNormalized?: string | null;
  }
) {
  return tx.telegramlinkrequest.create({
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

/**
 * Membuat pengajuan otomatis jika pengguna punya nomor HP yang valid dan
 * belum punya pengajuan menunggu untuk nomor yang sama. Tidak pernah membuat
 * pengajuan duplikat.
 */
export async function ensureAutomaticTelegramRequest(
  userId: string,
  phoneInput: string | null | undefined
) {
  const phoneNormalized = normalizePhoneNumber(phoneInput);
  if (!phoneNormalized) return null;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        phoneNormalized: true,
        telegramChatId: true,
      },
    });
    if (!user) return null;

    const pending = await tx.telegramlinkrequest.findFirst({
      where: { userId, status: { in: PENDING_STATUSES } },
      orderBy: { createdAt: "desc" },
      include: reviewerInclude,
    });

    if (pending && pending.phoneNormalized === phoneNormalized) {
      return pending;
    }

    if (pending && pending.phoneNormalized !== phoneNormalized) {
      await tx.telegramlinkrequest.update({
        where: { id: pending.id },
        data: revokeRequestData(new Date()),
      });
    }

    // Koneksi aktif dengan nomor yang sama tidak perlu diajukan ulang.
    if (user.telegramChatId && user.phoneNormalized === phoneNormalized) {
      return null;
    }

    const previous = user.phoneNormalized;
    return createTelegramLinkRequest(tx, {
      userId,
      phoneNormalized,
      requestType: previous ? "PHONE_CHANGE" : "INITIAL",
      previousPhoneNormalized: previous,
    });
  });
}

export type UpdateUserPhoneResult =
  | { ok: true; changed: boolean; request: TelegramRequestView | null }
  | { ok: false; code: "INVALID_PHONE" | "PHONE_IN_USE" | "USER_NOT_FOUND" };

/**
 * Menyimpan nomor HP dan otomatis membuat pengajuan penautan ulang bila nomor
 * berubah. Koneksi Telegram lama selalu dicabut lebih dulu agar tidak ada
 * notifikasi yang dikirim ke identitas lama.
 */
export async function updateUserPhone(
  userId: string,
  phoneInput: string | null | undefined
): Promise<UpdateUserPhoneResult> {
  const raw = typeof phoneInput === "string" ? phoneInput.trim() : "";
  const phoneNormalized = raw ? normalizePhoneNumber(raw) : null;
  if (raw && !phoneNormalized) {
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
          telegramChatId: true,
        },
      });
      if (!user) return { ok: false as const, code: "USER_NOT_FOUND" as const };

      if ((user.phoneNormalized ?? null) === phoneNormalized) {
        return { ok: true as const, changed: false, request: null };
      }

      if (phoneNormalized) {
        const conflict = await tx.user.findFirst({
          where: {
            phoneNormalized,
            id: { not: userId },
          },
          select: { id: true },
        });
        if (conflict) {
          return { ok: false as const, code: "PHONE_IN_USE" as const };
        }
      }

      await revokeUserTelegramConnections(tx, userId);

      await tx.user.update({
        where: { id: userId },
        data: {
          phone: phoneNormalized ? formatPhoneNumber(phoneNormalized) : null,
          phoneNormalized,
        },
      });

      let request: TelegramRequestView | null = null;
      if (phoneNormalized) {
        const created = await createTelegramLinkRequest(tx, {
          userId,
          phoneNormalized,
          requestType: user.phoneNormalized ? "PHONE_CHANGE" : "INITIAL",
          previousPhoneNormalized: user.phoneNormalized,
        });
        request = telegramRequestToView(created);
      }

      return { ok: true as const, changed: true, request };
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

/**
 * Membuat token konfirmasi sekali pakai. Token mentah hanya dikembalikan ke
 * pemanggil; database hanya menyimpan hash SHA-256.
 */
export async function createTelegramConfirmationToken(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      phone: true,
      phoneNormalized: true,
      telegramChatId: true,
    },
  });
  if (!user) {
    return { ok: false as const, code: "USER_NOT_FOUND" as const };
  }
  if (user.telegramChatId) {
    return { ok: false as const, code: "ALREADY_ACTIVE" as const };
  }

  let request = await getLatestTelegramRequest(userId);

  if (!request || !PENDING_STATUSES.includes(request.status)) {
    if (request?.status === "ACTIVE") {
      return { ok: false as const, code: "ALREADY_ACTIVE" as const };
    }
    if (request && ["REJECTED", "REVOKED", "EXPIRED"].includes(request.status)) {
      return { ok: false as const, code: "NEEDS_RESUBMIT" as const };
    }

    const phoneNormalized =
      user.phoneNormalized ?? normalizePhoneNumber(user.phone);
    if (!phoneNormalized) {
      return { ok: false as const, code: "NO_PHONE" as const };
    }

    const created = await prisma.$transaction((tx) =>
      createTelegramLinkRequest(tx, {
        userId,
        phoneNormalized,
        requestType: "INITIAL",
      })
    );
    request = created;
  }

  const token = generateTelegramToken();
  const tokenHash = hashTelegramToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TELEGRAM_TOKEN_TTL_MS);

  const updated = await prisma.telegramlinkrequest.update({
    where: { id: request.id },
    data: {
      tokenHash,
      tokenExpiresAt: expiresAt,
      tokenUsedAt: null,
      candidateTelegramUserId: null,
      candidateTelegramChatId: null,
      candidateUsername: null,
      confirmationStartedAt: null,
    },
    include: reviewerInclude,
  });

  return {
    ok: true as const,
    token,
    expiresAt,
    request: telegramRequestToView(updated),
  };
}

export async function resubmitTelegramRequest(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      phone: true,
      phoneNormalized: true,
      telegramChatId: true,
    },
  });
  if (!user) {
    return { ok: false as const, code: "USER_NOT_FOUND" as const };
  }
  if (user.telegramChatId) {
    return { ok: false as const, code: "ALREADY_ACTIVE" as const };
  }

  const phoneNormalized =
    user.phoneNormalized ?? normalizePhoneNumber(user.phone);
  if (!phoneNormalized) {
    return { ok: false as const, code: "NO_PHONE" as const };
  }

  const request = await prisma.$transaction(async (tx) => {
    await tx.telegramlinkrequest.updateMany({
      where: {
        userId,
        status: { in: [...PENDING_STATUSES, "ACTIVE"] },
      },
      data: revokeRequestData(new Date()),
    });

    return createTelegramLinkRequest(tx, {
      userId,
      phoneNormalized,
      requestType: "RELINK",
      previousPhoneNormalized: user.phoneNormalized,
    });
  });

  return { ok: true as const, request: telegramRequestToView(request) };
}

type ActivationFailure =
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "PHONE_CHANGED"
  | "TELEGRAM_IN_USE"
  | "MISSING_IDENTITY";

async function activateRequestTx(
  tx: Prisma.TransactionClient,
  requestId: string
): Promise<
  | { ok: true; request: RequestWithReviewer }
  | { ok: false; code: ActivationFailure }
> {
  const request = await tx.telegramlinkrequest.findUnique({
    where: { id: requestId },
    include: {
      reviewedBy: { select: { id: true, name: true, email: true } },
      user: { select: { id: true, phone: true, phoneNormalized: true } },
    },
  });

  if (!request) return { ok: false, code: "NOT_FOUND" };
  if (request.status !== "PENDING_TELEGRAM") {
    return { ok: false, code: "INVALID_STATE" };
  }
  if (
    !request.telegramChatId ||
    !request.telegramUserId ||
    !request.confirmedAt
  ) {
    return { ok: false, code: "MISSING_IDENTITY" };
  }

  const currentPhone =
    request.user.phoneNormalized ?? normalizePhoneNumber(request.user.phone);
  if (currentPhone !== request.phoneNormalized) {
    await tx.telegramlinkrequest.update({
      where: { id: request.id },
      data: revokeRequestData(new Date()),
    });
    await tx.user.update({
      where: { id: request.userId },
      data: {
        telegramChatId: null,
        telegramLinkedAt: null,
        telegramUsername: null,
      },
    });
    return { ok: false, code: "PHONE_CHANGED" };
  }

  const conflict = await tx.user.findFirst({
    where: {
      telegramChatId: request.telegramChatId,
      id: { not: request.userId },
    },
    select: { id: true },
  });
  if (conflict) return { ok: false, code: "TELEGRAM_IN_USE" };

  const conflictRequest = await tx.telegramlinkrequest.findFirst({
    where: {
      status: "ACTIVE",
      telegramChatId: request.telegramChatId,
      userId: { not: request.userId },
    },
    select: { id: true },
  });
  if (conflictRequest) return { ok: false, code: "TELEGRAM_IN_USE" };

  // Satu koneksi aktif per pengguna: pencabutan riwayat aktif lama.
  await tx.telegramlinkrequest.updateMany({
    where: {
      userId: request.userId,
      status: "ACTIVE",
      id: { not: request.id },
    },
    data: revokeRequestData(new Date()),
  });

  const now = new Date();

  await tx.user.update({
    where: { id: request.userId },
    data: {
      telegramChatId: request.telegramChatId,
      telegramUsername: request.telegramUsername,
      telegramLinkedAt: now,
    },
  });

  const updated = await tx.telegramlinkrequest.update({
    where: { id: request.id },
    data: {
      status: "ACTIVE",
      confirmedAt: request.confirmedAt,
      tokenHash: null,
      tokenExpiresAt: null,
      tokenUsedAt: now,
      candidateTelegramUserId: null,
      candidateTelegramChatId: null,
      candidateUsername: null,
      confirmationStartedAt: null,
    },
    include: reviewerInclude,
  });

  return { ok: true, request: updated };
}

export type ConfirmIdentityResult =
  | {
      ok: true;
      activated: boolean;
      status: telegram_link_status;
      request: TelegramRequestView;
    }
  | {
      ok: false;
      code:
        | "NOT_FOUND"
        | "INVALID_STATE"
        | "TOKEN_EXPIRED"
        | "PHONE_CHANGED"
        | "TELEGRAM_IN_USE";
    };

export async function confirmTelegramIdentity(input: {
  requestId: string;
  telegramUserId: string;
  telegramChatId: string;
  telegramUsername: string | null;
}): Promise<ConfirmIdentityResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const request = await tx.telegramlinkrequest.findUnique({
        where: { id: input.requestId },
        include: {
          reviewedBy: { select: { id: true, name: true, email: true } },
          user: { select: { id: true, phone: true, phoneNormalized: true } },
        },
      });

      if (!request) return { ok: false as const, code: "NOT_FOUND" as const };
      if (!PENDING_STATUSES.includes(request.status)) {
        return { ok: false as const, code: "INVALID_STATE" as const };
      }
      if (
        request.tokenExpiresAt &&
        request.tokenExpiresAt.getTime() < Date.now()
      ) {
        return { ok: false as const, code: "TOKEN_EXPIRED" as const };
      }

      const currentPhone =
        request.user.phoneNormalized ??
        normalizePhoneNumber(request.user.phone);
      if (currentPhone !== request.phoneNormalized) {
        await tx.telegramlinkrequest.update({
          where: { id: request.id },
          data: revokeRequestData(new Date()),
        });
        return { ok: false as const, code: "PHONE_CHANGED" as const };
      }

      const conflict = await tx.user.findFirst({
        where: {
          telegramChatId: input.telegramChatId,
          id: { not: request.userId },
        },
        select: { id: true },
      });
      if (conflict) {
        return { ok: false as const, code: "TELEGRAM_IN_USE" as const };
      }

      const now = new Date();
      await tx.telegramlinkrequest.update({
        where: { id: request.id },
        data: {
          telegramUserId: input.telegramUserId,
          telegramChatId: input.telegramChatId,
          telegramUsername: input.telegramUsername,
          confirmedAt: now,
          tokenUsedAt: now,
          tokenHash: null,
          tokenExpiresAt: null,
          candidateTelegramUserId: null,
          candidateTelegramChatId: null,
          candidateUsername: null,
          confirmationStartedAt: null,
        },
      });

      if (request.status === "PENDING_TELEGRAM") {
        const activation = await activateRequestTx(tx, request.id);
        if (!activation.ok) {
          return { ok: false as const, code: activation.code as
            | "NOT_FOUND"
            | "INVALID_STATE"
            | "PHONE_CHANGED"
            | "TELEGRAM_IN_USE" };
        }
        return {
          ok: true as const,
          activated: true,
          status: "ACTIVE" as const,
          request: telegramRequestToView(activation.request),
        };
      }

      const updated = await tx.telegramlinkrequest.findUniqueOrThrow({
        where: { id: request.id },
        include: reviewerInclude,
      });

      return {
        ok: true as const,
        activated: false,
        status: updated.status,
        request: telegramRequestToView(updated),
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, code: "TELEGRAM_IN_USE" };
    }
    throw error;
  }
}

export type ReviewResult =
  | {
      ok: true;
      activated: boolean;
      warning?: "TELEGRAM_IN_USE";
      request: TelegramRequestView;
    }
  | {
      ok: false;
      code:
        | "NOT_FOUND"
        | "INVALID_STATE"
        | "SELF_REVIEW"
        | "PHONE_CHANGED";
    };

export async function approveTelegramRequest(
  requestId: string,
  reviewerId: string
): Promise<ReviewResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const request = await tx.telegramlinkrequest.findUnique({
        where: { id: requestId },
        include: {
          user: { select: { id: true, phone: true, phoneNormalized: true } },
        },
      });

      if (!request) return { ok: false as const, code: "NOT_FOUND" as const };
      if (request.userId === reviewerId) {
        return { ok: false as const, code: "SELF_REVIEW" as const };
      }
      if (request.status !== "PENDING_ADMIN") {
        return { ok: false as const, code: "INVALID_STATE" as const };
      }

      const currentPhone =
        request.user.phoneNormalized ??
        normalizePhoneNumber(request.user.phone);
      if (currentPhone !== request.phoneNormalized) {
        await tx.telegramlinkrequest.update({
          where: { id: request.id },
          data: revokeRequestData(new Date()),
        });
        return { ok: false as const, code: "PHONE_CHANGED" as const };
      }

      const now = new Date();
      const updated = await tx.telegramlinkrequest.updateMany({
        where: { id: request.id, status: "PENDING_ADMIN" },
        data: {
          status: "PENDING_TELEGRAM",
          reviewedById: reviewerId,
          reviewedAt: now,
          rejectionReason: null,
        },
      });

      if (updated.count === 0) {
        return { ok: false as const, code: "INVALID_STATE" as const };
      }

      if (request.confirmedAt && request.telegramChatId) {
        const activation = await activateRequestTx(tx, request.id);
        if (activation.ok) {
          return {
            ok: true as const,
            activated: true,
            request: telegramRequestToView(activation.request),
          };
        }

        if (activation.code === "TELEGRAM_IN_USE") {
          // Identitas sudah dipakai akun lain; minta pengguna konfirmasi ulang.
          await tx.telegramlinkrequest.update({
            where: { id: request.id },
            data: {
              confirmedAt: null,
              telegramUserId: null,
              telegramChatId: null,
              telegramUsername: null,
              tokenHash: null,
              tokenExpiresAt: null,
              tokenUsedAt: null,
              candidateTelegramUserId: null,
              candidateTelegramChatId: null,
              candidateUsername: null,
              confirmationStartedAt: null,
            },
          });
        } else if (activation.code === "PHONE_CHANGED") {
          return { ok: false as const, code: "PHONE_CHANGED" as const };
        }
      }

      const fresh = await tx.telegramlinkrequest.findUniqueOrThrow({
        where: { id: request.id },
        include: reviewerInclude,
      });

      return {
        ok: true as const,
        activated: false,
        warning:
          request.confirmedAt && request.telegramChatId
            ? ("TELEGRAM_IN_USE" as const)
            : undefined,
        request: telegramRequestToView(fresh),
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, code: "INVALID_STATE" };
    }
    throw error;
  }
}

export async function rejectTelegramRequest(
  requestId: string,
  reviewerId: string,
  reason: string
): Promise<ReviewResult> {
  return prisma.$transaction(async (tx) => {
    const request = await tx.telegramlinkrequest.findUnique({
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
    const updated = await tx.telegramlinkrequest.updateMany({
      where: { id: request.id, status: "PENDING_ADMIN" },
      data: {
        status: "REJECTED",
        reviewedById: reviewerId,
        reviewedAt: now,
        rejectionReason: reason.trim().slice(0, 1000) || null,
        tokenHash: null,
        tokenExpiresAt: null,
        candidateTelegramUserId: null,
        candidateTelegramChatId: null,
        candidateUsername: null,
        confirmationStartedAt: null,
      },
    });

    if (updated.count === 0) {
      return { ok: false as const, code: "INVALID_STATE" as const };
    }

    const fresh = await tx.telegramlinkrequest.findUniqueOrThrow({
      where: { id: request.id },
      include: reviewerInclude,
    });

    return {
      ok: true as const,
      activated: false,
      request: telegramRequestToView(fresh),
    };
  });
}

export type VerificationRequestView = TelegramRequestView & {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    phoneNormalized: string | null;
  };
};

export async function getTelegramVerificationData() {
  const [pendingAdmin, pendingTelegram, active, requests] = await Promise.all([
    prisma.telegramlinkrequest.count({ where: { status: "PENDING_ADMIN" } }),
    prisma.telegramlinkrequest.count({ where: { status: "PENDING_TELEGRAM" } }),
    prisma.telegramlinkrequest.count({ where: { status: "ACTIVE" } }),
    prisma.telegramlinkrequest.findMany({
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
          },
        },
      },
    }),
  ]);

  return {
    counts: {
      pendingAdmin,
      pendingTelegram,
      active,
      total: await prisma.telegramlinkrequest.count(),
    },
    requests: requests.map<VerificationRequestView>((request) => ({
      ...telegramRequestToView(request),
      user: {
        id: request.user.id,
        name: request.user.name,
        email: request.user.email,
        phone: request.user.phone,
        phoneNormalized: request.user.phoneNormalized,
      },
    })),
  };
}

export function buildTelegramDeepLink(token: string): string | null {
  const botUsername = getBotUsername();
  if (!botUsername) return null;
  return `https://t.me/${botUsername}?start=${encodeURIComponent(token)}`;
}

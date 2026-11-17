import crypto from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WHATSAPP_OTP_LENGTH,
  WHATSAPP_OTP_MAX_ATTEMPTS,
  WHATSAPP_OTP_TTL_MS,
  WHATSAPP_REQUEST_STATUS_LABEL,
  WHATSAPP_REQUEST_TYPE_LABEL,
  generateWhatsAppOtp,
  hashWhatsAppOtp,
  whatsAppRequestToView,
} from "@/lib/whatsapp-link";

type RequestViewInput = Parameters<typeof whatsAppRequestToView>[0];

function buildRequest(
  overrides: Partial<RequestViewInput> = {}
): RequestViewInput {
  return {
    id: "req-1",
    userId: "user-1",
    status: "ACTIVE",
    requestType: "INITIAL",
    phone: "081234567890",
    phoneNormalized: "6281234567890",
    previousPhoneNormalized: null,
    reviewedAt: null,
    rejectionReason: null,
    reviewedById: null,
    reviewedBy: null,
    otpExpiresAt: null,
    otpSentAt: null,
    otpSendError: null,
    otpAttempts: 0,
    otpUsedAt: null,
    createdAt: new Date("2026-01-05T10:00:00.000Z"),
    updatedAt: new Date("2026-01-05T10:05:00.000Z"),
    ...overrides,
  } as unknown as RequestViewInput;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * Modul membaca secret sekali saat diimpor, jadi nilai inilah yang dipakai
 * oleh hashWhatsAppOtp selama proses test berlangsung.
 */
function activeOtpSecret(): string {
  return (
    process.env.WHATSAPP_OTP_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "pelaporan-fasilitas-otp-dev-secret"
  );
}

describe("OTP constants", () => {
  it("keeps the documented TTL, attempt limit and length", () => {
    expect(WHATSAPP_OTP_TTL_MS).toBe(10 * 60 * 1000);
    expect(WHATSAPP_OTP_MAX_ATTEMPTS).toBe(5);
    expect(WHATSAPP_OTP_LENGTH).toBe(6);
  });

  it("exposes Indonesian status and type labels", () => {
    expect(WHATSAPP_REQUEST_STATUS_LABEL.PENDING_ADMIN).toBe(
      "Menunggu Persetujuan Admin"
    );
    expect(WHATSAPP_REQUEST_STATUS_LABEL.PENDING_VERIFICATION).toBe(
      "Menunggu Verifikasi OTP"
    );
    expect(WHATSAPP_REQUEST_STATUS_LABEL.ACTIVE).toBe("Aktif");
    expect(WHATSAPP_REQUEST_STATUS_LABEL.REJECTED).toBe("Ditolak");
    expect(WHATSAPP_REQUEST_STATUS_LABEL.REVOKED).toBe("Dicabut");
    expect(WHATSAPP_REQUEST_STATUS_LABEL.EXPIRED).toBe("Kedaluwarsa");

    expect(WHATSAPP_REQUEST_TYPE_LABEL.INITIAL).toBe("Penautan Awal");
    expect(WHATSAPP_REQUEST_TYPE_LABEL.PHONE_CHANGE).toBe("Perubahan Nomor");
    expect(WHATSAPP_REQUEST_TYPE_LABEL.RELINK).toBe("Penautan Ulang");
  });
});

describe("generateWhatsAppOtp", () => {
  it("produces exactly six digits and never a leading zero", () => {
    for (let i = 0; i < 200; i += 1) {
      const otp = generateWhatsAppOtp();
      expect(otp).toMatch(/^\d{6}$/);
      expect(otp.startsWith("0")).toBe(false);
    }
  });

  it("returns a string, not a number", () => {
    expect(typeof generateWhatsAppOtp()).toBe("string");
  });
});

describe("hashWhatsAppOtp", () => {
  it("produces a deterministic SHA-256 hex digest", () => {
    const first = hashWhatsAppOtp("req-1", "123456");
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(hashWhatsAppOtp("req-1", "123456")).toBe(first);
  });

  it("binds the hash to both the request id and the OTP", () => {
    const base = hashWhatsAppOtp("req-1", "123456");
    expect(hashWhatsAppOtp("req-2", "123456")).not.toBe(base);
    expect(hashWhatsAppOtp("req-1", "654321")).not.toBe(base);
  });

  it("does not contain the OTP in plain text", () => {
    expect(hashWhatsAppOtp("req-1", "123456")).not.toContain("123456");
  });

  it("matches the documented HMAC-SHA256 recipe", () => {
    const expected = crypto
      .createHmac("sha256", activeOtpSecret())
      .update("req-1:123456")
      .digest("hex");
    expect(hashWhatsAppOtp("req-1", "123456")).toBe(expected);
  });

  it("captures the secret at module load, so later env changes do not affect it", () => {
    const before = hashWhatsAppOtp("req-1", "123456");
    vi.stubEnv("WHATSAPP_OTP_SECRET", "different-secret");
    expect(hashWhatsAppOtp("req-1", "123456")).toBe(before);
  });
});

describe("whatsAppRequestToView", () => {
  it("maps an active request to the view model", () => {
    const view = whatsAppRequestToView(buildRequest());

    expect(view.id).toBe("req-1");
    expect(view.status).toBe("ACTIVE");
    expect(view.statusLabel).toBe("Aktif");
    expect(view.requestTypeLabel).toBe("Penautan Awal");
    expect(view.phoneDisplay).toBe("081234567890");
    expect(view.phoneNormalized).toBe("6281234567890");
    expect(view.previousPhoneDisplay).toBeNull();
    expect(view.createdAt).toBe("2026-01-05T10:00:00.000Z");
    expect(view.updatedAt).toBe("2026-01-05T10:05:00.000Z");
    expect(view.otpMaxAttempts).toBe(WHATSAPP_OTP_MAX_ATTEMPTS);
    expect(view.active).toBe(true);
  });

  it("keeps pending requests inactive and formats the previous phone", () => {
    const view = whatsAppRequestToView(
      buildRequest({
        status: "PENDING_VERIFICATION",
        requestType: "PHONE_CHANGE",
        previousPhoneNormalized: "628111222333",
        otpAttempts: 2,
        otpExpiresAt: new Date("2026-01-05T10:10:00.000Z"),
        otpSentAt: new Date("2026-01-05T10:00:00.000Z"),
        otpSendError: "gagal kirim",
      })
    );

    expect(view.statusLabel).toBe("Menunggu Verifikasi OTP");
    expect(view.requestTypeLabel).toBe("Perubahan Nomor");
    expect(view.active).toBe(false);
    expect(view.previousPhoneDisplay).toBe("08111222333");
    expect(view.otpAttempts).toBe(2);
    expect(view.otpExpiresAt).toBe("2026-01-05T10:10:00.000Z");
    expect(view.otpSentAt).toBe("2026-01-05T10:00:00.000Z");
    expect(view.otpSendError).toBe("gagal kirim");
  });

  it("exposes reviewer details when present", () => {
    const view = whatsAppRequestToView(
      buildRequest({
        status: "REJECTED",
        rejectionReason: "Nomor tidak valid",
        reviewedAt: new Date("2026-01-06T08:00:00.000Z"),
        reviewedBy: {
          id: "admin-1",
          name: "Admin Satu",
          email: "admin@example.test",
        },
      })
    );

    expect(view.reviewedAt).toBe("2026-01-06T08:00:00.000Z");
    expect(view.rejectionReason).toBe("Nomor tidak valid");
    expect(view.reviewerName).toBe("Admin Satu");
    expect(view.reviewerEmail).toBe("admin@example.test");
  });

  it("maps otpUsedAt to otpVerifiedAt", () => {
    const view = whatsAppRequestToView(
      buildRequest({ otpUsedAt: new Date("2026-01-05T10:03:00.000Z") })
    );
    expect(view.otpVerifiedAt).toBe("2026-01-05T10:03:00.000Z");
  });

  it("falls back to the raw value for unknown request types", () => {
    const view = whatsAppRequestToView(
      buildRequest({ requestType: "CUSTOM" })
    );
    expect(view.requestTypeLabel).toBe("CUSTOM");
  });
});

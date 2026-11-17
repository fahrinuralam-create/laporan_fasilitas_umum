import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getFonnteConfig,
  isFonnteConfigured,
  maskWhatsAppNumber,
  normalizeFonnteTarget,
  sanitizeFonnteError,
  sendWhatsAppMessage,
} from "@/lib/fonnte";

const DEFAULT_URL = "https://api.fonnte.com/send";

function stubFonnteEnv(values: Record<string, string> = {}) {
  vi.stubEnv("FONNTE_API_URL", values.apiUrl ?? "");
  vi.stubEnv("FONNTE_API_TOKEN", values.token ?? "");
  vi.stubEnv("FONNTE_COUNTRY_CODE", values.countryCode ?? "");
  vi.stubEnv("FONNTE_TIMEOUT_MS", values.timeoutMs ?? "");
}

beforeEach(() => {
  stubFonnteEnv();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getFonnteConfig", () => {
  it("falls back to sane defaults when nothing is configured", () => {
    expect(getFonnteConfig()).toEqual({
      apiUrl: DEFAULT_URL,
      countryCode: "62",
      configured: false,
      timeoutMs: 10_000,
    });
  });

  it("reports configured only when a non-blank token exists", () => {
    stubFonnteEnv({ token: "   " });
    expect(getFonnteConfig().configured).toBe(false);
    expect(isFonnteConfigured()).toBe(false);

    stubFonnteEnv({ token: " abc-token " });
    expect(getFonnteConfig().configured).toBe(true);
    expect(isFonnteConfigured()).toBe(true);
  });

  it("clamps the timeout into the 1000-30000 ms window", () => {
    stubFonnteEnv({ timeoutMs: "5000" });
    expect(getFonnteConfig().timeoutMs).toBe(5000);

    stubFonnteEnv({ timeoutMs: "500" });
    expect(getFonnteConfig().timeoutMs).toBe(10_000);

    stubFonnteEnv({ timeoutMs: "99999" });
    expect(getFonnteConfig().timeoutMs).toBe(30_000);

    stubFonnteEnv({ timeoutMs: "bukan-angka" });
    expect(getFonnteConfig().timeoutMs).toBe(10_000);
  });

  it("strips non-digits from the country code", () => {
    stubFonnteEnv({ countryCode: "+62" });
    expect(getFonnteConfig().countryCode).toBe("62");

    stubFonnteEnv({ countryCode: "62-ID" });
    expect(getFonnteConfig().countryCode).toBe("62");
  });

  it("uses the API URL as provided, trimmed", () => {
    stubFonnteEnv({ apiUrl: "  https://example.test/send  " });
    expect(getFonnteConfig().apiUrl).toBe("https://example.test/send");
  });
});

describe("normalizeFonnteTarget", () => {
  it("validates Indonesian numbers with the shared normalizer", () => {
    expect(normalizeFonnteTarget("081234567890")).toBe("6281234567890");
    expect(normalizeFonnteTarget("+6281234567890")).toBe("6281234567890");
    expect(normalizeFonnteTarget("0812345")).toBeNull();
    expect(normalizeFonnteTarget("abc")).toBeNull();
  });

  it("applies its own rules for non-Indonesian country codes", () => {
    stubFonnteEnv({ countryCode: "60" });

    expect(normalizeFonnteTarget("0123456789")).toBe("60123456789");
    expect(normalizeFonnteTarget("+60123456789")).toBe("60123456789");
    expect(normalizeFonnteTarget("12345678")).toBe("6012345678");
    expect(normalizeFonnteTarget("123")).toBeNull();
    expect(normalizeFonnteTarget("1234567890123456")).toBeNull();
  });

  it("rejects non-string values", () => {
    expect(normalizeFonnteTarget(null)).toBeNull();
    expect(normalizeFonnteTarget(6281234567890)).toBeNull();
  });
});

describe("maskWhatsAppNumber", () => {
  it("keeps a short prefix and suffix only", () => {
    expect(maskWhatsAppNumber("6281234567890")).toBe("6281******890");
    expect(maskWhatsAppNumber("1234567")).toBe("1234**567");
  });

  it("leaves very short numbers visible", () => {
    expect(maskWhatsAppNumber("123456")).toBe("123456");
  });

  it("returns a dash for empty values", () => {
    expect(maskWhatsAppNumber(null)).toBe("-");
    expect(maskWhatsAppNumber(undefined)).toBe("-");
    expect(maskWhatsAppNumber("")).toBe("-");
  });
});

describe("sanitizeFonnteError", () => {
  it("redacts the configured API token", () => {
    stubFonnteEnv({ token: "secret-token" });
    expect(sanitizeFonnteError("auth failed for secret-token")).toBe(
      "auth failed for [REDACTED]"
    );
  });

  it("redacts six digit sequences (OTP codes) but not longer numbers", () => {
    expect(sanitizeFonnteError("otp 123456 invalid")).toBe(
      "otp [REDACTED] invalid"
    );
    expect(sanitizeFonnteError("code 1234567")).toBe("code 1234567");
  });

  it("collapses whitespace and trims", () => {
    expect(sanitizeFonnteError("  gagal\n\n  kirim  ")).toBe("gagal kirim");
  });

  it("falls back to the default message for unusable input", () => {
    expect(sanitizeFonnteError("")).toBe("Gagal menghubungi Fonnte");
    expect(sanitizeFonnteError("   ")).toBe("Gagal menghubungi Fonnte");
    expect(sanitizeFonnteError(42)).toBe("Gagal menghubungi Fonnte");
    expect(sanitizeFonnteError(null)).toBe("Gagal menghubungi Fonnte");
  });

  it("reads the message from Error instances", () => {
    expect(sanitizeFonnteError(new Error("socket hang up"))).toBe(
      "socket hang up"
    );
  });

  it("truncates to the requested length", () => {
    expect(sanitizeFonnteError("x".repeat(500), 10)).toBe("x".repeat(10));
  });
});

describe("sendWhatsAppMessage (no network)", () => {
  it("reports a configuration error when no token is set", async () => {
    await expect(sendWhatsAppMessage("081234567890", "halo")).resolves.toEqual({
      ok: false,
      status: 503,
      messageId: null,
      error: "FONNTE_API_TOKEN belum dikonfigurasi oleh admin.",
    });
  });

  it("rejects an invalid target before calling the provider", async () => {
    stubFonnteEnv({ token: "abc-token" });
    await expect(sendWhatsAppMessage("abc", "halo")).resolves.toEqual({
      ok: false,
      status: 400,
      messageId: null,
      error: "Nomor WhatsApp tidak valid.",
    });
  });
});

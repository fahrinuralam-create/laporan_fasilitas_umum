import { normalizePhoneNumber } from "@/lib/phone";

export type FonnteSendResult = {
  ok: boolean;
  status?: number;
  messageId: string | null;
  error?: string;
};

export type FonnteConfig = {
  apiUrl: string;
  countryCode: string;
  configured: boolean;
  timeoutMs: number;
};

const DEFAULT_API_URL = "https://api.fonnte.com/send";
const DEFAULT_COUNTRY_CODE = "62";
const DEFAULT_TIMEOUT_MS = 10_000;

export function getFonnteConfig(): FonnteConfig {
  const timeout = Number(process.env.FONNTE_TIMEOUT_MS);
  return {
    apiUrl: (process.env.FONNTE_API_URL || DEFAULT_API_URL).trim(),
    countryCode:
      (process.env.FONNTE_COUNTRY_CODE || DEFAULT_COUNTRY_CODE)
        .replace(/\D/g, "")
        .slice(0, 4) || DEFAULT_COUNTRY_CODE,
    configured: Boolean((process.env.FONNTE_API_TOKEN || "").trim()),
    timeoutMs:
      Number.isFinite(timeout) && timeout >= 1000
        ? Math.min(timeout, 30_000)
        : DEFAULT_TIMEOUT_MS,
  };
}

export function isFonnteConfigured(): boolean {
  return getFonnteConfig().configured;
}

/**
 * Normalisasi nomor tujuan ke format internasional tanpa tanda "+".
 * Nomor Indonesia (62) tetap divalidasi dengan aturan yang sama seperti
 * pendaftaran pengguna agar tidak ada pengiriman ke nomor asal-asalan.
 */
export function normalizeFonnteTarget(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const { countryCode } = getFonnteConfig();

  // Validasi nomor Indonesia memakai normalizer aplikasi yang sudah ada.
  if (countryCode === "62") {
    return normalizePhoneNumber(value);
  }

  let digits = value.trim().replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("0")) digits = `${countryCode}${digits.slice(1)}`;
  if (!digits.startsWith(countryCode)) digits = `${countryCode}${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/** Menyamarkan nomor untuk log agar tidak membocorkan data pribadi penuh. */
export function maskWhatsAppNumber(value: string | null | undefined): string {
  if (!value) return "-";
  if (value.length <= 6) return value;
  return `${value.slice(0, 4)}${"*".repeat(Math.max(2, value.length - 7))}${value.slice(-3)}`;
}

/** Menghapus token dan deretan angka sensitif (mis. OTP) dari pesan error. */
export function sanitizeFonnteError(
  value: unknown,
  maxLength = 300
): string {
  let text =
    typeof value === "string"
      ? value
      : value instanceof Error
        ? value.message
        : "Gagal menghubungi Fonnte";

  const token = (process.env.FONNTE_API_TOKEN || "").trim();
  if (token) text = text.split(token).join("[REDACTED]");
  text = text.replace(/\b\d{6}\b/g, "[REDACTED]");

  const cleaned = text.replace(/\s+/g, " ").trim() || "Gagal menghubungi Fonnte";
  return cleaned.slice(0, maxLength);
}

/**
 * Adapter tunggal untuk seluruh pengiriman WhatsApp melalui Fonnte.
 * Token hanya dibaca di server dan tidak pernah dikembalikan ke pemanggil.
 */
export async function sendWhatsAppMessage(
  target: string,
  message: string,
  options?: { timeoutMs?: number }
): Promise<FonnteSendResult> {
  const config = getFonnteConfig();
  const token = (process.env.FONNTE_API_TOKEN || "").trim();

  if (!config.configured || !token) {
    return {
      ok: false,
      status: 503,
      messageId: null,
      error: "FONNTE_API_TOKEN belum dikonfigurasi oleh admin.",
    };
  }

  const normalizedTarget = normalizeFonnteTarget(target);
  if (!normalizedTarget) {
    return {
      ok: false,
      status: 400,
      messageId: null,
      error: "Nomor WhatsApp tidak valid.",
    };
  }

  const body = new URLSearchParams({
    target: normalizedTarget,
    message: message.slice(0, 4000),
    countryCode: config.countryCode,
  }).toString();

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? config.timeoutMs;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: controller.signal,
      cache: "no-store",
    });

    let raw = "";
    try {
      raw = await response.text();
    } catch {
      raw = "";
    }

    let parsed: {
      status?: boolean | string | number;
      reason?: string;
      id?: unknown;
    } | null = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }

    const accepted =
      parsed?.status === true ||
      parsed?.status === "true" ||
      parsed?.status === 200;

    if (!response.ok || !parsed || !accepted) {
      return {
        ok: false,
        status: response.status,
        messageId: null,
        error: sanitizeFonnteError(
          parsed?.reason ||
            (response.ok
              ? "Respons Fonnte tidak dikenali."
              : `HTTP ${response.status}`)
        ),
      };
    }

    const ids = Array.isArray(parsed.id) ? parsed.id : [];
    const firstId =
      ids.length > 0 && (typeof ids[0] === "string" || typeof ids[0] === "number")
        ? String(ids[0])
        : null;

    return {
      ok: true,
      status: response.status,
      messageId: firstId,
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      messageId: null,
      error: aborted
        ? "Koneksi ke Fonnte timeout."
        : sanitizeFonnteError(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

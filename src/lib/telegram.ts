const TELEGRAM_API = "https://api.telegram.org";

export type TelegramApiResult<T = unknown> = {
  ok: boolean;
  result?: T;
  error?: string;
  status?: number;
};

export type TelegramBotInfo = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
};

export type TelegramWebhookInfo = {
  url?: string;
  has_custom_certificate?: boolean;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
};

export function getBotToken(): string {
  return (process.env.TELEGRAM_BOT_TOKEN || "").trim();
}

export function getBotUsername(): string {
  return (process.env.TELEGRAM_BOT_USERNAME || "").trim().replace(/^@/, "");
}

export function isTelegramConfigured(): boolean {
  return getBotToken().length > 0;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function callTelegram<T = unknown>(
  method: string,
  payload: Record<string, unknown> = {},
  timeoutMs = 10000
): Promise<TelegramApiResult<T>> {
  const token = getBotToken();
  if (!token) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN belum diatur" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        status: res.status,
        error: data?.description || `HTTP ${res.status}`,
      };
    }

    return { ok: true, status: res.status, result: data.result as T };
  } catch (error) {
    const err = error as Error;
    return {
      ok: false,
      error:
        err.name === "AbortError"
          ? "Koneksi ke Telegram timeout"
          : err.message || "Gagal menghubungi Telegram",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendTelegramMessage(
  chatId: string,
  text: string
): Promise<TelegramApiResult<{ message_id: number }>> {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4000),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

export async function getTelegramMe(): Promise<
  TelegramApiResult<TelegramBotInfo>
> {
  return callTelegram("getMe");
}

export async function getTelegramWebhookInfo(): Promise<
  TelegramApiResult<TelegramWebhookInfo>
> {
  return callTelegram("getWebhookInfo");
}

export async function setTelegramWebhook(
  url: string,
  secret?: string
): Promise<TelegramApiResult<boolean>> {
  return callTelegram("setWebhook", {
    url,
    ...(secret ? { secret_token: secret } : {}),
    allowed_updates: ["message", "callback_query"],
  });
}

export async function deleteTelegramWebhook(): Promise<
  TelegramApiResult<boolean>
> {
  return callTelegram("deleteWebhook", { drop_pending_updates: false });
}

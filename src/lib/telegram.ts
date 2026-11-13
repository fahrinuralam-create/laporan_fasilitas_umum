import https from "https";


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

  const body = JSON.stringify(payload ?? {});

  return new Promise((resolve) => {
    let timedOut = false;

    type TelegramRequestOptions = https.RequestOptions & {
      autoSelectFamily?: boolean;
      autoSelectFamilyAttemptTimeout?: number;
    };

    const options: TelegramRequestOptions = {
      hostname: "api.telegram.org",
      path: `/bot${token}/${method}`,
      method: "POST",
      // Di sebagian jaringan IPv4 diblokir; autoSelectFamily memilih
      // IPv4/IPv6 yang bisa terhubung (Happy Eyeballs).
      autoSelectFamily: true,
      autoSelectFamilyAttemptTimeout: 1500,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: timeoutMs,
    };

    const req = https.request(
      options,
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          let parsed: {
            ok?: boolean;
            result?: T;
            description?: string;
          } | null = null;

          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = null;
          }

          if (!parsed?.ok) {
            resolve({
              ok: false,
              status: res.statusCode,
              error:
                parsed?.description || `HTTP ${res.statusCode ?? "tidak dikenal"}`,
            });
            return;
          }

          resolve({
            ok: true,
            status: res.statusCode,
            result: parsed.result as T,
          });
        });
      }
    );

    req.on("timeout", () => {
      timedOut = true;
      req.destroy();
    });

    req.on("error", (error) => {
      resolve({
        ok: false,
        error: timedOut
          ? "Koneksi ke Telegram timeout"
          : error.message || "Gagal menghubungi Telegram",
      });
    });

    req.write(body);
    req.end();
  });
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options?: { replyMarkup?: unknown }
): Promise<TelegramApiResult<{ message_id: number }>> {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4000),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(options?.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
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

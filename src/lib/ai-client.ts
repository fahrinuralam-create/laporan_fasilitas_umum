import http from "http";
import https from "https";
import { getResolvedAiConfig } from "@/lib/ai-config";

export type ChatContent = string | Array<Record<string, unknown>>;
export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: ChatContent;
};

export class AiNotConfiguredError extends Error {
  constructor(message = "Konfigurasi AI belum lengkap (API key kosong)") {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}

type ChatOptions = {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

type AiRequestOptions = http.RequestOptions & {
  autoSelectFamily?: boolean;
  autoSelectFamilyAttemptTimeout?: number;
};

type ProviderResponse = {
  status?: number;
  body: string;
};

function requestProvider(
  url: URL,
  apiKey: string,
  body: string,
  timeoutMs: number
): Promise<ProviderResponse> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "http:" ? http : https;
    let timedOut = false;

    const options: AiRequestOptions = {
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: "POST",
      // Di sebagian jaringan IPv4 diblokir; autoSelectFamily memilih
      // IPv4/IPv6 yang bisa terhubung (Happy Eyeballs).
      autoSelectFamily: true,
      autoSelectFamilyAttemptTimeout: 1500,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        // Hindari respons terkompresi agar tidak perlu dekompresi manual.
        "Accept-Encoding": "identity",
      },
      timeout: timeoutMs,
    };

    const req = transport.request(options, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        raw += chunk;
      });
      res.on("end", () => {
        resolve({ status: res.statusCode, body: raw });
      });
    });

    req.on("timeout", () => {
      timedOut = true;
      req.destroy();
    });

    req.on("error", (error) => {
      reject(
        new Error(
          timedOut ? "Waktu tunggu AI habis (timeout)" : error.message
        )
      );
    });

    req.write(body);
    req.end();
  });
}

async function callChat(
  target: "text" | "vision",
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const config = (await getResolvedAiConfig())[target];

  if (!config.apiKey) {
    throw new AiNotConfiguredError(
      `API key model ${target} belum dikonfigurasi. Atur di Admin > Konfigurasi AI.`
    );
  }

  let url: URL;
  try {
    url = new URL(`${config.baseUrl}/chat/completions`);
  } catch {
    throw new Error("Base URL provider AI tidak valid");
  }

  const payload = JSON.stringify({
    model: config.model,
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 800,
    stream: false,
  });

  const response = await requestProvider(
    url,
    config.apiKey,
    payload,
    options.timeoutMs ?? 30000
  );

  if (
    typeof response.status === "number" &&
    (response.status < 200 || response.status >= 300)
  ) {
    throw new Error(
      `Provider AI menolak permintaan (HTTP ${response.status}): ${response.body.slice(
        0,
        300
      )}`
    );
  }

  let data: {
    choices?: Array<{ message?: { content?: unknown } }>;
  } | null = null;

  try {
    data = JSON.parse(response.body);
  } catch {
    data = null;
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Respons AI tidak berisi teks yang valid");
  }

  return content;
}

export async function aiChatText(
  systemPrompt: string,
  userPrompt: string,
  options?: ChatOptions
): Promise<string> {
  return callChat(
    "text",
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    options
  );
}

/**
 * Percakapan multi-turn (system + riwayat + pesan terbaru) memakai model teks.
 */
export async function aiChatMessages(
  messages: ChatMessage[],
  options?: ChatOptions
): Promise<string> {
  return callChat("text", messages, options);
}

export async function aiChatWithImage(
  systemPrompt: string,
  userPrompt: string,
  imageDataUrl: string,
  options?: ChatOptions
): Promise<string> {
  return callChat(
    "vision",
    [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
    options
  );
}

/**
 * Mengambil objek JSON dari respons AI yang mungkin dibungkus code fence
 * atau teks tambahan.
 */
export function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // lanjut ke pencarian objek JSON di dalam teks
  }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  return null;
}

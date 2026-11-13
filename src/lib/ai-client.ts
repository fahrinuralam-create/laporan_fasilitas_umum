import http from "http";
import https from "https";
import { getResolvedAiConfig } from "@/lib/ai-config";

export type ChatContent = string | Array<Record<string, unknown>>;

export type ChatToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type ChatTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: ChatContent;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type ChatResult = {
  content: string;
  toolCalls: ChatToolCall[];
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

function normalizeToolCalls(value: unknown): ChatToolCall[] {
  if (!Array.isArray(value)) return [];

  const calls: ChatToolCall[] = [];
  value.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const raw = item as {
      id?: unknown;
      type?: unknown;
      function?: { name?: unknown; arguments?: unknown };
    };
    const name = raw.function?.name;
    if (typeof name !== "string" || !name.trim()) return;

    const args = raw.function?.arguments;
    calls.push({
      id:
        typeof raw.id === "string" && raw.id
          ? raw.id
          : `tool_call_${index}_${Date.now()}`,
      type: "function",
      function: {
        name: name.trim(),
        arguments:
          typeof args === "string" ? args : JSON.stringify(args ?? {}),
      },
    });
  });

  return calls;
}

async function callChatRaw(
  target: "text" | "vision",
  messages: ChatMessage[],
  options: ChatOptions = {},
  tools?: ChatTool[]
): Promise<ChatResult> {
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
    ...(tools && tools.length > 0
      ? { tools, tool_choice: "auto" }
      : {}),
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
    choices?: Array<{
      message?: {
        content?: unknown;
        tool_calls?: unknown;
      };
    }>;
  } | null = null;

  try {
    data = JSON.parse(response.body);
  } catch {
    data = null;
  }

  const message = data?.choices?.[0]?.message;
  const content =
    typeof message?.content === "string" ? message.content : "";
  const toolCalls = normalizeToolCalls(message?.tool_calls);

  if (!content.trim() && toolCalls.length === 0) {
    throw new Error("Respons AI tidak berisi teks yang valid");
  }

  return { content, toolCalls };
}

async function callChat(
  target: "text" | "vision",
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const result = await callChatRaw(target, messages, options);
  if (!result.content.trim()) {
    throw new Error("Respons AI tidak berisi teks yang valid");
  }
  return result.content;
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

/**
 * Percakapan multi-turn dengan dukungan function/tool calling. Model dapat
 * meminta data tambahan dari database sebelum menyusun jawaban akhir.
 */
export async function aiChatMessagesWithTools(
  messages: ChatMessage[],
  tools: ChatTool[],
  options?: ChatOptions
): Promise<ChatResult> {
  return callChatRaw("text", messages, options, tools);
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

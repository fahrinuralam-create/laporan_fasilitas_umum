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

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 30000
  );

  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 800,
        stream: false,
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Provider AI menolak permintaan (HTTP ${res.status}): ${detail.slice(
          0,
          300
        )}`
      );
    }

    const data = await res.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("Respons AI tidak berisi teks yang valid");
    }
    return content;
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error("Waktu tunggu AI habis (timeout)");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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

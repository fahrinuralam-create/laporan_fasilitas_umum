import { describe, expect, it } from "vitest";
import { extractJson, summarizeProviderError } from "@/lib/ai-client";

describe("extractJson", () => {
  it("parses a bare JSON object", () => {
    expect(extractJson('{"status":"ok"}')).toEqual({ status: "ok" });
  });

  it("parses JSON wrapped in a ```json code fence", () => {
    expect(extractJson('```json\n{"status":"ok"}\n```')).toEqual({
      status: "ok",
    });
  });

  it("parses JSON wrapped in a plain code fence", () => {
    expect(extractJson('```\n{"status":"ok"}\n```')).toEqual({ status: "ok" });
  });

  it("accepts an uppercase language tag", () => {
    expect(extractJson('```JSON\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("finds a JSON object embedded in surrounding prose", () => {
    expect(
      extractJson('Berikut hasil analisisnya: {"prioritas":"TINGGI"} semoga membantu')
    ).toEqual({ prioritas: "TINGGI" });
  });

  it("preserves nested structures", () => {
    const payload = { a: { b: [1, 2, { c: true }] } };
    expect(extractJson(JSON.stringify(payload))).toEqual(payload);
  });

  it("handles braces that appear inside string values", () => {
    expect(extractJson('{"a":"}"}')).toEqual({ a: "}" });
  });

  it("returns null for JSON arrays", () => {
    expect(extractJson("[1,2,3]")).toBeNull();
  });

  it("returns null for JSON primitives", () => {
    expect(extractJson("123")).toBeNull();
    expect(extractJson('"teks"')).toBeNull();
    expect(extractJson("null")).toBeNull();
  });

  it("returns null for empty or blank input", () => {
    expect(extractJson("")).toBeNull();
    expect(extractJson("   ")).toBeNull();
  });

  it("returns null when no JSON object is present", () => {
    expect(extractJson("tidak ada data")).toBeNull();
    expect(extractJson("{rusak}")).toBeNull();
  });

  it("returns null when multiple objects cannot be parsed as one", () => {
    expect(extractJson('{"a":1} {"b":2}')).toBeNull();
  });
});

describe("summarizeProviderError", () => {
  it("maps 402 to a credit/quota message", () => {
    const message = summarizeProviderError(402, '{"error":"payment required"}');

    expect(message).toContain("Kredit/kuota");
  });

  it("maps 401 and 403 to an API key message", () => {
    expect(summarizeProviderError(401, "invalid api key")).toContain("API key");
    expect(summarizeProviderError(403, "forbidden")).toContain("API key");
    expect(summarizeProviderError(403, "quota policy denied")).toContain(
      "API key"
    );
  });

  it("maps a plain 429 to a rate limit message", () => {
    const message = summarizeProviderError(
      429,
      JSON.stringify({
        error: {
          message: "Rate limit reached for gpt-4o. Please try again in 20ms.",
        },
      })
    );

    expect(message).toContain("rate limit");
    expect(message).not.toContain("Kredit");
  });

  it("keeps an explicit billing 429 as a credit message", () => {
    const message = summarizeProviderError(
      429,
      JSON.stringify({
        error: {
          message:
            "You exceeded your current quota, please check your plan and billing details.",
        },
      })
    );

    expect(message).toContain("Kredit/kuota");
  });

  it("does not treat a 400 parameter error mentioning quota as exhausted credit", () => {
    const message = summarizeProviderError(
      400,
      JSON.stringify({
        error: { message: "max_tokens quota invalid for this model" },
      })
    );

    expect(message).not.toContain("Kredit");
    expect(message).toContain("HTTP 400");
    expect(message).toContain("max_tokens quota invalid");
  });

  it("mentions model or base URL for 404", () => {
    const message = summarizeProviderError(404, "");

    expect(message).toContain("Model AI");
    expect(message).toContain("base URL");
    expect(message).toContain("endpoint");
  });

  it("falls back informatively for 500", () => {
    const message = summarizeProviderError(500, '{"error":"internal"}');

    expect(message).toContain("HTTP 500");
    expect(message).toContain('{"error":"internal"}');
  });

  it("handles empty and non-JSON bodies without crashing", () => {
    expect(summarizeProviderError(500, "")).toContain("HTTP 500");
    expect(summarizeProviderError(502, "<html>Bad Gateway</html>")).toContain(
      "Bad Gateway"
    );
  });

  it("treats a 429 billing endpoint outage as a rate limit, not exhausted credit", () => {
    const message = summarizeProviderError(429, "billing endpoint unavailable");

    expect(message).toContain("rate limit");
    expect(message).not.toContain("Kredit");
  });

  it("treats a 429 billing hard limit as exhausted credit", () => {
    const message = summarizeProviderError(429, "billing hard limit reached");

    expect(message).toContain("Kredit/kuota");
  });

  it("treats a 429 billing quota exceeded as exhausted credit", () => {
    const message = summarizeProviderError(429, "billing quota exceeded");

    expect(message).toContain("Kredit/kuota");
  });

  it("keeps 402 as credit even when the body talks about rate limits", () => {
    const message = summarizeProviderError(402, "rate limit exceeded");

    expect(message).toContain("Kredit/kuota");
    expect(message).not.toContain("rate limit");
  });

  it("treats a 429 per-minute quota as a rate limit, not exhausted credit", () => {
    const message = summarizeProviderError(
      429,
      "requests per minute quota exceeded"
    );

    expect(message).toContain("rate limit");
    expect(message).not.toContain("Kredit");
  });

  it("treats an empty 429 body as a rate limit", () => {
    const message = summarizeProviderError(429, "");

    expect(message).toContain("rate limit");
    expect(message).not.toContain("Kredit");
  });
});

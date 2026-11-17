import { describe, expect, it } from "vitest";
import { extractJson } from "@/lib/ai-client";

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

import { describe, expect, it } from "vitest";
import { formatPhoneNumber, normalizePhoneNumber } from "@/lib/phone";

describe("normalizePhoneNumber", () => {
  it("converts local 08 numbers to the canonical 62 form", () => {
    expect(normalizePhoneNumber("081234567890")).toBe("6281234567890");
  });

  it("accepts numbers without the leading zero", () => {
    expect(normalizePhoneNumber("81234567890")).toBe("6281234567890");
  });

  it("accepts already-canonical 62 numbers unchanged", () => {
    expect(normalizePhoneNumber("6281234567890")).toBe("6281234567890");
  });

  it("strips a leading plus sign", () => {
    expect(normalizePhoneNumber("+6281234567890")).toBe("6281234567890");
  });

  it("ignores separators and surrounding whitespace", () => {
    expect(normalizePhoneNumber(" 0812-3456-7890 ")).toBe("6281234567890");
    expect(normalizePhoneNumber("0812 3456 7890")).toBe("6281234567890");
    expect(normalizePhoneNumber("(0812) 3456.7890")).toBe("6281234567890");
  });

  it("accepts the shortest and longest valid national numbers", () => {
    // Nomor nasional 8 digit ("81234567") adalah batas bawah yang sah.
    expect(normalizePhoneNumber("081234567")).toBe("6281234567");
    // Nomor nasional 13 digit ("8123456789012") adalah batas atas yang sah.
    expect(normalizePhoneNumber("08123456789012")).toBe("628123456789012");
  });

  it("rejects numbers that are too short or too long", () => {
    expect(normalizePhoneNumber("08123456")).toBeNull();
    expect(normalizePhoneNumber("081234567890123")).toBeNull();
  });

  it("rejects landlines and other non-mobile prefixes", () => {
    expect(normalizePhoneNumber("0212345678")).toBeNull();
  });

  it("rejects non-numeric and empty input", () => {
    expect(normalizePhoneNumber("abc")).toBeNull();
    expect(normalizePhoneNumber("")).toBeNull();
    expect(normalizePhoneNumber("   ")).toBeNull();
  });

  it("rejects non-string values", () => {
    expect(normalizePhoneNumber(null)).toBeNull();
    expect(normalizePhoneNumber(undefined)).toBeNull();
    expect(normalizePhoneNumber(6281234567890)).toBeNull();
    expect(normalizePhoneNumber({})).toBeNull();
  });

  it("is idempotent for valid numbers", () => {
    const once = normalizePhoneNumber("0812-3456-7890");
    expect(once).not.toBeNull();
    expect(normalizePhoneNumber(once)).toBe(once);
  });
});

describe("formatPhoneNumber", () => {
  it("renders canonical numbers in local 08 form", () => {
    expect(formatPhoneNumber("6281234567890")).toBe("081234567890");
  });

  it("passes through numbers that are not in canonical form", () => {
    expect(formatPhoneNumber("081234567890")).toBe("081234567890");
  });

  it("returns a dash for empty values", () => {
    expect(formatPhoneNumber(null)).toBe("-");
    expect(formatPhoneNumber(undefined)).toBe("-");
    expect(formatPhoneNumber("")).toBe("-");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  hashSecret,
  maskSecret,
} from "@/lib/ai-config-crypto";

const KEY = "unit-test-encryption-key";

beforeEach(() => {
  vi.stubEnv("AI_CONFIG_ENCRYPTION_KEY", KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a secret unchanged", () => {
    const plain = "sk-live-abc123";
    expect(decryptSecret(encryptSecret(plain))).toBe(plain);
  });

  it("round-trips unicode and long secrets", () => {
    const plain = "kunci-rahasia-✓-" + "x".repeat(500);
    expect(decryptSecret(encryptSecret(plain))).toBe(plain);
  });

  it("returns an empty string when encrypting an empty value", () => {
    expect(encryptSecret("")).toBe("");
  });

  it("produces the documented enc:v1 envelope", () => {
    const parts = encryptSecret("secret").split(":");
    expect(parts[0]).toBe("enc");
    expect(parts[1]).toBe("v1");
    expect(parts[2]).toMatch(/^[0-9a-f]{24}$/); // 12-byte IV
    expect(parts[3]).toMatch(/^[0-9a-f]{32}$/); // 16-byte GCM tag
    expect(parts[4]).toMatch(/^[0-9a-f]+$/); // ciphertext
  });

  it("uses a fresh IV so identical secrets encrypt differently", () => {
    expect(encryptSecret("same-value")).not.toBe(encryptSecret("same-value"));
  });

  it("returns an empty string for empty or missing input", () => {
    expect(decryptSecret("")).toBe("");
    expect(decryptSecret(null)).toBe("");
    expect(decryptSecret(undefined)).toBe("");
  });

  it("passes legacy plaintext values through unchanged", () => {
    expect(decryptSecret("nvapi-plain-old-key")).toBe("nvapi-plain-old-key");
  });

  it("returns an empty string when the ciphertext is tampered with", () => {
    const encrypted = encryptSecret("secret-value");
    const parts = encrypted.split(":");
    const data = parts[4];
    const flipped = data.slice(0, -2) + (data.endsWith("00") ? "01" : "00");
    const tampered = [...parts.slice(0, 4), flipped].join(":");
    expect(decryptSecret(tampered)).toBe("");
  });

  it("returns an empty string when decrypted with a different key", () => {
    const encrypted = encryptSecret("secret-value");
    vi.stubEnv("AI_CONFIG_ENCRYPTION_KEY", "another-key");
    expect(decryptSecret(encrypted)).toBe("");
  });

  it("returns an empty string for a malformed envelope", () => {
    expect(decryptSecret("enc:v1:zz")).toBe("");
    expect(decryptSecret("enc:v1::")).toBe("");
  });
});

describe("hashSecret", () => {
  it("produces a deterministic SHA-256 hex digest", () => {
    expect(hashSecret("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("is stable across calls and differs per secret", () => {
    expect(hashSecret("token-a")).toBe(hashSecret("token-a"));
    expect(hashSecret("token-a")).not.toBe(hashSecret("token-b"));
  });

  it("returns null for empty input", () => {
    expect(hashSecret("")).toBeNull();
    expect(hashSecret(null)).toBeNull();
    expect(hashSecret(undefined)).toBeNull();
  });
});

describe("maskSecret", () => {
  it("keeps only the last four characters of long secrets", () => {
    expect(maskSecret("abcdefghij")).toBe("••••ghij");
    expect(maskSecret("123456789")).toBe("••••6789");
  });

  it("fully masks secrets that are eight characters or shorter", () => {
    expect(maskSecret("12345678")).toBe("••••");
    expect(maskSecret("abc")).toBe("••••");
  });

  it("returns null for empty input", () => {
    expect(maskSecret("")).toBeNull();
    expect(maskSecret(null)).toBeNull();
    expect(maskSecret(undefined)).toBeNull();
  });
});

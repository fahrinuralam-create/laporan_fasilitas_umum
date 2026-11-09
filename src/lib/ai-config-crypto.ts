import crypto from "crypto";

const PREFIX = "enc:v1:";

function getKey(): Buffer {
  const secret =
    process.env.AI_CONFIG_ENCRYPTION_KEY ||
    process.env.NEXTAUTH_SECRET ||
    "pelaporan-fasilitas-fallback-key";

  return crypto.createHash("sha256").update(secret).digest();
}

/** Enkripsi API key dengan AES-256-GCM. */
export function encryptSecret(plain: string): string {
  if (!plain) return "";
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(
      ":"
    )
  );
}

/** Dekripsi API key. Nilai lama yang belum terenkripsi dikembalikan apa adanya. */
export function decryptSecret(value: string | null | undefined): string {
  if (!value) return "";
  if (!value.startsWith(PREFIX)) return value;

  try {
    const parts = value.split(":");
    // enc : v1 : iv : tag : data
    const iv = Buffer.from(parts[2], "hex");
    const tag = Buffer.from(parts[3], "hex");
    const data = Buffer.from(parts[4], "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8"
    );
  } catch {
    return "";
  }
}

/** Hash SHA-256 dari API key (untuk riwayat, tanpa menyimpan key asli). */
export function hashSecret(plain: string | null | undefined): string | null {
  if (!plain) return null;
  return crypto.createHash("sha256").update(plain).digest("hex");
}

/** Masking API key untuk ditampilkan (mis. ••••abcd). */
export function maskSecret(plain: string | null | undefined): string | null {
  if (!plain) return null;
  if (plain.length <= 8) return "••••";
  return "••••" + plain.slice(-4);
}

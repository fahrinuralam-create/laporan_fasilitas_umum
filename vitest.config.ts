import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    // Samakan alias dengan tsconfig agar test dapat mengimpor kode produksi
    // lewat "@/lib/...".
    alias: {
      "@": srcDir,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Nilai placeholder agar modul produksi (Prisma, enkripsi, OTP) dapat
    // dimuat di lingkungan test tanpa menyentuh database sungguhan.
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "mysql://test:test@localhost:3306/pelaporan_test",
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? "test-nextauth-secret",
      AI_CONFIG_ENCRYPTION_KEY:
        process.env.AI_CONFIG_ENCRYPTION_KEY ?? "test-encryption-key",
      WHATSAPP_OTP_SECRET:
        process.env.WHATSAPP_OTP_SECRET ?? "test-otp-secret",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});

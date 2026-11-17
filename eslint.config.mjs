import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Skrip operasional berbasis CommonJS yang dijalankan langsung dengan `node`.
  // Skrip ini bukan bagian dari bundel aplikasi, sehingga aturan impor ESM
  // (no-require-imports) tidak relevan.
  {
    files: ["scripts/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Artefak laporan coverage dari `npm run test:coverage`.
    "coverage/**",
  ]),
]);

export default eslintConfig;

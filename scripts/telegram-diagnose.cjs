const fs = require("fs");
const path = require("path");
const https = require("https");

function readEnv(file) {
  const map = {};
  const full = path.join(process.cwd(), file);
  if (!fs.existsSync(full)) return map;
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return map;
}

function telegram(token, method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload || {});
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${token}/${method}`,
        method: "POST",
        family: 4,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 15000,
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error("Respons bukan JSON: " + raw.slice(0, 200)));
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  const env = { ...readEnv(".env"), ...process.env };
  const token = (env.TELEGRAM_BOT_TOKEN || "").trim();

  console.log("--- Konfigurasi .env ---");
  console.log("TELEGRAM_BOT_TOKEN       :", token ? `ADA (panjang ${token.length}, akhiran ...${token.slice(-4)})` : "KOSONG");
  console.log("TELEGRAM_BOT_USERNAME    :", env.TELEGRAM_BOT_USERNAME || "(kosong)");
  console.log("TELEGRAM_WEBHOOK_SECRET  :", env.TELEGRAM_WEBHOOK_SECRET ? "ADA" : "(kosong)");
  console.log("TELEGRAM_WEBHOOK_URL     :", env.TELEGRAM_WEBHOOK_URL || "(kosong)");
  console.log("NEXT_PUBLIC_APP_URL      :", env.NEXT_PUBLIC_APP_URL || "(kosong)");
  console.log("NEXTAUTH_URL             :", env.NEXTAUTH_URL || "(kosong)");

  if (!token) {
    console.log("\nToken kosong: bot tidak mungkin berjalan.");
    return;
  }

  try {
    const me = await telegram(token, "getMe");
    console.log("\n--- getMe ---");
    console.log(JSON.stringify(me, null, 2));
  } catch (e) {
    console.log("\n--- getMe GAGAL ---", e.message);
  }

  try {
    const info = await telegram(token, "getWebhookInfo");
    console.log("\n--- getWebhookInfo ---");
    console.log(JSON.stringify(info, null, 2));
  } catch (e) {
    console.log("\n--- getWebhookInfo GAGAL ---", e.message);
  }
})();

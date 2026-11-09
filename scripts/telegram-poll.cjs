/* eslint-disable no-console */
/**
 * Mode polling Telegram untuk pengembangan lokal.
 *
 * Telegram tidak dapat memanggil http://localhost, jadi webhook tidak bisa
 * dipakai saat aplikasi berjalan di komputer lokal. Script ini mengambil
 * pembaruan dari Telegram (getUpdates) lalu meneruskannya ke route webhook
 * lokal, sehingga tautan akun dan chatbot tetap berfungsi tanpa URL publik.
 *
 * Jalankan di terminal terpisah saat `npm run dev` aktif:
 *   npm run telegram:poll
 */
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
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map[trimmed.slice(0, idx).trim()] = value;
  }
  return map;
}

const env = { ...readEnv(".env"), ...process.env };
const TOKEN = (env.TELEGRAM_BOT_TOKEN || "").trim();
const APP_URL = (
  process.env.TELEGRAM_LOCAL_URL ||
  env.NEXT_PUBLIC_APP_URL ||
  env.NEXTAUTH_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");
const WEBHOOK_SECRET = (env.TELEGRAM_WEBHOOK_SECRET || "").trim();

if (!TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN belum diisi di .env. Polling tidak dapat dimulai.");
  process.exit(1);
}

function telegram(method, payload = {}, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${TOKEN}/${method}`,
        method: "POST",
        autoSelectFamily: true,
        autoSelectFamilyAttemptTimeout: 1500,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve({ ok: false, description: "Respons Telegram bukan JSON" });
          }
        });
      }
    );

    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) =>
      resolve({ ok: false, description: error.message })
    );
    req.write(body);
    req.end();
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function deleteWebhook() {
  const result = await telegram("deleteWebhook", {
    drop_pending_updates: false,
  });
  if (result.ok) {
    console.log("Webhook dinonaktifkan; beralih ke mode polling.");
  } else {
    console.log("Gagal menonaktifkan webhook:", result.description);
  }
}

async function forwardToApp(update) {
  const headers = { "Content-Type": "application/json" };
  if (WEBHOOK_SECRET) {
    headers["x-telegram-bot-api-secret-token"] = WEBHOOK_SECRET;
  }

  const res = await fetch(`${APP_URL}/api/telegram/webhook`, {
    method: "POST",
    headers,
    body: JSON.stringify(update),
  });
  return res.status;
}

async function main() {
  console.log("=== Bot Pelaporan Fasilitas — mode polling lokal ===");
  console.log(`Aplikasi : ${APP_URL}`);
  console.log("Tekan Ctrl+C untuk berhenti.\n");

  await deleteWebhook();

  let offset = 0;
  let running = true;

  process.on("SIGINT", () => {
    running = false;
    console.log("\nPolling dihentikan. Jika ingin memakai webhook lagi, atur dari Admin > Bot Telegram.");
    process.exit(0);
  });

  console.log("Menunggu pesan Telegram...\n");

  while (running) {
    const data = await telegram(
      "getUpdates",
      { offset, timeout: 25, allowed_updates: ["message", "callback_query"] },
      35000
    );

    if (!data.ok) {
      if (data.error_code === 409) {
        // Masih ada webhook aktif.
        await deleteWebhook();
        continue;
      }
      console.error("getUpdates gagal:", data.description || "tidak diketahui");
      await sleep(3000);
      continue;
    }

    const updates = data.result || [];
    for (const update of updates) {
      offset = update.update_id + 1;
      const text = update.message?.text || "(bukan pesan teks)";
      console.log(`[${new Date().toLocaleTimeString("id-ID")}] ${text}`);

      try {
        const status = await forwardToApp(update);
        console.log(`  -> diteruskan ke aplikasi (HTTP ${status})`);
      } catch (error) {
        console.error("  -> gagal meneruskan ke aplikasi:", error.message);
      }
    }
  }
}

main().catch((error) => {
  console.error("Polling berhenti karena error:", error.message);
  process.exit(1);
});

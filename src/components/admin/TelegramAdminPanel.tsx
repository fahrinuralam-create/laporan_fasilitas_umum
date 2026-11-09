"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type TelegramAdminData = {
  configured: boolean;
  botUsername: string | null;
  env: {
    hasToken: boolean;
    hasWebhookSecret: boolean;
    appUrl: string | null;
  };
  me: {
    ok: boolean;
    result?: { username?: string; first_name?: string };
    error?: string;
  };
  webhook: {
    ok: boolean;
    result?: {
      url?: string;
      pending_update_count?: number;
      last_error_message?: string;
    };
    error?: string;
  };
  counts: {
    linkedUsers: number;
    totalNotifications: number;
    sent: number;
    failed: number;
  };
};

export default function TelegramAdminPanel({
  initial,
}: {
  initial: TelegramAdminData;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const run = async (action: string, label: string) => {
    setBusy(action);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        setMessage({
          type: "err",
          text: data.error || `${label} gagal`,
        });
        return;
      }
      setMessage({ type: "ok", text: `${label} berhasil.` });
      router.refresh();
    } catch {
      setMessage({ type: "err", text: `Terjadi kesalahan saat ${label}` });
    } finally {
      setBusy(null);
    }
  };

  const stats = [
    { label: "Pengguna tertaut", value: initial.counts.linkedUsers },
    { label: "Total notifikasi", value: initial.counts.totalNotifications },
    { label: "Terkirim ke Telegram", value: initial.counts.sent },
    { label: "Gagal terkirim", value: initial.counts.failed },
  ];

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`p-3 rounded-lg text-sm border ${
            message.type === "ok"
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {!initial.webhook.result?.url && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 space-y-2">
          <p className="font-semibold">Webhook belum aktif.</p>
          <p>
            Saat aplikasi berjalan di komputer lokal, Telegram tidak dapat
            memanggil <code>localhost</code>. Gunakan <b>mode polling</b>:
            jalankan perintah berikut di terminal terpisah saat{" "}
            <code>npm run dev</code> aktif.
          </p>
          <code className="block px-3 py-2 rounded-md bg-white border border-amber-200 text-amber-900">
            npm run telegram:poll
          </code>
          <p>
            Polling akan menonaktifkan webhook secara otomatis dan meneruskan
            pesan Telegram ke aplikasi. Untuk produksi dengan domain HTTPS
            publik, gunakan tombol &quot;Atur Webhook&quot;.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4"
          >
            <p className="text-sm text-zinc-500">{stat.label}</p>
            <p className="text-2xl font-bold text-zinc-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">Status Bot</h2>
            <p className="text-sm text-zinc-500">
              Koneksi ke Telegram Bot API.
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
              initial.configured
                ? "bg-green-100 text-green-700 border-green-200"
                : "bg-red-100 text-red-700 border-red-200"
            }`}
          >
            {initial.configured ? "Token terpasang" : "Belum dikonfigurasi"}
          </span>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-zinc-500">Bot</dt>
            <dd className="font-medium text-zinc-900">
              {initial.me.ok
                ? `@${initial.me.result?.username || initial.botUsername || "-"}`
                : initial.me.error || "Tidak tersedia"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">URL Webhook</dt>
            <dd className="font-medium text-zinc-900 break-all">
              {initial.webhook.result?.url || "Belum diatur"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Pembaruan tertunda</dt>
            <dd className="font-medium text-zinc-900">
              {initial.webhook.result?.pending_update_count ?? 0}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Error webhook terakhir</dt>
            <dd className="font-medium text-zinc-900">
              {initial.webhook.result?.last_error_message || "-"}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => run("set-webhook", "Atur webhook")}
            disabled={busy !== null || !initial.configured}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {busy === "set-webhook" ? "Mengatur..." : "Atur Webhook"}
          </button>
          <button
            onClick={() => run("delete-webhook", "Hapus webhook")}
            disabled={busy !== null || !initial.configured}
            className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50 transition"
          >
            {busy === "delete-webhook" ? "Menghapus..." : "Hapus Webhook"}
          </button>
          <button
            onClick={() => run("test", "Kirim pesan uji")}
            disabled={busy !== null || !initial.configured}
            className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50 transition"
          >
            {busy === "test" ? "Mengirim..." : "Kirim Pesan Uji"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
        <h2 className="text-lg font-bold text-zinc-900 mb-2">
          Konfigurasi Environment
        </h2>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                initial.env.hasToken ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <code>TELEGRAM_BOT_TOKEN</code>
            <span className="text-zinc-500">
              {initial.env.hasToken ? "terisi" : "kosong"}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                initial.env.hasWebhookSecret ? "bg-green-500" : "bg-amber-500"
              }`}
            />
            <code>TELEGRAM_WEBHOOK_SECRET</code>
            <span className="text-zinc-500">
              {initial.env.hasWebhookSecret
                ? "terisi (disarankan)"
                : "kosong (opsional)"}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                initial.env.appUrl ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <code>NEXT_PUBLIC_APP_URL</code>
            <span className="text-zinc-500">
              {initial.env.appUrl || "belum diatur"}
            </span>
          </li>
        </ul>
        <p className="mt-4 text-sm text-zinc-500">
          Isi variabel di file <code>.env</code>, lalu restart server. Setelah
          itu klik &quot;Atur Webhook&quot;. Untuk menerima pesan uji, tautkan
          akun Telegram admin melalui halaman Pengaturan Telegram.
        </p>
      </div>
    </div>
  );
}

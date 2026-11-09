"use client";

import { useState } from "react";

type TelegramStatus = {
  linked: boolean;
  username: string | null;
  linkedAt: string | null;
  enabled: boolean;
  botConfigured: boolean;
  botUsername: string | null;
};

type TokenInfo = {
  command: string;
  deepLink: string | null;
  expiresAt: string;
};

export default function TelegramLinkPanel({
  initial,
}: {
  initial: TelegramStatus;
}) {
  const [status, setStatus] = useState<TelegramStatus>(initial);
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const createToken = async () => {
    setBusy("create");
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/telegram/link", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal membuat kode tautan");
        return;
      }
      setToken({
        command: data.command,
        deepLink: data.deepLink,
        expiresAt: data.expiresAt,
      });
      setStatus((prev) => ({
        ...prev,
        botConfigured: data.botConfigured,
        botUsername: data.botUsername,
      }));
      setNotice(
        data.botConfigured
          ? "Kode dibuat. Buka bot lalu kirim perintah di bawah ini."
          : "Kode dibuat, tetapi admin belum mengatur bot Telegram."
      );
    } catch {
      setError("Terjadi kesalahan saat membuat kode tautan");
    } finally {
      setBusy(null);
    }
  };

  const checkStatus = async () => {
    setBusy("check");
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/telegram/link");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal memeriksa status");
        return;
      }
      setStatus(data);
      if (data.linked) {
        setToken(null);
        setNotice("Akun Telegram berhasil tertaut.");
      } else {
        setNotice("Belum tertaut. Pastikan perintah sudah dikirim ke bot.");
      }
    } catch {
      setError("Terjadi kesalahan saat memeriksa status");
    } finally {
      setBusy(null);
    }
  };

  const unlink = async () => {
    setBusy("unlink");
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/telegram/link", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Gagal memutuskan tautan");
        return;
      }
      setStatus((prev) => ({
        ...prev,
        linked: false,
        username: null,
        linkedAt: null,
      }));
      setNotice("Tautan Telegram diputuskan.");
    } catch {
      setError("Terjadi kesalahan saat memutuskan tautan");
    } finally {
      setBusy(null);
    }
  };

  const toggleEnabled = async () => {
    setBusy("toggle");
    setError("");
    setNotice("");
    const next = !status.enabled;
    try {
      const res = await fetch("/api/telegram/link", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal mengubah pengaturan");
        return;
      }
      setStatus((prev) => ({ ...prev, enabled: next }));
      setNotice(
        next
          ? "Notifikasi Telegram diaktifkan."
          : "Notifikasi Telegram dinonaktifkan."
      );
    } catch {
      setError("Terjadi kesalahan saat mengubah pengaturan");
    } finally {
      setBusy(null);
    }
  };

  const copyCommand = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token.command);
      setNotice("Perintah disalin ke clipboard.");
    } catch {
      setError("Gagal menyalin. Salin perintah secara manual.");
    }
  };

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">Status Tautan</h2>
          <p className="text-sm text-zinc-500">
            Notifikasi laporan dikirim langsung ke chat Telegram Anda.
          </p>
        </div>
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
            status.linked
              ? "bg-green-100 text-green-700 border-green-200"
              : "bg-zinc-100 text-zinc-600 border-zinc-200"
          }`}
        >
          {status.linked ? "Tertaut" : "Belum tertaut"}
        </span>
      </div>

      {!status.botConfigured && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          Bot Telegram belum dikonfigurasi oleh admin (TELEGRAM_BOT_TOKEN
          kosong). Kode tautan tetap bisa dibuat, tetapi notifikasi belum akan
          terkirim sampai admin mengaturnya.
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-700">
          {notice}
        </div>
      )}

      {status.linked ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-zinc-500">Username Telegram</p>
              <p className="font-medium text-zinc-900">
                {status.username ? `@${status.username}` : "-"}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Tanggal tertaut</p>
              <p className="font-medium text-zinc-900">
                {status.linkedAt
                  ? new Date(status.linkedAt).toLocaleString("id-ID")
                  : "-"}
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={status.enabled}
              onChange={toggleEnabled}
              disabled={busy !== null}
            />
            Aktifkan notifikasi Telegram untuk akun ini
          </label>

          <button
            onClick={unlink}
            disabled={busy !== null}
            className="px-4 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-50 transition"
          >
            {busy === "unlink" ? "Memutuskan..." : "Putuskan Tautan"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <ol className="list-decimal ml-5 text-sm text-zinc-700 space-y-1">
            <li>Klik tombol &quot;Buat Kode Tautan&quot; di bawah.</li>
            <li>
              Buka bot{" "}
              {status.botUsername ? (
                <span className="font-medium">@{status.botUsername}</span>
              ) : (
                "Telegram desa"
              )}{" "}
              lalu kirim perintah yang muncul.
            </li>
            <li>Klik &quot;Cek Status&quot; setelah mengirim perintah.</li>
          </ol>

          <button
            onClick={createToken}
            disabled={busy !== null}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {busy === "create" ? "Membuat kode..." : "Buat Kode Tautan"}
          </button>

          {token && (
            <div className="p-4 rounded-lg border border-zinc-200 bg-zinc-50 space-y-3">
              <p className="text-xs text-zinc-500">
                Kode berlaku sampai{" "}
                {new Date(token.expiresAt).toLocaleString("id-ID")}.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {token.deepLink && (
                  <a
                    href={token.deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 transition"
                  >
                    Buka Bot Telegram
                  </a>
                )}
                <button
                  onClick={copyCommand}
                  type="button"
                  className="px-4 py-2 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-white transition"
                >
                  Salin Perintah
                </button>
                <button
                  onClick={checkStatus}
                  disabled={busy !== null}
                  type="button"
                  className="px-4 py-2 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-white disabled:opacity-50 transition"
                >
                  {busy === "check" ? "Memeriksa..." : "Cek Status"}
                </button>
              </div>
              <code className="block px-3 py-2 rounded-lg bg-white border border-zinc-200 text-sm break-all">
                {token.command}
              </code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

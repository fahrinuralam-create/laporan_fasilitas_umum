"use client";

import { useState } from "react";
import type { TelegramLinkStatus } from "@/lib/telegram-link";

type TokenInfo = {
  command: string;
  deepLink: string | null;
  expiresAt: string;
};

export default function TelegramLinkPanel({
  initial,
}: {
  initial: TelegramLinkStatus;
}) {
  const [status, setStatus] = useState<TelegramLinkStatus>(initial);
  const [phone, setPhone] = useState(initial.phone || "");
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const request = status.request;
  const statusText = status.linked
    ? "Tertaut & aktif"
    : request
      ? request.statusLabel
      : "Belum tertaut";

  const savePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("phone");
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/telegram/phone", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan nomor HP");
        return;
      }
      setStatus(data);
      setPhone(data.phone || "");
      setToken(null);
      setNotice(data.message || "Nomor HP disimpan.");
    } catch {
      setError("Terjadi kesalahan saat menyimpan nomor HP");
    } finally {
      setBusy(null);
    }
  };

  const createToken = async (action: "confirmation" | "resubmit" = "confirmation") => {
    setBusy(action);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/telegram/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal membuat kode konfirmasi");
        if (data.needsResubmit) setToken(null);
        return;
      }
      setStatus(data);
      setToken(
        data.token
          ? {
              command: data.command,
              deepLink: data.deepLink,
              expiresAt: data.expiresAt,
            }
          : null
      );
      setNotice(
        action === "resubmit"
          ? data.message || "Pengajuan ulang dibuat."
          : "Kode konfirmasi dibuat. Buka bot Telegram lalu bagikan kontak Anda."
      );
    } catch {
      setError("Terjadi kesalahan saat membuat kode konfirmasi");
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
      setPhone(data.phone || "");
      if (data.linked) {
        setToken(null);
        setNotice("Akun Telegram berhasil aktif.");
      } else {
        setNotice("Status diperbarui.");
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Gagal memutuskan tautan");
        return;
      }
      setStatus(data);
      setToken(null);
      setNotice(data.message || "Tautan Telegram diputuskan.");
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
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">Status Tautan</h2>
            <p className="text-sm text-zinc-500">
              Notifikasi laporan dikirim ke chat Telegram setelah nomor HP dan
              identitas Telegram diverifikasi.
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
              status.linked
                ? "bg-green-100 text-green-700 border-green-200"
                : request?.status === "REJECTED"
                  ? "bg-red-100 text-red-700 border-red-200"
                  : request
                    ? "bg-amber-100 text-amber-700 border-amber-200"
                    : "bg-zinc-100 text-zinc-600 border-zinc-200"
            }`}
          >
            {statusText}
          </span>
        </div>

        {!status.botConfigured && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
            Bot Telegram belum dikonfigurasi oleh admin (TELEGRAM_BOT_TOKEN
            kosong). Pengajuan tetap dapat diproses, tetapi notifikasi belum akan
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

        <form onSubmit={savePhone} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Nomor HP terdaftar
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Contoh: 081234567890"
                className="flex-1 px-4 py-2 rounded-lg border border-zinc-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              />
              <button
                type="submit"
                disabled={busy !== null}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {busy === "phone" ? "Menyimpan..." : "Simpan Nomor HP"}
              </button>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Format yang didukung: 08..., 62..., atau +62.... Jika nomor
              berubah, tautan Telegram lama dinonaktifkan dan pengajuan baru
              otomatis menunggu persetujuan admin/petugas.
            </p>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6 space-y-5">
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
                <p className="text-zinc-500">Tanggal aktif</p>
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

            <div className="flex flex-wrap gap-2">
              <button
                onClick={checkStatus}
                disabled={busy !== null}
                type="button"
                className="px-4 py-2 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition"
              >
                {busy === "check" ? "Memeriksa..." : "Cek Status"}
              </button>
              <button
                onClick={unlink}
                disabled={busy !== null}
                type="button"
                className="px-4 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-50 transition"
              >
                {busy === "unlink" ? "Memutuskan..." : "Putuskan Tautan"}
              </button>
            </div>
          </div>
        ) : !status.phone ? (
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
            Tambahkan nomor HP terlebih dahulu. Pengajuan penautan Telegram
            dibuat otomatis setelah nomor HP disimpan.
          </div>
        ) : !request ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">
              Nomor HP sudah terdaftar, tetapi belum ada pengajuan penautan
              Telegram. Buat pengajuan untuk memulai verifikasi admin/petugas.
            </p>
            <button
              onClick={() => createToken("resubmit")}
              disabled={busy !== null}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {busy === "resubmit" ? "Membuat pengajuan..." : "Ajukan Penautan"}
            </button>
          </div>
        ) : request.status === "PENDING_ADMIN" ? (
          <div className="space-y-3">
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
              <p className="font-semibold">Menunggu persetujuan admin/petugas.</p>
              <p className="mt-1">
                Pengajuan untuk nomor{" "}
                <span className="font-medium">{request.phoneDisplay}</span>{" "}
                dibuat pada{" "}
                {new Date(request.createdAt).toLocaleString("id-ID")}.
              </p>
              {request.confirmedAt && (
                <p className="mt-1">
                  Identitas Telegram sudah dikonfirmasi. Koneksi akan aktif
                  setelah admin/petugas menyetujui pengajuan.
                </p>
              )}
            </div>
            <button
              onClick={checkStatus}
              disabled={busy !== null}
              type="button"
              className="px-4 py-2 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition"
            >
              {busy === "check" ? "Memeriksa..." : "Cek Status"}
            </button>
          </div>
        ) : request.status === "PENDING_TELEGRAM" ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
              <p className="font-semibold">
                Pengajuan disetujui. Konfirmasi identitas Telegram Anda.
              </p>
              <p className="mt-1">
                Buka bot Telegram, kirim perintah konfirmasi, lalu tekan tombol{" "}
                <b>Bagikan Nomor HP</b>. Kontak harus berasal dari akun Telegram
                Anda sendiri dan nomornya harus sama dengan{" "}
                <span className="font-medium">{request.phoneDisplay}</span>.
              </p>
            </div>

            {!token && (
              <button
                onClick={() => createToken("confirmation")}
                disabled={busy !== null}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {busy === "confirmation"
                  ? "Membuat kode..."
                  : "Buat Tautan Konfirmasi"}
              </button>
            )}

            {token && (
              <div className="p-4 rounded-lg border border-zinc-200 bg-zinc-50 space-y-3">
                <p className="text-xs text-zinc-500">
                  Kode berlaku sampai{" "}
                  {new Date(token.expiresAt).toLocaleString("id-ID")} dan hanya
                  bisa digunakan satu kali.
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
        ) : request.status === "REJECTED" ? (
          <div className="space-y-3">
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              <p className="font-semibold">Pengajuan ditolak.</p>
              {request.rejectionReason && (
                <p className="mt-1">Alasan: {request.rejectionReason}</p>
              )}
              {request.reviewedAt && (
                <p className="mt-1 text-xs">
                  Diputuskan{" "}
                  {new Date(request.reviewedAt).toLocaleString("id-ID")}
                  {request.reviewerName
                    ? ` oleh ${request.reviewerName}`
                    : ""}
                  .
                </p>
              )}
            </div>
            <button
              onClick={() => createToken("resubmit")}
              disabled={busy !== null}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {busy === "resubmit" ? "Mengajukan ulang..." : "Ajukan Ulang"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 text-sm text-zinc-700">
              <p className="font-semibold">
                Pengajuan berstatus {request.statusLabel.toLowerCase()}.
              </p>
              <p className="mt-1">
                Ajukan penautan ulang untuk memulai verifikasi kembali.
              </p>
            </div>
            <button
              onClick={() => createToken("resubmit")}
              disabled={busy !== null}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {busy === "resubmit" ? "Mengajukan ulang..." : "Ajukan Ulang"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

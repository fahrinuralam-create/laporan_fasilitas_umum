"use client";

import { useState } from "react";
import type { WhatsAppLinkStatus } from "@/lib/whatsapp-link";

export default function WhatsAppLinkPanel({
  initial,
}: {
  initial: WhatsAppLinkStatus;
}) {
  const [status, setStatus] = useState<WhatsAppLinkStatus>(initial);
  const [phone, setPhone] = useState(
    initial.request?.phoneDisplay || initial.numberDisplay || initial.phone || ""
  );
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const request = status.request;
  const statusText = status.linked
    ? "Tertaut & terverifikasi"
    : request
      ? request.statusLabel
      : "Belum tertaut";

  const applyStatus = (data: WhatsAppLinkStatus & { message?: string }) => {
    setStatus(data);
    const nextPhone =
      data.request?.phoneDisplay || data.numberDisplay || data.phone || "";
    if (nextPhone) setPhone(nextPhone);
  };

  const submitNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("phone");
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/whatsapp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan nomor WhatsApp");
        return;
      }
      applyStatus(data);
      setOtp("");
      setNotice(data.message || "Pengajuan nomor WhatsApp dibuat.");
    } catch {
      setError("Terjadi kesalahan saat menyimpan nomor WhatsApp");
    } finally {
      setBusy(null);
    }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("verify");
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/whatsapp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.remainingAttempts !== undefined
            ? `${data.error || "Kode OTP salah"} Sisa percobaan: ${data.remainingAttempts}.`
            : data.error || "Verifikasi OTP gagal"
        );
        if (data.error?.includes("kedaluwarsa") || data.error?.includes("Batas")) {
          await checkStatus();
        }
        return;
      }
      applyStatus(data);
      setOtp("");
      setNotice(data.message || "Nomor WhatsApp berhasil diverifikasi.");
    } catch {
      setError("Terjadi kesalahan saat memverifikasi OTP");
    } finally {
      setBusy(null);
    }
  };

  const checkStatus = async () => {
    setBusy("check");
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/whatsapp/status");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal memeriksa status");
        return;
      }
      applyStatus(data);
      setNotice(
        data.linked
          ? "Nomor WhatsApp aktif."
          : "Status pengajuan diperbarui."
      );
    } catch {
      setError("Terjadi kesalahan saat memeriksa status");
    } finally {
      setBusy(null);
    }
  };

  const resubmit = async () => {
    setBusy("resubmit");
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/whatsapp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resubmit" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Gagal membuat pengajuan ulang");
        return;
      }
      applyStatus(data);
      setNotice(data.message || "Pengajuan ulang dibuat.");
    } catch {
      setError("Terjadi kesalahan saat membuat pengajuan ulang");
    } finally {
      setBusy(null);
    }
  };

  const unlink = async () => {
    setBusy("unlink");
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/whatsapp/status", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Gagal memutuskan penautan");
        return;
      }
      setStatus(data);
      setOtp("");
      setNotice(data.message || "Penautan WhatsApp diputuskan.");
    } catch {
      setError("Terjadi kesalahan saat memutuskan penautan");
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
      const res = await fetch("/api/whatsapp/status", {
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
          ? "Notifikasi WhatsApp diaktifkan."
          : "Notifikasi WhatsApp dinonaktifkan."
      );
    } catch {
      setError("Terjadi kesalahan saat mengubah pengaturan");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">Status Penautan</h2>
            <p className="text-sm text-zinc-500">
              Notifikasi laporan dikirim ke WhatsApp setelah nomor disetujui
              admin dan diverifikasi dengan OTP.
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

        {!status.fonnteConfigured && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
            Layanan WhatsApp (Fonnte) belum dikonfigurasi oleh admin. Pengajuan
            tetap dapat diproses, tetapi OTP dan notifikasi belum dapat dikirim
            sampai <code>FONNTE_API_TOKEN</code> diatur.
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

        <form onSubmit={submitNumber} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Nomor WhatsApp
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
                {busy === "phone" ? "Mengajukan..." : "Ajukan Nomor"}
              </button>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Format yang didukung: 08..., 62..., atau +62.... Nomor lama tetap
              aktif sampai nomor baru berhasil diverifikasi.
            </p>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6 space-y-5">
        {status.linked ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-zinc-500">Nomor WhatsApp aktif</p>
                <p className="font-medium text-zinc-900">
                  {status.numberDisplay || "-"}
                </p>
              </div>
              <div>
                <p className="text-zinc-500">Tanggal verifikasi</p>
                <p className="font-medium text-zinc-900">
                  {status.verifiedAt
                    ? new Date(status.verifiedAt).toLocaleString("id-ID")
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
              Aktifkan notifikasi WhatsApp untuk akun ini
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
                {busy === "unlink" ? "Memutuskan..." : "Putuskan Penautan"}
              </button>
            </div>

            {request && request.status !== "ACTIVE" && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                Ada pengajuan nomor baru ({request.phoneDisplay}) dengan status{" "}
                {request.statusLabel.toLowerCase()}. Nomor aktif saat ini tetap
                digunakan sampai pengajuan baru berhasil diverifikasi.
              </p>
            )}
          </div>
        ) : !request ? (
          <div className="space-y-3">
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
              Belum ada pengajuan nomor WhatsApp. Masukkan nomor di atas untuk
              memulai proses persetujuan admin dan verifikasi OTP.
            </div>
            {status.phoneNormalized && (
              <button
                onClick={resubmit}
                disabled={busy !== null}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {busy === "resubmit" ? "Mengajukan..." : "Ajukan Nomor Terdaftar"}
              </button>
            )}
          </div>
        ) : request.status === "PENDING_ADMIN" ? (
          <div className="space-y-3">
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
              <p className="font-semibold">
                Menunggu persetujuan admin.
              </p>
              <p className="mt-1">
                Pengajuan untuk nomor{" "}
                <span className="font-medium">{request.phoneDisplay}</span>{" "}
                dibuat pada {new Date(request.createdAt).toLocaleString("id-ID")}.
              </p>
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
        ) : request.status === "PENDING_VERIFICATION" ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
              <p className="font-semibold">
                Pengajuan disetujui. Verifikasi kepemilikan nomor.
              </p>
              <p className="mt-1">
                Kode OTP telah dikirim ke WhatsApp{" "}
                <span className="font-medium">{request.phoneDisplay}</span>.
                Masukkan kode 6 digit di bawah ini.
              </p>
              {request.otpSentAt && (
                <p className="mt-1 text-xs">
                  OTP dikirim {new Date(request.otpSentAt).toLocaleString("id-ID")}
                  {request.otpExpiresAt
                    ? ` · berlaku sampai ${new Date(
                        request.otpExpiresAt
                      ).toLocaleString("id-ID")}`
                    : ""}
                </p>
              )}
              {request.otpSendError && (
                <p className="mt-1 text-xs text-red-700">
                  Pengiriman OTP terakhir gagal: {request.otpSendError}. Minta
                  admin mengirim ulang OTP.
                </p>
              )}
              <p className="mt-1 text-xs">
                Sisa percobaan:{" "}
                {Math.max(
                  0,
                  request.otpMaxAttempts - request.otpAttempts
                )}{" "}
                dari {request.otpMaxAttempts}.
              </p>
            </div>

            <form onSubmit={verifyOtp} className="flex flex-col sm:flex-row gap-2">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="Kode OTP 6 digit"
                className="flex-1 px-4 py-2 rounded-lg border border-zinc-300 tracking-[0.3em] font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              />
              <button
                type="submit"
                disabled={busy !== null || otp.length !== 6}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {busy === "verify" ? "Memverifikasi..." : "Verifikasi OTP"}
              </button>
            </form>

            <button
              onClick={checkStatus}
              disabled={busy !== null}
              type="button"
              className="px-4 py-2 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition"
            >
              {busy === "check" ? "Memeriksa..." : "Cek Status"}
            </button>
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
                  {request.reviewerName ? ` oleh ${request.reviewerName}` : ""}.
                </p>
              )}
            </div>
            <button
              onClick={resubmit}
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
                Ajukan ulang untuk memulai proses persetujuan dan verifikasi OTP.
              </p>
            </div>
            <button
              onClick={resubmit}
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

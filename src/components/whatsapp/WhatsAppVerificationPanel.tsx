"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { VerificationRequestView } from "@/lib/whatsapp-link";

export type WhatsAppVerificationData = {
  counts: {
    pendingAdmin: number;
    pendingVerification: number;
    active: number;
    total: number;
  };
  requests: VerificationRequestView[];
};

function statusBadge(status: string): string {
  switch (status) {
    case "PENDING_ADMIN":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "PENDING_VERIFICATION":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "ACTIVE":
      return "bg-green-100 text-green-700 border-green-200";
    case "REJECTED":
      return "bg-red-100 text-red-700 border-red-200";
    case "REVOKED":
      return "bg-zinc-100 text-zinc-700 border-zinc-200";
    default:
      return "bg-zinc-100 text-zinc-600 border-zinc-200";
  }
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID");
}

export default function WhatsAppVerificationPanel({
  initial,
}: {
  initial: WhatsAppVerificationData;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const pendingAdmin = data.requests.filter(
    (r) => r.status === "PENDING_ADMIN"
  );
  const pendingVerification = data.requests.filter(
    (r) => r.status === "PENDING_VERIFICATION"
  );

  const refresh = async () => {
    const res = await fetch("/api/whatsapp/verification");
    if (res.ok) {
      const fresh = await res.json();
      setData(fresh);
    }
    router.refresh();
  };

  const approve = async (id: string) => {
    setBusy(`approve-${id}`);
    setMessage(null);
    try {
      const res = await fetch(`/api/whatsapp/verification/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const result = await res.json();
      if (!res.ok) {
        setMessage({
          type: "err",
          text: result.error || "Gagal menyetujui pengajuan.",
        });
        return;
      }
      setMessage({
        type: result.otpSent ? "ok" : "err",
        text:
          result.message ||
          (result.otpSent
            ? "Pengajuan disetujui dan OTP dikirim."
            : "Pengajuan disetujui, tetapi OTP gagal dikirim."),
      });
      await refresh();
    } catch {
      setMessage({ type: "err", text: "Terjadi kesalahan saat menyetujui." });
    } finally {
      setBusy(null);
    }
  };

  const reject = async (id: string) => {
    if (!reason.trim()) {
      setMessage({ type: "err", text: "Alasan penolakan wajib diisi." });
      return;
    }
    setBusy(`reject-${id}`);
    setMessage(null);
    try {
      const res = await fetch(`/api/whatsapp/verification/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason }),
      });
      const result = await res.json();
      if (!res.ok) {
        setMessage({
          type: "err",
          text: result.error || "Gagal menolak pengajuan.",
        });
        return;
      }
      setRejectingId(null);
      setReason("");
      setMessage({ type: "ok", text: "Pengajuan ditolak." });
      await refresh();
    } catch {
      setMessage({ type: "err", text: "Terjadi kesalahan saat menolak." });
    } finally {
      setBusy(null);
    }
  };

  const resendOtp = async (id: string) => {
    setBusy(`otp-${id}`);
    setMessage(null);
    try {
      const res = await fetch(`/api/whatsapp/verification/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend-otp" }),
      });
      const result = await res.json();
      if (!res.ok) {
        setMessage({
          type: "err",
          text: result.error || "Gagal mengirim ulang OTP.",
        });
        return;
      }
      setMessage({
        type: result.otpSent ? "ok" : "err",
        text: result.message || "Permintaan kirim ulang OTP diproses.",
      });
      await refresh();
    } catch {
      setMessage({ type: "err", text: "Terjadi kesalahan saat mengirim OTP." });
    } finally {
      setBusy(null);
    }
  };

  const stats = [
    {
      label: "Menunggu persetujuan",
      value: data.counts.pendingAdmin,
      color: "text-amber-600",
    },
    {
      label: "Menunggu verifikasi OTP",
      value: data.counts.pendingVerification,
      color: "text-blue-600",
    },
    {
      label: "Penautan aktif",
      value: data.counts.active,
      color: "text-green-600",
    },
    {
      label: "Total pengajuan",
      value: data.counts.total,
      color: "text-zinc-900",
    },
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4"
          >
            <p className="text-sm text-zinc-500">{stat.label}</p>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-zinc-900">
            Pengajuan Menunggu Persetujuan
          </h2>
          <p className="text-sm text-zinc-500">
            Periksa identitas akun dan nomor WhatsApp sebelum menyetujui.
            Persetujuan akan mengirim OTP ke nomor tersebut.
          </p>
        </div>

        {pendingAdmin.length === 0 ? (
          <p className="p-6 text-center text-sm text-zinc-500">
            Tidak ada pengajuan yang menunggu persetujuan.
          </p>
        ) : (
          <div className="space-y-4">
            {pendingAdmin.map((request) => (
              <div
                key={request.id}
                className="rounded-lg border border-zinc-200 p-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-zinc-900">
                      {request.user.name || request.user.email || request.userId}
                    </p>
                    <p className="text-xs text-zinc-500">
                      ID: {request.user.id}
                      {request.user.email ? ` · ${request.user.email}` : ""}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusBadge(
                      request.status
                    )}`}
                  >
                    {request.statusLabel}
                  </span>
                </div>

                <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-zinc-500">Nomor WhatsApp diajukan</dt>
                    <dd className="font-medium text-zinc-900">
                      {request.phoneDisplay}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Jenis pengajuan</dt>
                    <dd className="font-medium text-zinc-900">
                      {request.requestTypeLabel}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Tanggal pengajuan</dt>
                    <dd className="font-medium text-zinc-900">
                      {formatDate(request.createdAt)}
                    </dd>
                  </div>
                  {request.previousPhoneDisplay && (
                    <div>
                      <dt className="text-zinc-500">Nomor sebelumnya</dt>
                      <dd className="font-medium text-zinc-900">
                        {request.previousPhoneDisplay}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-zinc-500">Nomor terverifikasi saat ini</dt>
                    <dd className="font-medium text-zinc-900">
                      {request.user.whatsappNumber
                        ? request.user.whatsappNumber
                        : "-"}
                    </dd>
                  </div>
                </dl>

                {rejectingId === request.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                      placeholder="Alasan penolakan (wajib diisi)"
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => reject(request.id)}
                        disabled={busy !== null}
                        className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition"
                      >
                        {busy === `reject-${request.id}`
                          ? "Menolak..."
                          : "Konfirmasi Tolak"}
                      </button>
                      <button
                        onClick={() => {
                          setRejectingId(null);
                          setReason("");
                        }}
                        disabled={busy !== null}
                        className="px-4 py-2 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => approve(request.id)}
                      disabled={busy !== null}
                      className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition"
                    >
                      {busy === `approve-${request.id}`
                        ? "Menyetujui..."
                        : "Setujui & Kirim OTP"}
                    </button>
                    <button
                      onClick={() => {
                        setRejectingId(request.id);
                        setReason("");
                        setMessage(null);
                      }}
                      disabled={busy !== null}
                      className="px-4 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-50 transition"
                    >
                      Tolak
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-zinc-900">
            Menunggu Verifikasi OTP
          </h2>
          <p className="text-sm text-zinc-500">
            Persetujuan admin sudah diberikan, tetapi kepemilikan nomor belum
            terbukti sampai pengguna memasukkan OTP.
          </p>
        </div>

        {pendingVerification.length === 0 ? (
          <p className="p-6 text-center text-sm text-zinc-500">
            Tidak ada pengajuan yang menunggu verifikasi OTP.
          </p>
        ) : (
          <div className="space-y-3">
            {pendingVerification.map((request) => (
              <div
                key={request.id}
                className="rounded-lg border border-zinc-200 p-4 flex flex-wrap items-start justify-between gap-3"
              >
                <div className="text-sm">
                  <p className="font-semibold text-zinc-900">
                    {request.user.name || request.user.email || request.userId}
                  </p>
                  <p className="text-zinc-600">
                    {request.phoneDisplay} · {request.requestTypeLabel}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    OTP terkirim: {formatDate(request.otpSentAt)} · Percobaan:{" "}
                    {request.otpAttempts}/{request.otpMaxAttempts}
                    {request.otpExpiresAt
                      ? ` · Berlaku sampai ${formatDate(request.otpExpiresAt)}`
                      : ""}
                  </p>
                  {request.otpSendError && (
                    <p className="text-xs text-red-600 mt-1">
                      Error pengiriman: {request.otpSendError}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => resendOtp(request.id)}
                  disabled={busy !== null}
                  className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 text-sm font-semibold hover:bg-blue-50 disabled:opacity-50 transition"
                >
                  {busy === `otp-${request.id}`
                    ? "Mengirim..."
                    : "Kirim Ulang OTP"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200">
          <h2 className="text-lg font-bold text-zinc-900">
            Riwayat Pengajuan
          </h2>
          <p className="text-sm text-zinc-500">
            Menampilkan maksimal 100 pengajuan terbaru.
          </p>
        </div>

        {data.requests.length === 0 ? (
          <p className="p-6 text-center text-sm text-zinc-500">
            Belum ada pengajuan.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-zinc-500 text-xs uppercase">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Pengguna</th>
                  <th className="text-left font-medium px-4 py-3">
                    Nomor WhatsApp
                  </th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="text-left font-medium px-4 py-3">
                    Verifikasi OTP
                  </th>
                  <th className="text-left font-medium px-4 py-3">Diproses</th>
                  <th className="text-left font-medium px-4 py-3">Tanggal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.requests.map((request) => (
                  <tr key={request.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-900">
                        {request.user.name ||
                          request.user.email ||
                          request.userId}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {request.user.email || request.user.id}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      {request.phoneDisplay}
                      {request.previousPhoneDisplay && (
                        <p className="text-xs text-zinc-500">
                          Sebelumnya: {request.previousPhoneDisplay}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusBadge(
                          request.status
                        )}`}
                      >
                        {request.statusLabel}
                      </span>
                      {request.rejectionReason && (
                        <p className="text-xs text-red-600 mt-1">
                          {request.rejectionReason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      {request.otpVerifiedAt ? (
                        <>
                          <p>{formatDate(request.otpVerifiedAt)}</p>
                          <p className="text-xs text-zinc-500">
                            Terverifikasi
                          </p>
                        </>
                      ) : request.otpSentAt || request.otpSendError ? (
                        <>
                          <p>
                            {request.otpSentAt
                              ? `Terkirim ${formatDate(request.otpSentAt)}`
                              : "Gagal dikirim"}
                          </p>
                          <p className="text-xs text-zinc-500">
                            Percobaan {request.otpAttempts}/
                            {request.otpMaxAttempts}
                          </p>
                          {request.otpSendError && (
                            <p className="text-xs text-red-600">
                              {request.otpSendError}
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="text-zinc-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      {request.reviewedAt ? (
                        <>
                          <p>
                            {request.reviewerName ||
                              request.reviewerEmail ||
                              "-"}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {formatDate(request.reviewedAt)}
                          </p>
                        </>
                      ) : (
                        <span className="text-zinc-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      {formatDate(request.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

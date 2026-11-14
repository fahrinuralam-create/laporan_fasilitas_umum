"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type WhatsAppAdminData = {
  configured: boolean;
  env: {
    hasToken: boolean;
    apiUrl: string;
    countryCode: string;
    timeoutMs: number;
  };
  counts: {
    verifiedUsers: number;
    totalNotifications: number;
    sent: number;
    failed: number;
    pendingAdmin: number;
    pendingVerification: number;
    activeLinks: number;
  };
};

export default function WhatsAppAdminPanel({
  initial,
}: {
  initial: WhatsAppAdminData;
}) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const sendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("test");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", phone }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        setMessage({
          type: "err",
          text: data.error || "Pesan uji gagal dikirim.",
        });
        return;
      }
      setMessage({ type: "ok", text: "Pesan uji berhasil dikirim." });
      router.refresh();
    } catch {
      setMessage({
        type: "err",
        text: "Terjadi kesalahan saat mengirim pesan uji.",
      });
    } finally {
      setBusy(null);
    }
  };

  const stats = [
    { label: "Pengguna terverifikasi", value: initial.counts.verifiedUsers },
    { label: "Total notifikasi", value: initial.counts.totalNotifications },
    { label: "Terkirim ke WhatsApp", value: initial.counts.sent },
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">
              Status Layanan Fonnte
            </h2>
            <p className="text-sm text-zinc-500">
              Koneksi backend ke WhatsApp Gateway Fonnte.
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
            <dt className="text-zinc-500">Endpoint API</dt>
            <dd className="font-medium text-zinc-900 break-all">
              {initial.env.apiUrl}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Kode negara</dt>
            <dd className="font-medium text-zinc-900">
              {initial.env.countryCode}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Timeout pengiriman</dt>
            <dd className="font-medium text-zinc-900">
              {initial.env.timeoutMs} ms
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Pengajuan menunggu</dt>
            <dd className="font-medium text-zinc-900">
              {initial.counts.pendingAdmin} persetujuan ·{" "}
              {initial.counts.pendingVerification} OTP
            </dd>
          </div>
        </dl>

        <form onSubmit={sendTest} className="space-y-2">
          <label className="block text-sm font-medium text-zinc-700">
            Kirim pesan uji
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Nomor tujuan uji (opsional jika akun sudah tertaut)"
              className="flex-1 px-4 py-2 rounded-lg border border-zinc-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
            <button
              type="submit"
              disabled={busy !== null || !initial.configured}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {busy === "test" ? "Mengirim..." : "Kirim Pesan Uji"}
            </button>
          </div>
        </form>
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
            <code>FONNTE_API_TOKEN</code>
            <span className="text-zinc-500">
              {initial.env.hasToken ? "terisi" : "kosong"}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            <code>FONNTE_API_URL</code>
            <span className="text-zinc-500">{initial.env.apiUrl}</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
            <code>FONNTE_COUNTRY_CODE</code>
            <span className="text-zinc-500">{initial.env.countryCode}</span>
          </li>
        </ul>
        <p className="mt-4 text-sm text-zinc-500">
          Token hanya dibaca oleh backend dan tidak pernah dikirim ke browser.
          Isi variabel di file <code>.env</code>, lalu restart server.
        </p>
      </div>
    </div>
  );
}

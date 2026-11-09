"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Officer = { id: string; name: string | null; email: string | null };

export default function AdminReportActions({
  reportId,
  status,
  officers,
}: {
  reportId: string;
  status: string;
  officers: Officer[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [officerId, setOfficerId] = useState(officers[0]?.id ?? "");
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");

  const run = async (action: string, payload: Record<string, unknown> = {}) => {
    setPending(action);
    setError("");
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Aksi gagal");
        setPending(null);
        return;
      }
      setShowReject(false);
      setReason("");
      router.refresh();
    } catch {
      setError("Terjadi kesalahan");
    } finally {
      setPending(null);
    }
  };

  const canAct = status === "DIAJUKAN" || status === "DIVERIFIKASI";

  const analyze = async () => {
    setPending("analyze");
    setError("");
    setAiMessage("");
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/analyze`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (data?.autoRejected) {
        const detail =
          typeof data.rejectionReason === "string"
            ? data.rejectionReason.replace(
                /^Laporan ditolak otomatis karena /,
                ""
              )
            : "";
        setAiMessage(
          `Laporan otomatis ditolak karena ${
            detail || "tidak memenuhi kriteria verifikasi"
          }`
        );
        router.refresh();
        return;
      }
      if (!res.ok) {
        setError(data.error || "Analisis AI gagal");
        return;
      }
      const analysis = data.analysis;
      const confidence =
        analysis?.confidence != null
          ? `${Math.round(analysis.confidence * 100)}%`
          : "-";
      setAiMessage(
        `Analisis selesai: ${analysis?.category ?? "-"} / ${
          analysis?.priority ?? "-"
        } (${confidence})${
          data.duplicate ? " · Kemungkinan duplikat terdeteksi" : ""
        }.`
      );
      router.refresh();
    } catch {
      setError("Terjadi kesalahan saat analisis AI");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="card rounded-xl border border-border shadow-sm p-5">
      <p className="text-sm font-semibold text-foreground mb-3">Aksi Admin</p>

      {error && (
        <div className="mb-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      {aiMessage && (
        <div className="mb-3 p-3 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm">
          {aiMessage}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={analyze}
          disabled={pending !== null}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition"
        >
          {pending === "analyze" ? "Menganalisis..." : "Analisis AI"}
        </button>

        {status === "DIAJUKAN" && (
          <button
            onClick={() => run("verify")}
            disabled={pending !== null}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {pending === "verify" ? "Memverifikasi..." : "Verifikasi Laporan"}
          </button>
        )}

        {status === "DIVERIFIKASI" && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={officerId}
              onChange={(e) => setOfficerId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary"
            >
              {officers.length === 0 ? (
                <option value="">Tidak ada petugas</option>
              ) : (
                officers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name || o.email}
                  </option>
                ))
              )}
            </select>
            <button
              onClick={() => run("assign", { officerId })}
              disabled={pending !== null || !officerId}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {pending === "assign" ? "Menugaskan..." : "Tugaskan Petugas"}
            </button>
          </div>
        )}

        {canAct && (
          <button
            onClick={() => setShowReject((v) => !v)}
            disabled={pending !== null}
            className="px-4 py-2 rounded-lg border border-destructive/30 text-destructive text-sm font-semibold hover:bg-destructive/10 disabled:opacity-50 transition"
          >
            Tolak
          </button>
        )}
      </div>

      {showReject && canAct && (
        <div className="mt-3 space-y-2">
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Alasan penolakan..."
            className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-destructive"
          />
          <div className="flex gap-2">
            <button
              onClick={() => run("reject", { reason })}
              disabled={pending !== null || !reason.trim()}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition"
            >
              {pending === "reject" ? "Menolak..." : "Konfirmasi Tolak"}
            </button>
            <button
              onClick={() => setShowReject(false)}
              className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-100 transition"
            >
              Batal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

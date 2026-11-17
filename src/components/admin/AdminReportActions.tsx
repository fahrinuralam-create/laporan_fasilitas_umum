"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Officer = { id: string; name: string | null; email: string | null };

type ParsedResponse = {
  data: Record<string, unknown>;
  isJson: boolean;
};

async function parseResponse(res: Response): Promise<ParsedResponse> {
  const text = await res.text().catch(() => "");
  if (!text) return { data: {}, isJson: false };
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { data: parsed as Record<string, unknown>, isJson: true };
    }
    return { data: {}, isJson: true };
  } catch {
    return { data: {}, isJson: false };
  }
}

function errorMessage(
  res: Response,
  { data, isJson }: ParsedResponse,
  fallback: string
): string {
  const serverError = data.error;
  if (typeof serverError === "string" && serverError.trim()) {
    return serverError;
  }
  if (!isJson || res.status === 404) {
    return `${fallback} (HTTP ${res.status}). Muat ulang halaman lalu coba lagi.`;
  }
  return `${fallback} (HTTP ${res.status}).`;
}

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
  const [notice, setNotice] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [officerId, setOfficerId] = useState(officers[0]?.id ?? "");
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");

  const run = async (action: string, payload: Record<string, unknown> = {}) => {
    if (pending !== null) return;
    setPending(action);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
        cache: "no-store",
      });
      const parsed = await parseResponse(res);
      if (!res.ok) {
        setError(errorMessage(res, parsed, "Aksi gagal"));
        return;
      }
      setShowReject(false);
      setReason("");
      setNotice(
        action === "verify"
          ? "Laporan berhasil diverifikasi."
          : action === "assign"
            ? "Laporan berhasil ditugaskan ke petugas."
            : action === "reject"
              ? "Laporan berhasil ditolak."
              : "Aksi berhasil."
      );
      router.refresh();
    } catch {
      setError(
        "Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi."
      );
    } finally {
      setPending(null);
    }
  };

  const canAct = status === "DIAJUKAN" || status === "DIVERIFIKASI";

  const analyze = async () => {
    if (pending !== null) return;
    setPending("analyze");
    setError("");
    setAiMessage("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/analyze`, {
        method: "POST",
        cache: "no-store",
      });
      const parsed = await parseResponse(res);
      const data = parsed.data;

      if (data.autoRejected === true) {
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
        setError(errorMessage(res, parsed, "Analisis AI gagal"));
        return;
      }

      if (data.skipped === true || data.ok === false) {
        setError(
          typeof data.error === "string" && data.error.trim()
            ? data.error
            : "Analisis AI tidak dapat dijalankan. Periksa Konfigurasi AI."
        );
        return;
      }

      const analysis =
        data.analysis && typeof data.analysis === "object"
          ? (data.analysis as Record<string, unknown>)
          : null;
      const confidence =
        typeof analysis?.confidence === "number"
          ? `${Math.round(analysis.confidence * 100)}%`
          : "-";
      setAiMessage(
        `Analisis selesai: ${String(analysis?.category ?? "-")} / ${String(
          analysis?.priority ?? "-"
        )} (${confidence})${
          data.duplicate ? " · Kemungkinan duplikat terdeteksi" : ""
        }.`
      );
      router.refresh();
    } catch {
      setError(
        "Terjadi kesalahan saat analisis AI. Periksa koneksi lalu coba lagi."
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="card rounded-xl border border-border shadow-sm p-5">
      <p className="text-sm font-semibold text-foreground mb-3">Aksi Admin</p>

      {error && (
        <div
          role="alert"
          className="mb-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm"
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="mb-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm"
        >
          {notice}
        </div>
      )}

      {aiMessage && (
        <div
          role="status"
          className="mb-3 p-3 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm"
        >
          {aiMessage}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={analyze}
          disabled={pending !== null}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition"
        >
          {pending === "analyze" ? "Menganalisis..." : "Analisis AI"}
        </button>

        {status === "DIAJUKAN" && (
          <button
            type="button"
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
              type="button"
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
            type="button"
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
              type="button"
              onClick={() => run("reject", { reason })}
              disabled={pending !== null || !reason.trim()}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition"
            >
              {pending === "reject" ? "Menolak..." : "Konfirmasi Tolak"}
            </button>
            <button
              type="button"
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

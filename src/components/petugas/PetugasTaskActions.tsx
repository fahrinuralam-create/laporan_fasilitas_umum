"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { compressImage } from "@/lib/image";

export default function PetugasTaskActions({
  reportId,
  status,
}: {
  reportId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [afterImage, setAfterImage] = useState<string | null>(null);

  if (status !== "DITUGASKAN" && status !== "DIPROSES") {
    return null;
  }

  const run = async (action: string) => {
    setPending(action);
    setError("");
    try {
      const res = await fetch(`/api/petugas/tasks/${reportId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes, afterImageDataUrl: afterImage }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Aksi gagal");
        setPending(null);
        return;
      }
      setNotes("");
      setAfterImage(null);
      router.refresh();
    } catch {
      setError("Terjadi kesalahan");
    } finally {
      setPending(null);
    }
  };

  const handleImage = async (file: File | undefined) => {
    if (!file) {
      setAfterImage(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("File harus berupa gambar");
      return;
    }
    try {
      const compressed = await compressImage(file);
      setAfterImage(compressed);
      setError("");
    } catch {
      setError("Gagal memproses gambar");
    }
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <p className="text-sm font-semibold text-zinc-700 mb-3">Aksi Petugas</p>

      {error && (
        <div className="mb-3 p-2 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Catatan (opsional)
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              status === "DITUGASKAN"
                ? "Catatan saat mulai mengerjakan..."
                : "Catatan penyelesaian pekerjaan..."
            }
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {status === "DIPROSES" && (
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Foto Setelah Perbaikan (opsional)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleImage(e.target.files?.[0])}
              className="block w-full text-sm text-zinc-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-medium hover:file:bg-blue-100"
            />
            {afterImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={afterImage}
                alt="Pratinjau"
                className="mt-3 h-32 w-auto rounded-lg border border-zinc-200 object-cover"
              />
            )}
          </div>
        )}

        {status === "DITUGASKAN" ? (
          <button
            onClick={() => run("start")}
            disabled={pending !== null}
            className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition"
          >
            {pending === "start" ? "Memproses..." : "Mulai Proses"}
          </button>
        ) : (
          <button
            onClick={() => run("complete")}
            disabled={pending !== null}
            className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition"
          >
            {pending === "complete" ? "Menyelesaikan..." : "Selesaikan Tugas"}
          </button>
        )}
      </div>
    </div>
  );
}

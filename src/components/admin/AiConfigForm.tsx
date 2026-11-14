"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProviderPreset } from "@/lib/ai-provider-presets";

type TargetView = {
  provider: string;
  baseUrl: string;
  model: string;
  hasKey: boolean;
  keySource: string;
  maskedKey: string | null;
};

type View = {
  text: TargetView;
  updatedAt: string | null;
  updatedByEmail: string | null;
  envHasKey: boolean;
};

export default function AiConfigForm({
  initial,
  presets,
}: {
  initial: View;
  presets: ProviderPreset[];
}) {
  const router = useRouter();

  const [textProvider, setTextProvider] = useState(initial.text.provider);
  const [textBaseUrl, setTextBaseUrl] = useState(initial.text.baseUrl);
  const [textModel, setTextModel] = useState(initial.text.model);
  const [textKey, setTextKey] = useState("");
  const [clearTextKey, setClearTextKey] = useState(false);
  const [textModels, setTextModels] = useState<string[]>(
    presets.find((p) => p.id === initial.text.provider)?.textModels ?? []
  );

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [loadingModels, setLoadingModels] = useState<boolean>(false);
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const applyTextPreset = (id: string) => {
    setTextProvider(id);
    const preset = presets.find((p) => p.id === id);
    if (preset?.baseUrl) setTextBaseUrl(preset.baseUrl);
    setTextModel(preset?.textModels[0] ?? "");
    setTextModels(preset?.textModels ?? []);
  };

  // Pastikan model yang sudah tersimpan tetap bisa ditampilkan sebagai nilai
  // terpilih, meskipun tidak ada di daftar preset provider saat ini.
  const modelOptions =
    textModel && !textModels.includes(textModel)
      ? [textModel, ...textModels]
      : textModels;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/ai-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          textProvider,
          textBaseUrl,
          textModel,
          textApiKey: textKey || undefined,
          clearTextKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "err", text: data.error || "Gagal menyimpan" });
        return;
      }
      setTextKey("");
      setClearTextKey(false);
      setMessage({ type: "ok", text: "Konfigurasi berhasil disimpan." });
      router.refresh();
    } catch {
      setMessage({ type: "err", text: "Terjadi kesalahan saat menyimpan" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/ai-config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: textBaseUrl,
          apiKey: textKey || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({
          type: "ok",
          text: `Koneksi teks berhasil (HTTP ${data.status}${
            data.count != null ? `, ${data.count} model` : ""
          }).`,
        });
      } else {
        setMessage({
          type: "err",
          text: `Koneksi teks gagal: ${data.error || "tidak diketahui"}`,
        });
      }
    } catch {
      setMessage({ type: "err", text: "Gagal menguji koneksi" });
    } finally {
      setTesting(false);
    }
  };

  const handleLoadModels = async () => {
    setLoadingModels(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/ai-config/models?target=text`);
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "err", text: data.error || "Gagal memuat model" });
        return;
      }
      setTextModels(data.models ?? []);
      setMessage({
        type: "ok",
        text: `${(data.models ?? []).length} model dimuat.`,
      });
    } catch {
      setMessage({ type: "err", text: "Gagal memuat daftar model" });
    } finally {
      setLoadingModels(false);
    }
  };

  const sourceBadge = (source: string) => {
    const map: Record<string, string> = {
      db: "bg-green-100 text-green-700 border-green-200",
      env: "bg-amber-100 text-amber-700 border-amber-200",
      none: "bg-red-100 text-red-700 border-red-200",
    };
    const label =
      source === "db"
        ? "Database"
        : source === "env"
          ? "Environment"
          : "Belum ada";
    return (
      <span
        className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
          map[source] ?? map.none
        }`}
      >
        {label}
      </span>
    );
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
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

      {/* Text model */}
      <section className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">Model Teks</h2>
            <p className="text-sm text-zinc-500">
              Digunakan untuk analisis teks laporan dan penilaian foto.
            </p>
          </div>
          {sourceBadge(initial.text.keySource)}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Provider
            </label>
            <select
              value={textProvider}
              onChange={(e) => applyTextPreset(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Base URL
            </label>
            <input
              type="text"
              value={textBaseUrl}
              onChange={(e) => setTextBaseUrl(e.target.value)}
              placeholder="https://integrate.api.nvidia.com/v1"
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Model
            </label>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <select
                  value={textModel}
                  onChange={(e) => setTextModel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {modelOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => handleLoadModels()}
                disabled={loadingModels}
                className="px-3 py-2 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {loadingModels ? "..." : "Muat"}
              </button>
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              API Key
            </label>
            <input
              type="password"
              value={textKey}
              onChange={(e) => setTextKey(e.target.value)}
              placeholder={
                initial.text.hasKey
                  ? `Tersimpan: ${initial.text.maskedKey} (kosongkan bila tidak diubah)`
                  : "Belum ada API key"
              }
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex items-center justify-between mt-2">
              <label className="flex items-center gap-2 text-sm text-zinc-600">
                <input
                  type="checkbox"
                  checked={clearTextKey}
                  onChange={(e) => setClearTextKey(e.target.checked)}
                />
                Hapus API key tersimpan
              </label>
              <button
                type="button"
                onClick={() => handleTest()}
                disabled={testing}
                className="text-sm font-medium text-blue-600 hover:text-blue-500 disabled:opacity-50"
              >
                {testing ? "Menguji..." : "Uji Koneksi Teks"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">
          API key disimpan terenkripsi (AES-256-GCM) dan tidak pernah
          ditampilkan kembali.
          {initial.updatedAt
            ? ` Terakhir diubah ${new Date(
                initial.updatedAt
              ).toLocaleString("id-ID")}.`
            : ""}
        </p>
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {saving ? "Menyimpan..." : "Simpan Konfigurasi"}
        </button>
      </div>
    </form>
  );
}

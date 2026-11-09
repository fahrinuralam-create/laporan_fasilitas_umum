"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { REPORT_CATEGORIES, REPORT_PRIORITIES } from "@/lib/report-utils";
import { compressImage } from "@/lib/image";

export default function BuatLaporanPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("JALAN");
  const [priority, setPriority] = useState("SEDANG");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleImage = async (file: File | undefined) => {
    if (!file) {
      setImageDataUrl(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("File harus berupa gambar");
      return;
    }
    try {
      const compressed = await compressImage(file);
      setImageDataUrl(compressed);
      setError("");
    } catch {
      setError("Gagal memproses gambar");
    }
  };

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      setError("Browser tidak mendukung geolokasi");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setError("Gagal mengambil lokasi. Isi koordinat secara manual.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          category,
          priority,
          address,
          latitude,
          longitude,
          imageDataUrl,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Gagal membuat laporan");
        setLoading(false);
        return;
      }

      router.push(`/masyarakat/laporan/${data.id}`);
      router.refresh();
    } catch {
      setError("Terjadi kesalahan saat mengirim laporan");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          href="/masyarakat/laporan"
          className="text-sm font-medium text-blue-600 hover:text-blue-500"
        >
          &larr; Kembali ke daftar laporan
        </Link>
        <h1 className="text-2xl font-bold text-zinc-900 mt-2">
          Buat Laporan Fasilitas
        </h1>
        <p className="text-zinc-600">
          Lengkapi data laporan kerusakan fasilitas publik di sekitar Anda.
        </p>
      </div>

      {error && (
        <div className="mb-5 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6 space-y-5"
      >
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Judul Laporan <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            maxLength={190}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Contoh: Lampu jalan mati di pertigaan"
            className="w-full px-4 py-2 rounded-lg border border-zinc-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Deskripsi <span className="text-red-500">*</span>
          </label>
          <textarea
            required
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Jelaskan kondisi kerusakan secara detail..."
            className="w-full px-4 py-2 rounded-lg border border-zinc-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition resize-y"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Kategori <span className="text-red-500">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-zinc-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
            >
              {REPORT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Prioritas <span className="text-red-500">*</span>
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-zinc-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
            >
              {REPORT_PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Alamat / Lokasi
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Contoh: Jl. Perjuangan, dekat pasar"
            className="w-full px-4 py-2 rounded-lg border border-zinc-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-zinc-700">
              Koordinat
            </label>
            <button
              type="button"
              onClick={handleUseLocation}
              disabled={locating}
              className="text-sm font-medium text-blue-600 hover:text-blue-500 disabled:opacity-50"
            >
              {locating ? "Mengambil lokasi..." : "Gunakan lokasi saat ini"}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              type="text"
              inputMode="decimal"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="Latitude (mis. -6.756)"
              className="w-full px-4 py-2 rounded-lg border border-zinc-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
            <input
              type="text"
              inputMode="decimal"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="Longitude (mis. 108.593)"
              className="w-full px-4 py-2 rounded-lg border border-zinc-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">
            Foto Kondisi (opsional)
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleImage(e.target.files?.[0])}
            className="block w-full text-sm text-zinc-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-medium hover:file:bg-blue-100"
          />
          {imageDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageDataUrl}
              alt="Pratinjau"
              className="mt-3 h-40 w-auto rounded-lg border border-zinc-200 object-cover"
            />
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link
            href="/masyarakat/laporan"
            className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 font-medium hover:bg-zinc-50 transition"
          >
            Batal
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {loading ? "Mengirim..." : "Kirim Laporan"}
          </button>
        </div>
      </form>
    </div>
  );
}

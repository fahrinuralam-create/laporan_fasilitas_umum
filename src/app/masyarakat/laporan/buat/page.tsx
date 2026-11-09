"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { REPORT_CATEGORIES } from "@/lib/report-utils";
import { compressImage } from "@/lib/image";

export default function BuatLaporanPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("JALAN");
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
          className="text-sm font-medium text-primary hover:text-primary/90"
        >
          &larr; Kembali ke daftar laporan
        </Link>
        <h1 className="text-2xl font-bold text-foreground mt-2">
          Buat Laporan Fasilitas
        </h1>
        <p className="text-muted-foreground">
          Lengkapi data laporan kerusakan fasilitas publik di sekitar Anda.
        </p>
      </div>

      {error && (
        <div className="mb-5 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="card rounded-2xl shadow-sm border border-border p-6 sm:p-8 space-y-6"
      >
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Judul Laporan <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            required
            maxLength={190}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Contoh: Lampu jalan mati di pertigaan"
            className="w-full px-4 py-3 rounded-xl border border-input bg-background focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all disabled:opacity-70"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Deskripsi <span className="text-destructive">*</span>
          </label>
          <textarea
            required
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Jelaskan kondisi kerusakan secara detail..."
            className="w-full px-4 py-3 rounded-xl border border-input bg-background focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all disabled:opacity-70 resize-y"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Kategori <span className="text-destructive">*</span>
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-input bg-background focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all disabled:opacity-70"
          >
            {REPORT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-muted-foreground">
            Prioritas (Rendah/Sedang/Tinggi/Darurat) ditentukan otomatis oleh
            sistem berdasarkan kategori dan isi laporan.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Alamat / Lokasi
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Contoh: Jl. Perjuangan, dekat pasar"
            className="w-full px-4 py-3 rounded-xl border border-input bg-background focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all disabled:opacity-70"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-foreground">
              Koordinat
            </label>
            <button
              type="button"
              onClick={handleUseLocation}
              disabled={locating}
              className="text-sm font-medium text-primary hover:text-primary/90 disabled:opacity-50"
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
              className="w-full px-4 py-3 rounded-xl border border-input bg-background focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all disabled:opacity-70"
            />
            <input
              type="text"
              inputMode="decimal"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="Longitude (mis. 108.593)"
              className="w-full px-4 py-3 rounded-xl border border-input bg-background focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all disabled:opacity-70"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Foto Kondisi (opsional)
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleImage(e.target.files?.[0])}
            className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-primary file:text-white file:font-medium hover:file:bg-blue-700 transition-all"
          />
          {imageDataUrl && (
            <img
              src={imageDataUrl}
              alt="Pratinjau"
              className="mt-3 h-48 w-auto rounded-xl border border-border object-cover shadow-sm"
            />
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link
            href="/masyarakat/laporan"
            className="px-5 py-3 rounded-xl border border-input bg-background text-foreground font-medium hover:bg-accent transition-all disabled:opacity-70"
          >
            Batal
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-3 rounded-xl bg-primary text-white font-semibold shadow-lg hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            {loading ? "Mengirim..." : "Kirim Laporan"}
          </button>
        </div>
      </form>
    </div>
  );
}

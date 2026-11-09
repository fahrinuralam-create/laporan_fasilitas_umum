"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createUser } from "@/app/actions/auth";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("Password dan konfirmasi password tidak cocok");
      return;
    }

    setLoading(true);

    try {
      const result = await createUser({ name, email, password });

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      setSuccess("Akun berhasil dibuat. Silakan masuk.");
      router.push("/login");
    } catch (err) {
      setError("Terjadi kesalahan saat pendaftaran");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="w-full max-w-md px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-xl shadow-sm border border-zinc-200 p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-zinc-900">Daftar</h1>
            <p className="text-zinc-600 mt-2">
              Buat akun baru untuk pelaporan fasilitas
            </p>
          </div>

          {error && (
            <div className="mb-6 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-6 p-3 rounded-md bg-green-50 border border-green-200 text-green-700 text-sm">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Nama Lengkap
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-zinc-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-zinc-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-zinc-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Konfirmasi Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-zinc-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50 transition hover:bg-blue-700"
            >
              {loading ? "Memproses..." : "Daftar"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-600">
            Sudah punya akun?{" "}
            <Link
              href="/login"
              className="font-medium text-blue-600 hover:text-blue-500"
            >
              Masuk
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

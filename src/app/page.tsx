import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="max-w-md px-6 text-center">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900">Pelaporan Fasilitas</h1>
          <p className="text-zinc-600 mt-2">
            Sistem pelaporan fasilitas publik untuk masyarakat
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/login"
            className="block w-full px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
          >
            Masuk
          </Link>
          <Link
            href="/register"
            className="block w-full px-6 py-3 rounded-xl border border-zinc-300 text-zinc-700 font-semibold hover:bg-zinc-100 transition"
          >
            Daftar
          </Link>
        </div>
      </div>
    </div>
  );
}

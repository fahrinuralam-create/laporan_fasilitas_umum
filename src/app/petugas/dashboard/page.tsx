"use client";

import { useSession } from "next-auth/react";

export default function PetugasDashboard() {
  const { data: session } = useSession();

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900">Dashboard Petugas</h1>
          <p className="text-zinc-600">
            Selamat datang, {session?.user?.name || "Petugas"}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {["Tugas Aktif", "Diproses", "Selesai"].map((label) => (
            <div
              key={label}
              className="bg-white p-6 rounded-xl shadow-sm border border-zinc-200"
            >
              <h3 className="text-sm font-medium text-zinc-500 mb-2">{label}</h3>
              <p className="text-3xl font-bold text-zinc-900">-</p>
            </div>
          ))}
        </div>

        <div className="mt-8 bg-white rounded-xl shadow-sm border border-zinc-200 p-6">
          <h2 className="text-xl font-bold text-zinc-900 mb-4">Tugas Terbaru</h2>
          <p className="text-zinc-500">Data akan ditampilkan pada fase berikutnya.</p>
        </div>
      </div>
    </div>
  );
}

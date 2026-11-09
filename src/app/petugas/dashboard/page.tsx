import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  categoryLabel,
  formatDateTime,
  priorityColor,
  priorityLabel,
  statusColor,
  statusLabel,
} from "@/lib/report-utils";

export const dynamic = "force-dynamic";

export default async function PetugasDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "PETUGAS") redirect("/unauthorized");

  const reports = await prisma.report.findMany({
    where: { assignedOfficerId: user.id },
    orderBy: { updatedAt: "desc" },
  });

  const ditugaskan = reports.filter((r) => r.status === "DITUGASKAN").length;
  const diproses = reports.filter((r) => r.status === "DIPROSES").length;
  const selesai = reports.filter((r) => r.status === "SELESAI").length;
  const recent = reports.slice(0, 6);

  const stats = [
    { label: "Total Tugas", value: reports.length, color: "text-zinc-900" },
    { label: "Ditugaskan", value: ditugaskan, color: "text-indigo-600" },
    { label: "Diproses", value: diproses, color: "text-amber-600" },
    { label: "Selesai", value: selesai, color: "text-green-600" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">
            Dashboard Petugas
          </h1>
          <p className="text-zinc-600">
            Selamat datang, {user.name || user.email}
          </p>
        </div>
        <Link
          href="/petugas/tugas"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
        >
          Tugas Saya
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-white p-5 rounded-xl shadow-sm border border-zinc-200"
          >
            <h3 className="text-sm font-medium text-zinc-500 mb-2">
              {s.label}
            </h3>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
          <h2 className="text-lg font-bold text-zinc-900">Tugas Terbaru</h2>
          <Link
            href="/petugas/tugas"
            className="text-sm font-medium text-blue-600 hover:text-blue-500"
          >
            Lihat semua
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="p-8 text-center text-zinc-500">
            Belum ada tugas untuk Anda.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {recent.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/petugas/tugas/${r.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-zinc-50 transition"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-zinc-900 truncate">
                      {r.title}
                    </p>
                    <p className="text-sm text-zinc-500">
                      {r.reportNumber} · {categoryLabel(r.category)} ·{" "}
                      {formatDateTime(r.updatedAt)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border ${priorityColor(
                      r.priority
                    )}`}
                  >
                    {priorityLabel(r.priority)}
                  </span>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor(
                      r.status
                    )}`}
                  >
                    {statusLabel(r.status)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

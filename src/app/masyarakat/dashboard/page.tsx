import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  categoryLabel,
  formatDateTime,
  statusColor,
  statusLabel,
} from "@/lib/report-utils";

export const dynamic = "force-dynamic";

export default async function MasyarakatDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const reports = await prisma.report.findMany({
    where: { reporterId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      reportimage: {
        where: { type: "BEFORE" },
        take: 1,
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const total = reports.length;
  const diProses = reports.filter((r) =>
    ["DIVERIFIKASI", "DITUGASKAN", "DIPROSES"].includes(r.status)
  ).length;
  const selesai = reports.filter((r) => r.status === "SELESAI").length;
  const ditolak = reports.filter((r) => r.status === "DITOLAK").length;
  const recent = reports.slice(0, 5);

  const stats = [
    { label: "Total Laporan", value: total, color: "text-zinc-900" },
    { label: "Diproses", value: diProses, color: "text-amber-600" },
    { label: "Selesai", value: selesai, color: "text-green-600" },
    { label: "Ditolak", value: ditolak, color: "text-red-600" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">
            Dashboard Masyarakat
          </h1>
          <p className="text-zinc-600">
            Selamat datang, {user.name || user.email}
          </p>
        </div>
        <Link
          href="/masyarakat/laporan/buat"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
        >
          + Buat Laporan
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
          <h2 className="text-lg font-bold text-zinc-900">Laporan Terkini</h2>
          <Link
            href="/masyarakat/laporan"
            className="text-sm font-medium text-blue-600 hover:text-blue-500"
          >
            Lihat semua
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-zinc-500">Belum ada laporan.</p>
            <Link
              href="/masyarakat/laporan/buat"
              className="mt-3 inline-block text-sm font-medium text-blue-600 hover:text-blue-500"
            >
              Buat laporan pertama Anda
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {recent.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/masyarakat/laporan/${r.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-zinc-50 transition"
                >
                  <div className="h-12 w-12 rounded-lg bg-zinc-100 overflow-hidden shrink-0">
                    {r.reportimage[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.reportimage[0].imageUrl}
                        alt={r.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-zinc-400 text-xs">
                        N/A
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-zinc-900 truncate">
                      {r.title}
                    </p>
                    <p className="text-sm text-zinc-500">
                      {r.reportNumber} · {categoryLabel(r.category)} ·{" "}
                      {formatDateTime(r.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium border ${statusColor(
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

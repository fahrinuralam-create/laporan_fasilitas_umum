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

export default async function AdminDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/unauthorized");

  const grouped = await prisma.report.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.status] = g._count._all;

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const menunggu = counts.DIAJUKAN ?? 0;
  const diproses =
    (counts.DIVERIFIKASI ?? 0) +
    (counts.DITUGASKAN ?? 0) +
    (counts.DIPROSES ?? 0);
  const selesai = counts.SELESAI ?? 0;
  const ditolak = counts.DITOLAK ?? 0;

  const [recent, petugasCount] = await Promise.all([
    prisma.report.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        reporter: { select: { name: true, email: true } },
        assignedOfficer: { select: { name: true } },
      },
    }),
    prisma.user.count({ where: { role: "PETUGAS" } }),
  ]);

  const stats = [
    { label: "Total Laporan", value: total, color: "text-zinc-900" },
    { label: "Menunggu Verifikasi", value: menunggu, color: "text-blue-600" },
    { label: "Diproses", value: diproses, color: "text-amber-600" },
    { label: "Selesai", value: selesai, color: "text-green-600" },
    { label: "Ditolak", value: ditolak, color: "text-red-600" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">Dashboard Admin</h1>
          <p className="text-zinc-600">
            Selamat datang, {user.name || user.email} · {petugasCount} petugas
            terdaftar
          </p>
        </div>
        <Link
          href="/admin/laporan"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
        >
          Kelola Laporan
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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
          <h2 className="text-lg font-bold text-zinc-900">Laporan Terbaru</h2>
          <Link
            href="/admin/laporan"
            className="text-sm font-medium text-blue-600 hover:text-blue-500"
          >
            Lihat semua
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="p-8 text-center text-zinc-500">Belum ada laporan.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="text-left font-medium px-6 py-3">Laporan</th>
                  <th className="text-left font-medium px-6 py-3">Pelapor</th>
                  <th className="text-left font-medium px-6 py-3">Petugas</th>
                  <th className="text-left font-medium px-6 py-3">Status</th>
                  <th className="text-left font-medium px-6 py-3">Tanggal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {recent.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-50">
                    <td className="px-6 py-3">
                      <Link
                        href={`/admin/laporan/${r.id}`}
                        className="font-medium text-zinc-900 hover:text-blue-600"
                      >
                        {r.title}
                      </Link>
                      <p className="text-xs text-zinc-400">
                        {r.reportNumber} · {categoryLabel(r.category)}
                      </p>
                    </td>
                    <td className="px-6 py-3 text-zinc-600">
                      {r.reporter.name || r.reporter.email || "-"}
                    </td>
                    <td className="px-6 py-3 text-zinc-600">
                      {r.assignedOfficer?.name || "-"}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor(
                          r.status
                        )}`}
                      >
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-zinc-500">
                      {formatDateTime(r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

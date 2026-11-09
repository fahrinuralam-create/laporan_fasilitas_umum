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

const STAT_COLORS: Record<string, string> = {
  DIAJUKAN: "bg-blue-50 text-blue-700 border-blue-200",
  DIVERIFIKASI: "bg-indigo-50 text-indigo-700 border-indigo-200",
  DITUGASKAN: "bg-purple-50 text-purple-700 border-purple-200",
  DIPROSES: "bg-amber-50 text-amber-700 border-amber-200",
  SELESAI: "bg-green-50 text-green-700 border-green-200",
  DITOLAK: "bg-red-50 text-red-700 border-red-200",
};

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
    { label: "Total Laporan", value: total, icon: "📄", color: "text-primary-foreground" },
    { label: "Menunggu Verifikasi", value: menunggu, icon: "⏳", color: "text-primary" },
    { label: "Diproses", value: diproses, icon: "⚙️", color: "text-amber-600" },
    { label: "Selesai", value: selesai, icon: "✅", color: "text-green-600" },
    { label: "Ditolak", value: ditolak, icon: "❌", color: "text-red-600" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard Admin</h1>
          <p className="text-muted-foreground">
            Selamat datang, {user.name || user.email} &middot; {petugasCount} petugas
            terdaftar
          </p>
        </div>
        <Link
          href="/admin/laporan"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white font-semibold shadow-lg hover:bg-blue-700 transition-all active:scale-95"
        >
          Kelola Laporan
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className="card p-5 rounded-xl shadow-sm border border-border hover:shadow-md transition-all"
          >
            <h3 className="text-sm font-medium text-muted-foreground mb-1">
              {s.label}
            </h3>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <span className={`text-xs uppercase tracking-wider font-semibold opacity-50 ${s.color}`}>
              {s.icon}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-8 card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold text-foreground">Laporan Terbaru</h2>
          <Link
            href="/admin/laporan"
            className="text-sm font-medium text-primary hover:text-primary/90"
          >
            Lihat semua
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="p-8 text-center text-muted-foreground">Belum ada laporan.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="text-left font-medium px-6 py-3">Laporan</th>
                  <th className="text-left font-medium px-6 py-3">Pelapor</th>
                  <th className="text-left font-medium px-6 py-3">Petugas</th>
                  <th className="text-left font-medium px-6 py-3">Status</th>
                  <th className="text-left font-medium px-6 py-3">Tanggal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recent.map((r) => (
                  <tr key={r.id} className="hover:bg-accent/50 transition-all">
                    <td className="px-6 py-3">
                      <Link
                        href={`/admin/laporan/${r.id}`}
                        className="font-medium text-foreground hover:text-primary transition-colors"
                      >
                        {r.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {r.reportNumber} &middot; {categoryLabel(r.category)}
                      </p>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {r.reporter.name || r.reporter.email || "-"}
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {r.assignedOfficer?.name || "-"}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STAT_COLORS[r.status] || "bg-zinc-100 text-zinc-600 border-zinc-200"}`}
                      >
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">
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

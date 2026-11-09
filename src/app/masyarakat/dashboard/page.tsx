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
    { label: "Total Laporan", value: total, icon: "📄", color: "bg-primary text-white" },
    { label: "Diproses", value: diProses, icon: "⚙️", color: "bg-amber-500 text-white" },
    { label: "Selesai", value: selesai, icon: "✅", color: "bg-green-500 text-white" },
    { label: "Ditolak", value: ditolak, icon: "❌", color: "bg-red-500 text-white" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard Masyarakat</h1>
          <p className="text-muted-foreground">
            Selamat datang, {user.name || user.email}
          </p>
        </div>
        <Link
          href="/masyarakat/laporan/buat"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white font-semibold shadow-lg hover:bg-blue-700 transition-all active:scale-95"
        >
          <span>+</span> Buat Laporan
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className="card p-5 rounded-xl shadow-sm border border-border hover:shadow-md transition-all"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  {s.label}
                </h3>
                <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              </div>
              <div className={`p-2 rounded-lg ${s.color === "bg-primary text-white" ? "bg-blue-100 text-blue-600" : s.color === "bg-amber-500 text-white" ? "bg-amber-100 text-amber-600" : s.color === "bg-green-500 text-white" ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>
                {s.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold text-foreground">Laporan Terkini</h2>
          <Link
            href="/masyarakat/laporan"
            className="text-sm font-medium text-primary hover:text-primary/90"
          >
            Lihat semua
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto mb-3 opacity-50">📭</div>
            <p className="text-muted-foreground">Belum ada laporan.</p>
            <Link
              href="/masyarakat/laporan/buat"
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/90"
            >
              Buat laporan pertama Anda
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/masyarakat/laporan/${r.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-accent transition-all"
                >
                  <div className="h-12 w-12 rounded-xl bg-secondary overflow-hidden shrink-0 flex items-center justify-center">
                    {r.reportimage[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.reportimage[0].imageUrl}
                        alt={r.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-muted-foreground text-xs">N/A</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">
                      {r.title}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {r.reportNumber} &middot; {categoryLabel(r.category)} &middot;{" "}
                      {formatDateTime(r.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium border ${STAT_COLORS[r.status] || "bg-zinc-100 text-zinc-600 border-zinc-200"}`}
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

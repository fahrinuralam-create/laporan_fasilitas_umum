import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  categoryLabel,
  formatDateTime,
  priorityColor,
  priorityLabel,
  REPORT_CATEGORIES,
  REPORT_STATUSES,
  statusColor,
  statusLabel,
} from "@/lib/report-utils";

export const dynamic = "force-dynamic";

export default async function AdminLaporanPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string; q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/unauthorized");

  const { status, category, q } = await searchParams;
  const keyword = (q ?? "").trim();

  const where: Prisma.reportWhereInput = {};
  if (status) where.status = status as never;
  if (category) where.category = category as never;
  if (keyword) {
    where.OR = [
      { title: { contains: keyword } },
      { reportNumber: { contains: keyword } },
      { address: { contains: keyword } },
    ];
  }

  const reports = await prisma.report.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      reporter: { select: { name: true, email: true } },
      assignedOfficer: { select: { name: true } },
    },
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Kelola Laporan</h1>
        <p className="text-zinc-600">
          Verifikasi, tugaskan, atau tolak laporan masyarakat
        </p>
      </div>

      <form
        method="get"
        className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4 mb-6 flex flex-col sm:flex-row gap-3"
      >
        <input
          type="text"
          name="q"
          defaultValue={keyword}
          placeholder="Cari judul, nomor laporan, atau alamat..."
          className="flex-1 px-4 py-2 rounded-lg border border-zinc-300 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="px-3 py-2 rounded-lg border border-zinc-300 bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Semua status</option>
          {REPORT_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          name="category"
          defaultValue={category ?? ""}
          className="px-3 py-2 rounded-lg border border-zinc-300 bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Semua kategori</option>
          {REPORT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition"
        >
          Cari
        </button>
      </form>

      <p className="text-sm text-zinc-500 mb-3">
        Menampilkan {reports.length} laporan
      </p>

      {reports.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-10 text-center">
          <p className="text-zinc-500">Tidak ada laporan yang cocok.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Laporan</th>
                  <th className="text-left font-medium px-4 py-3">Pelapor</th>
                  <th className="text-left font-medium px-4 py-3">Prioritas</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="text-left font-medium px-4 py-3">Tanggal</th>
                  <th className="text-right font-medium px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {reports.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-900">{r.title}</p>
                      <p className="text-xs text-zinc-400">
                        {r.reportNumber} · {categoryLabel(r.category)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {r.reporter.name || r.reporter.email || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border ${priorityColor(
                          r.priority
                        )}`}
                      >
                        {priorityLabel(r.priority)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor(
                          r.status
                        )}`}
                      >
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {formatDateTime(r.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/laporan/${r.id}`}
                        className="font-medium text-blue-600 hover:text-blue-500"
                      >
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

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

const FILTERS = [
  { value: "", label: "Semua" },
  { value: "DIAJUKAN", label: "Diajukan" },
  { value: "DIPROSES", label: "Diproses" },
  { value: "SELESAI", label: "Selesai" },
  { value: "DITOLAK", label: "Ditolak" },
];

export default async function LaporanListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { status } = await searchParams;
  const activeFilter = status ?? "";

  const reports = await prisma.report.findMany({
    where: {
      reporterId: user.id,
      ...(activeFilter && activeFilter !== "DIPROSES"
        ? { status: activeFilter as never }
        : activeFilter === "DIPROSES"
          ? { status: { in: ["DIVERIFIKASI", "DITUGASKAN", "DIPROSES"] } }
          : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      reportimage: {
        where: { type: "BEFORE" },
        take: 1,
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Laporan Saya</h1>
          <p className="text-zinc-600">Daftar seluruh laporan yang Anda buat</p>
        </div>
        <Link
          href="/masyarakat/laporan/buat"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
        >
          + Buat Laporan
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map((f) => {
          const active = activeFilter === f.value;
          const href = f.value
            ? `/masyarakat/laporan?status=${f.value}`
            : "/masyarakat/laporan";
          return (
            <Link
              key={f.label}
              href={href}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                active
                  ? "bg-blue-600 text-white"
                  : "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {reports.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-10 text-center">
          <p className="text-zinc-500">Tidak ada laporan untuk filter ini.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {reports.map((r) => (
            <Link
              key={r.id}
              href={`/masyarakat/laporan/${r.id}`}
              className="group bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden hover:shadow-md transition"
            >
              <div className="h-40 bg-zinc-100 overflow-hidden">
                {r.reportimage[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.reportimage[0].imageUrl}
                    alt={r.title}
                    className="h-full w-full object-cover group-hover:scale-105 transition"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-zinc-400 text-sm">
                    Tanpa gambar
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor(
                      r.status
                    )}`}
                  >
                    {statusLabel(r.status)}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium border ${priorityColor(
                      r.priority
                    )}`}
                  >
                    {priorityLabel(r.priority)}
                  </span>
                </div>
                <h3 className="font-semibold text-zinc-900 truncate">
                  {r.title}
                </h3>
                <p className="text-sm text-zinc-500 mt-1">
                  {r.reportNumber} · {categoryLabel(r.category)}
                </p>
                <p className="text-xs text-zinc-400 mt-2">
                  {formatDateTime(r.createdAt)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

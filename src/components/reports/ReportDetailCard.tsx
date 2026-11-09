import { ReactNode } from "react";
import {
  categoryLabel,
  formatDateTime,
  priorityColor,
  priorityLabel,
  statusColor,
  statusLabel,
} from "@/lib/report-utils";
import type { ReportDetail } from "@/lib/report-types";

export default function ReportDetailCard({
  report,
  children,
}: {
  report: ReportDetail;
  children?: ReactNode;
}) {
  const beforeImages = report.reportimage.filter((img) => img.type === "BEFORE");
  const afterImages = report.reportimage.filter((img) => img.type === "AFTER");
  const rejection = report.reporthistory
    .filter((h) => h.newStatus === "DITOLAK")
    .slice(-1)[0];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusColor(
              report.status
            )}`}
          >
            {statusLabel(report.status)}
          </span>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-medium border ${priorityColor(
              report.priority
            )}`}
          >
            Prioritas: {priorityLabel(report.priority)}
          </span>
          <span className="px-2.5 py-1 rounded-full text-xs font-medium border bg-zinc-100 text-zinc-700 border-zinc-200">
            {categoryLabel(report.category)}
          </span>
        </div>

        <h1 className="text-2xl font-bold text-zinc-900">{report.title}</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {report.reportNumber} · Dibuat {formatDateTime(report.createdAt)}
        </p>

        {children && <div className="mt-5">{children}</div>}

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-zinc-500">Pelapor</p>
            <p className="font-medium text-zinc-900">
              {report.reporter.name || report.reporter.email || "-"}
            </p>
            {report.reporter.phone && (
              <p className="text-zinc-500">{report.reporter.phone}</p>
            )}
          </div>
          <div>
            <p className="text-zinc-500">Petugas Ditugaskan</p>
            <p className="font-medium text-zinc-900">
              {report.assignedOfficer?.name || "Belum ditugaskan"}
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-zinc-500">Lokasi</p>
            <p className="font-medium text-zinc-900">
              {report.address || "-"}
            </p>
            {report.latitude !== null && report.longitude !== null && (
              <a
                href={`https://www.google.com/maps?q=${report.latitude},${report.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-500 text-sm"
              >
                {report.latitude}, {report.longitude} (buka peta)
              </a>
            )}
          </div>
        </div>

        <div className="mt-5">
          <p className="text-zinc-500 text-sm mb-1">Deskripsi</p>
          <p className="text-zinc-800 whitespace-pre-line">
            {report.description}
          </p>
        </div>

        {rejection && (
          <div className="mt-5 p-4 rounded-lg bg-red-50 border border-red-200">
            <p className="text-sm font-semibold text-red-700">
              Laporan Ditolak
            </p>
            <p className="text-sm text-red-700 mt-1">
              {rejection.notes || "Laporan ditolak oleh admin."}
            </p>
          </div>
        )}
      </div>

      {beforeImages.length > 0 && (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-zinc-900 mb-3">
            Foto Kondisi
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {beforeImages.map((img) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={img.id}
                src={img.imageUrl}
                alt="Foto kondisi"
                className="w-full h-56 object-cover rounded-lg border border-zinc-200"
              />
            ))}
          </div>
        </div>
      )}

      {afterImages.length > 0 && (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-zinc-900 mb-3">
            Foto Setelah Perbaikan
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {afterImages.map((img) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={img.id}
                src={img.imageUrl}
                alt="Foto setelah perbaikan"
                className="w-full h-56 object-cover rounded-lg border border-zinc-200"
              />
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
        <h2 className="text-lg font-bold text-zinc-900 mb-4">
          Riwayat Status
        </h2>
        {report.reporthistory.length === 0 ? (
          <p className="text-zinc-500">Belum ada riwayat.</p>
        ) : (
          <ol className="relative border-l border-zinc-200 ml-2 space-y-5">
            {report.reporthistory.map((h) => (
              <li key={h.id} className="ml-5">
                <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-blue-500 border-2 border-white" />
                <p className="text-sm font-medium text-zinc-900">
                  {statusLabel(h.newStatus)}
                  <span className="text-zinc-400 font-normal">
                    {" "}
                    · {formatDateTime(h.createdAt)}
                  </span>
                </p>
                {h.notes && (
                  <p className="text-sm text-zinc-600 mt-0.5">{h.notes}</p>
                )}
                <p className="text-xs text-zinc-400 mt-0.5">
                  oleh {h.user.name || h.user.role}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

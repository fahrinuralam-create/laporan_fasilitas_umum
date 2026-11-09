import { ReactNode } from "react";
import {
  categoryLabel,
  cleanHistoryNotes,
  formatDateTime,
  isSystemActorNote,
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
  const hasSystemRejection = report.reporthistory.some(
    (h) => h.newStatus === "DITOLAK" && isSystemActorNote(h.notes)
  );

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
          <span className="px-2.5 py-1 rounded-full text-xs font-medium border bg-muted text-muted-foreground border-border">
            {categoryLabel(report.category)}
          </span>
        </div>

        <h1 className="text-2xl font-bold text-foreground">{report.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {report.reportNumber} · Dibuat {formatDateTime(report.createdAt)}
        </p>

        {children && <div className="mt-5">{children}</div>}

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Pelapor</p>
            <p className="font-medium text-foreground">
              {report.reporter.name || report.reporter.email || "-"}
            </p>
            {report.reporter.phone && (
              <p className="text-muted-foreground">{report.reporter.phone}</p>
            )}
          </div>
          <div>
            <p className="text-muted-foreground">Petugas Ditugaskan</p>
            <p className="font-medium text-foreground">
              {report.assignedOfficer?.name || "Belum ditugaskan"}
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-muted-foreground">Lokasi</p>
            <p className="font-medium text-foreground">
              {report.address || "-"}
            </p>
            {report.latitude !== null && report.longitude !== null && (
              <a
                href={`https://www.google.com/maps?q=${report.latitude},${report.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/90 text-sm"
              >
                {report.latitude}, {report.longitude} (buka peta)
              </a>
            )}
          </div>
        </div>

        <div className="mt-5">
          <p className="text-muted-foreground text-sm mb-1">Deskripsi</p>
          <p className="text-foreground/90 whitespace-pre-line">
            {report.description}
          </p>
        </div>

        {rejection && (
          <div className="mt-5 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm font-semibold text-red-700">
              {isSystemActorNote(rejection.notes)
                ? "Laporan Ditolak Otomatis"
                : "Laporan Ditolak"}
            </p>
            <p className="text-sm text-red-700 mt-1">
              {cleanHistoryNotes(rejection.notes) ||
                "Laporan ditolak oleh admin."}
            </p>
          </div>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-bold text-foreground">Analisis AI</h2>
          {report.aiAnalyzedAt ? (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium border bg-indigo-100 text-indigo-700 border-indigo-200">
              Keyakinan{" "}
              {report.aiConfidence != null
                ? `${Math.round(report.aiConfidence * 100)}%`
                : "-"}
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium border bg-muted text-muted-foreground border-border">
              Belum dianalisis
            </span>
          )}
        </div>

        {!report.aiAnalyzedAt && !report.aiIsDuplicate ? (
          <p className="text-sm text-muted-foreground">
            Laporan ini belum memiliki hasil analisis AI. Admin dapat
            menjalankan analisis dari panel aksi di halaman ini.
          </p>
        ) : (
          <div className="space-y-4">
            {report.aiAnalyzedAt && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Saran Kategori</p>
                    <p className="font-medium text-foreground">
                      {report.aiCategory
                        ? categoryLabel(report.aiCategory)
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Saran Prioritas</p>
                    <p className="font-medium text-foreground">
                      {report.aiPriority
                        ? priorityLabel(report.aiPriority)
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Keyakinan</p>
                    <p className="font-medium text-foreground">
                      {report.aiConfidence != null
                        ? `${Math.round(report.aiConfidence * 100)}%`
                        : "-"}
                    </p>
                  </div>
                </div>

                {report.aiReason && (
                  <div>
                    <p className="text-muted-foreground text-sm">Alasan AI</p>
                    <p className="text-sm text-foreground/90">{report.aiReason}</p>
                  </div>
                )}
              </>
            )}

            {report.aiIsDuplicate && (
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                <p className="text-sm font-semibold text-amber-800">
                  Kemungkinan Duplikat
                </p>
                <p className="text-sm text-amber-700 mt-1">
                  {report.aiDuplicateReason ||
                    "Laporan ini mirip dengan laporan sebelumnya."}
                </p>
              </div>
            )}

            {report.aiAutoRejected && (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                <p className="text-sm font-semibold text-red-700">
                  {hasSystemRejection
                    ? "Ditolak Otomatis oleh Sistem"
                    : "Perlu Ditinjau"}
                </p>
                <p className="text-sm text-red-700 mt-1">
                  {report.aiRejectionReason ||
                    "AI menilai laporan/foto tidak relevan."}
                </p>
              </div>
            )}

            {beforeImages[0]?.aiImageAnalyzedAt && (
              <div className="p-4 rounded-lg bg-muted border border-zinc-200 text-sm">
                <p className="font-semibold text-foreground/90 mb-1">
                  Analisis Foto
                </p>
                <p className="text-zinc-700">
                  {beforeImages[0].aiPossibleDamage ||
                    beforeImages[0].aiDescription ||
                    "-"}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Tingkat kerusakan: {beforeImages[0].aiSeverity || "-"} ·
                  Relevan: {beforeImages[0].aiIsRelevant ? "Ya" : "Tidak"} ·
                  Cocok judul: {beforeImages[0].aiImageMatchTitle ? "Ya" : "Tidak"}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {beforeImages.length > 0 && (
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-foreground mb-3">
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
          <h2 className="text-lg font-bold text-foreground mb-3">
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
        <h2 className="text-lg font-bold text-foreground mb-4">
          Riwayat Status
        </h2>
        {report.reporthistory.length === 0 ? (
          <p className="text-muted-foreground">Belum ada riwayat.</p>
        ) : (
          <ol className="relative border-l border-zinc-200 ml-2 space-y-5">
            {report.reporthistory.map((h) => (
              <li key={h.id} className="ml-5">
                <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-blue-500 border-2 border-white" />
                <p className="text-sm font-medium text-foreground">
                  {statusLabel(h.newStatus)}
                  <span className="text-zinc-400 font-normal">
                    {" "}
                    · {formatDateTime(h.createdAt)}
                  </span>
                </p>
                {cleanHistoryNotes(h.notes) && (
                  <p className="text-sm text-zinc-600 mt-0.5">
                    {cleanHistoryNotes(h.notes)}
                  </p>
                )}
                <p className="text-xs text-zinc-400 mt-0.5">
                  oleh{" "}
                  {isSystemActorNote(h.notes)
                    ? "Sistem AI"
                    : h.user.name || h.user.role}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

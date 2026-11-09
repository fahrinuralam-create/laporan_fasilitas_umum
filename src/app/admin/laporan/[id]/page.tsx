import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { reportDetailInclude } from "@/lib/report-types";
import ReportDetailCard from "@/components/reports/ReportDetailCard";
import AdminReportActions from "@/components/admin/AdminReportActions";

export const dynamic = "force-dynamic";

export default async function AdminLaporanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/unauthorized");

  const { id } = await params;

  const [report, officers] = await Promise.all([
    prisma.report.findUnique({
      where: { id },
      include: reportDetailInclude,
    }),
    prisma.user.findMany({
      where: { role: "PETUGAS" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!report) notFound();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          href="/admin/laporan"
          className="text-sm font-medium text-blue-600 hover:text-blue-500"
        >
          &larr; Kembali ke kelola laporan
        </Link>
      </div>

      <ReportDetailCard report={report}>
        <AdminReportActions
          reportId={report.id}
          status={report.status}
          officers={officers}
        />
      </ReportDetailCard>
    </div>
  );
}

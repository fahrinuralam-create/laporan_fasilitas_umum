import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { reportDetailInclude } from "@/lib/report-types";
import ReportDetailCard from "@/components/reports/ReportDetailCard";
import PetugasTaskActions from "@/components/petugas/PetugasTaskActions";

export const dynamic = "force-dynamic";

export default async function PetugasTugasDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "PETUGAS") redirect("/unauthorized");

  const { id } = await params;

  const report = await prisma.report.findFirst({
    where: { id, assignedOfficerId: user.id },
    include: reportDetailInclude,
  });

  if (!report) notFound();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          href="/petugas/tugas"
          className="text-sm font-medium text-blue-600 hover:text-blue-500"
        >
          &larr; Kembali ke tugas saya
        </Link>
      </div>

      <ReportDetailCard report={report}>
        <PetugasTaskActions reportId={report.id} status={report.status} />
      </ReportDetailCard>
    </div>
  );
}

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (!auth.user) return auth.response;
  const user = auth.user;

  const { id } = await params;

  const report = await prisma.report.findUnique({
    where: { id },
    include: {
      reporter: { select: { id: true, name: true, email: true, phone: true } },
      assignedOfficer: { select: { id: true, name: true, email: true } },
      reportimage: { orderBy: { createdAt: "asc" } },
      reporthistory: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, role: true } } },
      },
    },
  });

  if (!report) {
    return NextResponse.json({ error: "Laporan tidak ditemukan" }, { status: 404 });
  }

  const isOwner = report.reporterId === user.id;
  const isAssignedOfficer = report.assignedOfficerId === user.id;
  const isAdmin = user.role === "ADMIN";

  if (!isOwner && !isAssignedOfficer && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(report);
}

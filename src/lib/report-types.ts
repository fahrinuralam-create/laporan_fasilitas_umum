import { Prisma } from "@prisma/client";

export const reportDetailInclude = {
  reporter: { select: { id: true, name: true, email: true, phone: true } },
  assignedOfficer: { select: { id: true, name: true, email: true } },
  reportimage: { orderBy: { createdAt: "asc" as const } },
  reporthistory: {
    orderBy: { createdAt: "asc" as const },
    include: { user: { select: { id: true, name: true, role: true } } },
  },
} satisfies Prisma.reportInclude;

export type ReportDetail = Prisma.reportGetPayload<{
  include: typeof reportDetailInclude;
}>;

import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getFonnteConfig } from "@/lib/fonnte";
import WhatsAppAdminPanel from "@/components/admin/WhatsAppAdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminWhatsAppPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/unauthorized");

  const [
    verifiedUsers,
    totalNotifications,
    sent,
    failed,
    pendingAdmin,
    pendingVerification,
    activeLinks,
  ] = await Promise.all([
    prisma.user.count({ where: { whatsappNumber: { not: null } } }),
    prisma.notification.count(),
    prisma.notification.count({ where: { whatsappSent: true } }),
    prisma.notification.count({
      where: { whatsappSent: false, whatsappError: { not: null } },
    }),
    prisma.whatsapplinkrequest.count({ where: { status: "PENDING_ADMIN" } }),
    prisma.whatsapplinkrequest.count({
      where: { status: "PENDING_VERIFICATION" },
    }),
    prisma.whatsapplinkrequest.count({ where: { status: "ACTIVE" } }),
  ]);

  const config = getFonnteConfig();

  const initial = {
    configured: config.configured,
    env: {
      hasToken: config.configured,
      apiUrl: config.apiUrl,
      countryCode: config.countryCode,
      timeoutMs: config.timeoutMs,
    },
    counts: {
      verifiedUsers,
      totalNotifications,
      sent,
      failed,
      pendingAdmin,
      pendingVerification,
      activeLinks,
    },
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          href="/admin/dashboard"
          className="text-sm font-medium text-blue-600 hover:text-blue-500"
        >
          &larr; Kembali ke dashboard
        </Link>
        <h1 className="text-2xl font-bold text-zinc-900 mt-2">
          Notifikasi WhatsApp
        </h1>
        <p className="text-zinc-600">
          Pantau koneksi Fonnte, status pengiriman, dan statistik notifikasi
          WhatsApp.
        </p>
        <Link
          href="/admin/whatsapp/verifikasi"
          className="inline-flex mt-3 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition"
        >
          Verifikasi Pengajuan WhatsApp
        </Link>
      </div>

      <WhatsAppAdminPanel initial={initial} />
    </div>
  );
}

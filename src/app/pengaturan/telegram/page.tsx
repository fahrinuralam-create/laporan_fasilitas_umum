import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getBotUsername, isTelegramConfigured } from "@/lib/telegram";
import TelegramLinkPanel from "@/components/telegram/TelegramLinkPanel";

export const dynamic = "force-dynamic";

function dashboardPath(role: string): string {
  if (role === "ADMIN") return "/admin/dashboard";
  if (role === "PETUGAS") return "/petugas/dashboard";
  return "/masyarakat/dashboard";
}

export default async function TelegramSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "MASYARAKAT") redirect(dashboardPath(user.role));

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      telegramChatId: true,
      telegramUsername: true,
      telegramLinkedAt: true,
      telegramEnabled: true,
    },
  });

  if (!dbUser) redirect("/login");

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          href={dashboardPath(user.role)}
          className="text-sm font-medium text-blue-600 hover:text-blue-500"
        >
          &larr; Kembali ke dashboard
        </Link>
        <h1 className="text-2xl font-bold text-zinc-900 mt-2">
          Pengaturan Telegram
        </h1>
        <p className="text-zinc-600">
          Hubungkan akun Telegram untuk menerima notifikasi laporan dan
          menggunakan bot pelaporan.
        </p>
      </div>

      <TelegramLinkPanel
        initial={{
          linked: Boolean(dbUser.telegramChatId),
          username: dbUser.telegramUsername,
          linkedAt: dbUser.telegramLinkedAt
            ? dbUser.telegramLinkedAt.toISOString()
            : null,
          enabled: dbUser.telegramEnabled,
          botConfigured: isTelegramConfigured(),
          botUsername: getBotUsername() || null,
        }}
      />

      <div className="mt-6 bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
        <h2 className="text-lg font-bold text-zinc-900 mb-2">
          Perintah Bot
        </h2>
        <ul className="text-sm text-zinc-700 space-y-1.5">
          <li>
            <code className="px-1.5 py-0.5 rounded bg-zinc-100">/status</code>{" "}
            — ringkasan akun dan laporan
          </li>
          <li>
            <code className="px-1.5 py-0.5 rounded bg-zinc-100">/laporan</code>{" "}
            — 5 laporan terbaru
          </li>
          <li>
            <code className="px-1.5 py-0.5 rounded bg-zinc-100">
              /cek REP-...
            </code>{" "}
            — cek status laporan
          </li>
          <li>
            <code className="px-1.5 py-0.5 rounded bg-zinc-100">/lapor</code> —
            buka formulir laporan baru
          </li>
          <li>
            <code className="px-1.5 py-0.5 rounded bg-zinc-100">/bantuan</code>{" "}
            — daftar perintah
          </li>
        </ul>
      </div>
    </div>
  );
}

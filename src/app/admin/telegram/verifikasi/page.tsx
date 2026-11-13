import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getTelegramVerificationData } from "@/lib/telegram-link";
import TelegramVerificationPanel from "@/components/telegram/TelegramVerificationPanel";

export const dynamic = "force-dynamic";

export default async function AdminTelegramVerificationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/unauthorized");

  const data = await getTelegramVerificationData();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          href="/admin/telegram"
          className="text-sm font-medium text-blue-600 hover:text-blue-500"
        >
          &larr; Kembali ke Bot Telegram
        </Link>
        <h1 className="text-2xl font-bold text-zinc-900 mt-2">
          Verifikasi Telegram
        </h1>
        <p className="text-zinc-600">
          Tinjau pengajuan penautan otomatis, setujui atau tolak, lalu pantau
          konfirmasi identitas Telegram pengguna.
        </p>
      </div>

      <TelegramVerificationPanel initial={data} />
    </div>
  );
}

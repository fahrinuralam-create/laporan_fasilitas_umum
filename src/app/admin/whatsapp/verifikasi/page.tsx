import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getWhatsAppVerificationData } from "@/lib/whatsapp-link";
import WhatsAppVerificationPanel from "@/components/whatsapp/WhatsAppVerificationPanel";

export const dynamic = "force-dynamic";

export default async function AdminWhatsAppVerificationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/unauthorized");

  const data = await getWhatsAppVerificationData();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          href="/admin/whatsapp"
          className="text-sm font-medium text-blue-600 hover:text-blue-500"
        >
          &larr; Kembali ke Notifikasi WhatsApp
        </Link>
        <h1 className="text-2xl font-bold text-zinc-900 mt-2">
          Verifikasi WhatsApp
        </h1>
        <p className="text-zinc-600">
          Tinjau pengajuan nomor, setujui atau tolak, lalu pantau pengiriman OTP
          dan status verifikasi pengguna.
        </p>
      </div>

      <WhatsAppVerificationPanel initial={data} />
    </div>
  );
}

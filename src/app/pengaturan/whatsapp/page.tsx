import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getWhatsAppLinkStatus } from "@/lib/whatsapp-link";
import WhatsAppLinkPanel from "@/components/whatsapp/WhatsAppLinkPanel";

export const dynamic = "force-dynamic";

function dashboardPath(role: string): string {
  if (role === "ADMIN") return "/admin/dashboard";
  if (role === "PETUGAS") return "/petugas/dashboard";
  return "/masyarakat/dashboard";
}

export default async function WhatsAppSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "MASYARAKAT") redirect(dashboardPath(user.role));

  const status = await getWhatsAppLinkStatus(user.id);
  if (!status) redirect("/login");

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
          Pengaturan WhatsApp
        </h1>
        <p className="text-zinc-600">
          Daftarkan nomor WhatsApp untuk menerima notifikasi laporan. Nomor
          harus disetujui admin dan diverifikasi dengan OTP.
        </p>
      </div>

      <WhatsAppLinkPanel initial={status} />

      <div className="mt-6 bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
        <h2 className="text-lg font-bold text-zinc-900 mb-2">
          Cara Kerja Verifikasi
        </h2>
        <ol className="text-sm text-zinc-700 space-y-1.5 list-decimal list-inside">
          <li>Ajukan nomor WhatsApp melalui formulir di atas.</li>
          <li>Tunggu persetujuan admin.</li>
          <li>
            Setelah disetujui, kode OTP dikirim ke nomor tersebut melalui
            WhatsApp.
          </li>
          <li>Masukkan kode OTP di halaman ini untuk mengaktifkan penautan.</li>
          <li>
            Jika mengganti nomor, nomor lama tetap aktif sampai nomor baru
            berhasil diverifikasi.
          </li>
        </ol>
      </div>
    </div>
  );
}

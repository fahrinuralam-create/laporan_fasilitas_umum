/**
 * Warna badge status untuk kartu statistik di dashboard.
 *
 * Sengaja terpisah dari `statusColor()` di `report-utils`: dashboard memakai
 * shade -50 sebagai latar, sedangkan badge daftar laporan memakai shade -100.
 * Nilai dan fallback di bawah dipertahankan persis seperti definisi sebelumnya
 * yang terduplikasi di dashboard admin dan masyarakat.
 */
export const DASHBOARD_STATUS_COLORS: Record<string, string> = {
  DIAJUKAN: "bg-blue-50 text-blue-700 border-blue-200",
  DIVERIFIKASI: "bg-indigo-50 text-indigo-700 border-indigo-200",
  DITUGASKAN: "bg-purple-50 text-purple-700 border-purple-200",
  DIPROSES: "bg-amber-50 text-amber-700 border-amber-200",
  SELESAI: "bg-green-50 text-green-700 border-green-200",
  DITOLAK: "bg-red-50 text-red-700 border-red-200",
};

const FALLBACK = "bg-zinc-100 text-zinc-600 border-zinc-200";

export function dashboardStatusColor(status: string): string {
  return DASHBOARD_STATUS_COLORS[status] || FALLBACK;
}

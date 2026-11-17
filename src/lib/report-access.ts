/**
 * Aturan akses baca satu laporan.
 *
 * Aturan ini sebelumnya ditulis ulang di beberapa tempat dan sempat berbeda:
 * halaman detail masyarakat mengizinkan semua PETUGAS, sedangkan
 * `GET /api/reports/[id]` hanya mengizinkan petugas yang ditugaskan. Fungsi ini
 * menyatukan aturan yang sudah berlaku di API, halaman tugas petugas, dan
 * chatbot:
 *
 * 1. pemilik laporan boleh melihat laporannya;
 * 2. PETUGAS hanya boleh melihat laporan yang ditugaskan kepadanya;
 * 3. ADMIN boleh melihat semua laporan.
 */
export type ReportAccessUser = {
  id: string;
  role: string;
};

export type ReportAccessTarget = {
  reporterId: string;
  assignedOfficerId: string | null;
};

export function canViewReport(
  user: ReportAccessUser,
  report: ReportAccessTarget
): boolean {
  if (user.role === "ADMIN") return true;
  if (report.reporterId === user.id) return true;
  return report.assignedOfficerId === user.id;
}

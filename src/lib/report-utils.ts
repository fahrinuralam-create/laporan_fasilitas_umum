export type ReportCategory =
  | "JALAN"
  | "LAMPU_JALAN"
  | "SALURAN_AIR"
  | "JEMBATAN"
  | "FASILITAS_KESEHATAN"
  | "LAINNYA";

export type ReportPriority = "RENDAH" | "SEDANG" | "TINGGI" | "DARURAT";

export type ReportStatus =
  | "DIAJUKAN"
  | "DIVERIFIKASI"
  | "DITUGASKAN"
  | "DIPROSES"
  | "SELESAI"
  | "DITOLAK";

export const REPORT_CATEGORIES: { value: ReportCategory; label: string }[] = [
  { value: "JALAN", label: "Jalan" },
  { value: "LAMPU_JALAN", label: "Lampu Jalan" },
  { value: "SALURAN_AIR", label: "Saluran Air" },
  { value: "JEMBATAN", label: "Jembatan" },
  { value: "FASILITAS_KESEHATAN", label: "Fasilitas Kesehatan" },
  { value: "LAINNYA", label: "Lainnya" },
];

export const REPORT_PRIORITIES: { value: ReportPriority; label: string }[] = [
  { value: "RENDAH", label: "Rendah" },
  { value: "SEDANG", label: "Sedang" },
  { value: "TINGGI", label: "Tinggi" },
  { value: "DARURAT", label: "Darurat" },
];

export const REPORT_STATUSES: { value: ReportStatus; label: string }[] = [
  { value: "DIAJUKAN", label: "Diajukan" },
  { value: "DIVERIFIKASI", label: "Diverifikasi" },
  { value: "DITUGASKAN", label: "Ditugaskan" },
  { value: "DIPROSES", label: "Diproses" },
  { value: "SELESAI", label: "Selesai" },
  { value: "DITOLAK", label: "Ditolak" },
];

export function categoryLabel(value: string): string {
  return REPORT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function priorityLabel(value: string): string {
  return REPORT_PRIORITIES.find((p) => p.value === value)?.label ?? value;
}

export function statusLabel(value: string): string {
  return REPORT_STATUSES.find((s) => s.value === value)?.label ?? value;
}

export function statusColor(value: string): string {
  switch (value) {
    case "DIAJUKAN":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "DIVERIFIKASI":
      return "bg-indigo-100 text-indigo-700 border-indigo-200";
    case "DITUGASKAN":
      return "bg-purple-100 text-purple-700 border-purple-200";
    case "DIPROSES":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "SELESAI":
      return "bg-green-100 text-green-700 border-green-200";
    case "DITOLAK":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-zinc-100 text-zinc-700 border-zinc-200";
  }
}

export function priorityColor(value: string): string {
  switch (value) {
    case "RENDAH":
      return "bg-green-100 text-green-700 border-green-200";
    case "SEDANG":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "TINGGI":
      return "bg-orange-100 text-orange-700 border-orange-200";
    case "DARURAT":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-zinc-100 text-zinc-700 border-zinc-200";
  }
}

const URGENT_KEYWORDS = [
  "darurat",
  "bahaya",
  "ambruk",
  "runtuh",
  "roboh",
  "kebakaran",
  "korban",
  "jiwa",
  "menimpa",
  "longsor",
  "gas bocor",
  "korsleting",
  "listrik terbuka",
  "putus total",
  "terputus",
  "hanyut",
  "tenggelam",
  "kecelakaan",
  "membahayakan",
];

const HIGH_KEYWORDS = [
  "parah",
  "besar",
  "retak",
  "hampir",
  "tertutup",
  "macet",
  "gelap total",
  "tidak berfungsi",
  "mengganggu",
  "akses utama",
  "jalan utama",
  "vital",
  "rusak berat",
  "bolong besar",
  "sekolah",
  "rumah sakit",
  "puskesmas",
  "anak",
  "malam",
  "hujan",
];

const LOW_KEYWORDS = [
  "kecil",
  "ringan",
  "sedikit",
  "tidak mengganggu",
  "cat",
  "papan nama",
  "kotor",
  "dekorasi",
  "taman",
  "bangku",
];

/**
 * Menentukan prioritas awal secara otomatis berdasarkan kategori dan isi
 * laporan. Hasil ini nantinya dapat disempurnakan oleh analisis AI.
 */
export function inferPriority(input: {
  category: string;
  title: string;
  description: string;
}): ReportPriority {
  const text = `${input.title} ${input.description}`.toLowerCase();

  if (URGENT_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return "DARURAT";
  }

  let base: ReportPriority;
  switch (input.category) {
    case "JEMBATAN":
    case "FASILITAS_KESEHATAN":
      base = "TINGGI";
      break;
    case "LAMPU_JALAN":
      base = "RENDAH";
      break;
    case "JALAN":
    case "SALURAN_AIR":
    case "LAINNYA":
    default:
      base = "SEDANG";
  }

  if (LOW_KEYWORDS.some((keyword) => text.includes(keyword))) {
    // Fasilitas vital tetap tidak diturunkan menjadi rendah.
    return base === "TINGGI" ? base : "RENDAH";
  }

  if (HIGH_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return base === "RENDAH" ? "SEDANG" : "TINGGI";
  }

  return base;
}

/**
 * Menghasilkan nomor laporan dengan format REP-YYYYMMDD-XXXX,
 * sesuai format data yang sudah ada.
 */
export function buildReportNumber(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const random = Math.floor(1000 + Math.random() * 9000);
  return `REP-${y}${m}${d}-${random}`;
}

export function formatDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

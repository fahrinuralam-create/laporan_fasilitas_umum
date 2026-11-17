import { REPORT_CATEGORIES } from "@/lib/report-utils";

const CATEGORY_VALUES = REPORT_CATEGORIES.map((c) => c.value);

/** Nilai laporan yang sudah dinormalisasi dan lolos validasi. */
export type ReportInput = {
  title: string;
  description: string;
  category: string;
  address: string | null;
  imageDataUrl: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type ReportValidationResult =
  | { ok: true; data: ReportInput }
  | { ok: false; errors: string[] };

/**
 * Validasi pembuatan laporan. Fungsi murni: tidak menyentuh database dan tidak
 * mengubah input. Urutan pemeriksaan dan pesan error dipertahankan persis
 * seperti implementasi inline sebelumnya.
 */
export function validateReportInput(
  body: Record<string, unknown>
): ReportValidationResult {
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const category = String(body.category ?? "");
  const address = body.address ? String(body.address).trim() : null;
  const imageDataUrl = body.imageDataUrl ? String(body.imageDataUrl) : null;

  const latitude =
    body.latitude !== undefined && body.latitude !== null && body.latitude !== ""
      ? Number(body.latitude)
      : null;
  const longitude =
    body.longitude !== undefined &&
    body.longitude !== null &&
    body.longitude !== ""
      ? Number(body.longitude)
      : null;

  const errors: string[] = [];
  if (!title) errors.push("Judul wajib diisi");
  if (title.length > 190) errors.push("Judul maksimal 190 karakter");
  if (!description) errors.push("Deskripsi wajib diisi");
  if (!(CATEGORY_VALUES as string[]).includes(category))
    errors.push("Kategori tidak valid");
  if (latitude !== null && Number.isNaN(latitude))
    errors.push("Latitude tidak valid");
  if (longitude !== null && Number.isNaN(longitude))
    errors.push("Longitude tidak valid");
  if (imageDataUrl && imageDataUrl.length > 4_000_000)
    errors.push("Ukuran gambar terlalu besar");

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: { title, description, category, address, imageDataUrl, latitude, longitude },
  };
}

/**
 * Normalisasi nomor HP Indonesia ke format kanonik `62...`.
 * Menerima input `08...`, `8...`, `62...`, `+62...`, dan spasi/tanda hubung.
 * Mengembalikan null jika nomor tidak valid.
 */
export function normalizePhoneNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;

  let digits = value.trim().replace(/[^\d+]/g, "");
  if (!digits) return null;

  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;

  if (!digits.startsWith("62")) return null;

  const national = digits.slice(2);
  // Nomor seluler Indonesia diawali 8, panjang nasional 8-13 digit.
  if (!/^8\d{7,12}$/.test(national)) return null;

  return `62${national}`;
}

/** Menampilkan nomor kanonik dalam format lokal yang mudah dibaca. */
export function formatPhoneNumber(value: string | null | undefined): string {
  if (!value) return "-";
  if (value.startsWith("62")) return `0${value.slice(2)}`;
  return value;
}

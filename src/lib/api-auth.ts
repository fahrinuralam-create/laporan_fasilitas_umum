import { NextResponse } from "next/server";
import { getCurrentUser, type SessionUser } from "@/lib/session";

/**
 * Hasil pemeriksaan sesi. `user` bernilai null hanya ketika permintaan harus
 * dihentikan; pada kasus itu `response` berisi respons 401/403 yang siap
 * dikembalikan route handler.
 */
export type AuthResult =
  | { user: SessionUser; response: null }
  | { user: null; response: NextResponse };

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

/** Hanya mewajibkan sesi aktif, tanpa batasan peran. */
export async function requireUser(): Promise<AuthResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, response: unauthorized() };
  }
  return { user, response: null };
}

/**
 * Mewajibkan sesi aktif sekaligus peran tertentu.
 * `forbiddenMessage` dipertahankan agar route yang punya pesan 403 khusus
 * tidak berubah kontraknya.
 */
export async function requireRole(
  role: string,
  forbiddenMessage = "Forbidden"
): Promise<AuthResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, response: unauthorized() };
  }
  if (user.role !== role) {
    return { user: null, response: forbidden(forbiddenMessage) };
  }
  return { user, response: null };
}

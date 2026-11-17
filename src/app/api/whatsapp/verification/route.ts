import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { getWhatsAppVerificationData } from "@/lib/whatsapp-link";

export async function GET() {
  const auth = await requireRole("ADMIN");
  if (!auth.user) return auth.response;

  const data = await getWhatsAppVerificationData();
  return NextResponse.json(data);
}

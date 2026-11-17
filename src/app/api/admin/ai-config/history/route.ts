import { NextResponse } from "next/server";
import { requireRole } from "@/lib/api-auth";
import { getAiConfigHistoryView } from "@/lib/ai-config";

export async function GET() {
  const auth = await requireRole("ADMIN");
  if (!auth.user) return auth.response;

  const history = await getAiConfigHistoryView();
  return NextResponse.json({ history });
}

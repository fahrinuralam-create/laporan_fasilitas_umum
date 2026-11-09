import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getAiConfigHistoryView } from "@/lib/ai-config";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const history = await getAiConfigHistoryView();
  return NextResponse.json({ history });
}

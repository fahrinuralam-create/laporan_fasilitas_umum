import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getTelegramVerificationData } from "@/lib/telegram-link";

function canVerify(role: string) {
  return role === "ADMIN" || role === "PETUGAS";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canVerify(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await getTelegramVerificationData();
  return NextResponse.json(data);
}

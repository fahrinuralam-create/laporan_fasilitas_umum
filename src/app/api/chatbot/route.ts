import { NextRequest, NextResponse } from "next/server";
import { generateChatbotReply, type ChatbotHistoryItem } from "@/lib/chatbot";
import { getCurrentUser } from "@/lib/session";

// AI dengan tool database dapat membutuhkan beberapa panggilan provider.
export const maxDuration = 60;

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const buckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(userId);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }

  bucket.count += 1;
  return bucket.count > RATE_LIMIT;
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isRateLimited(user.id)) {
    return NextResponse.json(
      { error: "Terlalu banyak pertanyaan. Coba lagi sebentar." },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const message = String(body.message ?? "").trim();
  if (!message) {
    return NextResponse.json(
      { error: "Pertanyaan wajib diisi" },
      { status: 400 }
    );
  }
  if (message.length > 1000) {
    return NextResponse.json(
      { error: "Pertanyaan maksimal 1000 karakter" },
      { status: 400 }
    );
  }

  const history: ChatbotHistoryItem[] = [];
  if (Array.isArray(body.history)) {
    for (const raw of body.history.slice(-8)) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as { role?: unknown; content?: unknown };
      const role = item.role;
      const content = item.content;

      if (
        (role === "user" || role === "assistant") &&
        typeof content === "string" &&
        content.trim()
      ) {
        history.push({
          role,
          content: content.trim().slice(0, 2000),
        });
      }
    }
  }

  try {
    const result = await generateChatbotReply(user, message, history);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Chatbot gagal:", error);
    return NextResponse.json(
      { error: "Asisten sedang tidak dapat dihubungi. Silakan coba lagi." },
      { status: 500 }
    );
  }
}

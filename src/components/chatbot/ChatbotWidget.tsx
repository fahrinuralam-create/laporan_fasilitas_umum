"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

type ChatRole = "user" | "assistant";

type UiMessage = {
  id: string;
  role: ChatRole;
  content: string;
};

let messageCounter = 0;

function makeId(): string {
  messageCounter += 1;
  return `${Date.now()}-${messageCounter}`;
}

function greetingFor(name: string, role: string): string {
  if (role === "ADMIN") {
    return `Halo, ${name}! Saya SiLapor, asisten Pelaporan Fasilitas. Saya bisa membantu dengan ringkasan laporan, cara verifikasi/penugasan, arti status, atau konfigurasi AI.`;
  }
  if (role === "PETUGAS") {
    return `Halo, ${name}! Saya SiLapor, asisten Pelaporan Fasilitas. Saya bisa membantu dengan daftar tugas, cara memproses/menyelesaikan tugas, arti status, atau notifikasi.`;
  }
  return `Halo, ${name}! Saya SiLapor, asisten Pelaporan Fasilitas. Tanyakan saja jumlah/status laporan Anda, cara membuat laporan, prioritas, notifikasi, atau Telegram.`;
}

function suggestionsFor(role: string): string[] {
  if (role === "ADMIN") {
    return [
      "Ringkasan laporan",
      "Tampilkan semua laporan",
      "Siapa saja pengguna terdaftar?",
      "Cari laporan lampu jalan",
      "Cara verifikasi laporan",
      "Beban tugas petugas",
      "Model AI apa yang dipakai?",
      "Kategori apa saja?",
      "Siapa saya?",
    ];
  }
  if (role === "PETUGAS") {
    return [
      "Tugas saya",
      "Detail tugas terakhir",
      "Cari tugas saya",
      "Cara menyelesaikan tugas",
      "Arti status",
      "Notifikasi saya",
      "Kategori apa saja?",
      "Siapa saya?",
    ];
  }
  return [
    "Berapa laporan saya?",
    "Status laporan terakhir",
    "Tampilkan semua laporan saya",
    "Cari laporan tentang jalan",
    "Cara membuat laporan",
    "Kenapa laporan saya ditolak?",
    "Arti status",
    "Kategori apa saja?",
    "Cara tautkan Telegram",
    "Siapa saya?",
  ];
}

function BotIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <rect x="4" y="7" width="16" height="12" rx="3" />
      <path d="M12 3v4M8 12h.01M16 12h.01M9 16h6" strokeLinecap="round" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        d="M21 12a8.5 8.5 0 0 1-8.5 8.5H6l-3 2v-5.2A8.5 8.5 0 1 1 21 12Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        d="m4 4 17 8-17 8 3-8-3-8Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ChatbotWidget() {
  const { data: session, status } = useSession();
  const sessionUser = session?.user as
    | { id?: string; name?: string | null; email?: string | null; role?: string }
    | undefined;

  const userId = sessionUser?.id;
  const role = sessionUser?.role || "MASYARAKAT";
  const displayName =
    sessionUser?.name || sessionUser?.email?.split("@")[0] || "Pengguna";

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const loadedForUser = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const storageKey = userId ? `silapor-chat:${userId}` : null;

  useEffect(() => {
    if (!userId || loadedForUser.current === userId) return;
    loadedForUser.current = userId;

    const key = `silapor-chat:${userId}`;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const restored = parsed
            .filter(
              (item): item is UiMessage =>
                Boolean(item) &&
                typeof item === "object" &&
                typeof (item as UiMessage).id === "string" &&
                ((item as UiMessage).role === "user" ||
                  (item as UiMessage).role === "assistant") &&
                typeof (item as UiMessage).content === "string"
            )
            .slice(-30);

          if (restored.length > 0) {
            setMessages(restored);
            return;
          }
        }
      }
    } catch {
      // Abaikan penyimpanan yang rusak.
    }

    setMessages([
      {
        id: makeId(),
        role: "assistant",
        content: greetingFor(displayName, role),
      },
    ]);
  }, [userId, displayName, role]);

  useEffect(() => {
    if (!storageKey || messages.length === 0) return;
    if (loadedForUser.current !== userId) return;

    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify(messages.slice(-30))
      );
    } catch {
      // Penyimpanan penuh atau diblokir: abaikan.
    }
  }, [messages, storageKey, userId]);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading, open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (status !== "authenticated" || !userId) return null;

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || loading) return;

    if (text.length > 1000) {
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: "assistant",
          content: "Pertanyaan maksimal 1000 karakter. Silakan ringkas pertanyaannya.",
        },
      ]);
      return;
    }

    const history = messages.slice(-8).map((message) => ({
      role: message.role,
      content: message.content,
    }));

    setMessages((prev) => [
      ...prev,
      { id: makeId(), role: "user", content: text },
    ]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });

      const data = (await res.json().catch(() => null)) as
        | { reply?: unknown; error?: unknown }
        | null;

      if (!res.ok || typeof data?.reply !== "string") {
        const errorMessage =
          typeof data?.error === "string"
            ? data.error
            : "Asisten sedang tidak dapat dihubungi. Silakan coba lagi.";
        throw new Error(errorMessage);
      }

      setMessages((prev) => [
        ...prev,
        { id: makeId(), role: "assistant", content: data.reply as string },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Asisten sedang tidak dapat dihubungi. Silakan coba lagi.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    const next = [
      {
        id: makeId(),
        role: "assistant" as const,
        content: greetingFor(displayName, role),
      },
    ];
    setMessages(next);
    if (storageKey) {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // abaikan
      }
    }
  };

  const suggestions = suggestionsFor(role);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buka asisten SiLapor"
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        <ChatIcon />
        <span className="hidden text-sm font-semibold sm:inline">
          Tanya SiLapor
        </span>
        <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-green-400" />
      </button>
    );
  }

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 flex h-[min(75vh,620px)] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[390px]">
      <header className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15">
              <BotIcon />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">
                SiLapor
              </p>
              <p className="truncate text-[11px] text-blue-100">
                Asisten Pelaporan Fasilitas · Online
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={reset}
              title="Mulai ulang percakapan"
              aria-label="Mulai ulang percakapan"
              className="rounded-lg p-1.5 transition hover:bg-white/15"
            >
              <ResetIcon />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              title="Tutup"
              aria-label="Tutup asisten"
              className="rounded-lg p-1.5 transition hover:bg-white/15"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
      </header>

      <div
        ref={scrollRef}
        aria-live="polite"
        className="flex-1 space-y-3 overflow-y-auto bg-zinc-50 px-3 py-3"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                message.role === "user"
                  ? "rounded-br-md bg-blue-600 text-white"
                  : "rounded-bl-md border border-zinc-200 bg-white text-zinc-800"
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-4 py-3">
              <div
                className="flex items-center gap-1.5"
                aria-label="SiLapor sedang menulis"
              >
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:240ms]" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-zinc-200 bg-white px-3 pb-3 pt-2">
        <div className="flex gap-1.5 overflow-x-auto pb-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => void send(suggestion)}
              disabled={loading}
              className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[11px] font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value.slice(0, 1000))}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="Tanyakan sesuatu tentang laporan..."
            aria-label="Pertanyaan untuk SiLapor"
            className="max-h-24 min-h-[42px] flex-1 resize-none rounded-xl border border-zinc-300 px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={loading || !input.trim()}
            aria-label="Kirim pertanyaan"
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-40"
          >
            <SendIcon />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-zinc-400">
          Asisten hanya memberi informasi, tidak mengubah data.
        </p>
      </div>
    </div>
  );
}

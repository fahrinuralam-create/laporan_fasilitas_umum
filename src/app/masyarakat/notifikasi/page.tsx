"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDateTime } from "@/lib/report-utils";

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  report: {
    id: string;
    reportNumber: string;
    title: string;
    status: string;
  } | null;
};

export default function NotifikasiPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const res = await fetch("/api/notifications");
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = await res.json();
    setNotifications(data.notifications ?? []);
    setUnreadCount(data.unreadCount ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const markAllRead = async () => {
    await fetch("/api/notifications/read", { method: "POST" });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Notifikasi</h1>
          <p className="text-zinc-600">
            {unreadCount > 0
              ? `${unreadCount} notifikasi belum dibaca`
              : "Semua notifikasi sudah dibaca"}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="px-4 py-2 rounded-lg border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition"
          >
            Tandai semua dibaca
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-zinc-500">Memuat notifikasi...</p>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-xl border border-zinc-200 p-10 text-center">
          <p className="text-zinc-500">Belum ada notifikasi.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {notifications.map((n) => (
            <li
              key={n.id}
              className={`rounded-xl border p-4 ${
                n.isRead
                  ? "bg-white border-zinc-200"
                  : "bg-blue-50 border-blue-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-zinc-900">{n.title}</p>
                  <p className="text-sm text-zinc-700 mt-1">{n.message}</p>
                  <p className="text-xs text-zinc-400 mt-2">
                    {formatDateTime(n.createdAt)}
                  </p>
                </div>
                {!n.isRead && (
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0" />
                )}
              </div>
              {n.report && (
                <Link
                  href={`/masyarakat/laporan/${n.report.id}`}
                  className="inline-block mt-3 text-sm font-medium text-blue-600 hover:text-blue-500"
                >
                  Lihat laporan {n.report.reportNumber} &rarr;
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

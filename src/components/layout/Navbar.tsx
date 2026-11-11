"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "@/components/providers/ThemeProvider";

type NavLink = { href: string; label: string };

function linksForRole(role?: string): NavLink[] {
  if (role === "ADMIN") {
    return [
      { href: "/admin/dashboard", label: "Dashboard" },
      { href: "/admin/laporan", label: "Kelola Laporan" },
      { href: "/admin/ai-config", label: "Konfigurasi AI" },
      { href: "/admin/telegram", label: "Bot Telegram" },
    ];
  }
  if (role === "PETUGAS") {
    return [
      { href: "/petugas/dashboard", label: "Dashboard" },
      { href: "/petugas/tugas", label: "Tugas Saya" },
    ];
  }
  return [
    { href: "/masyarakat/dashboard", label: "Dashboard" },
    { href: "/masyarakat/laporan", label: "Laporan Saya" },
    { href: "/masyarakat/notifikasi", label: "Notifikasi" },
    { href: "/pengaturan/telegram", label: "Telegram" },
  ];
}

function SunIcon() {
  return (
    <svg
      className="w-5 h-5 fill-yellow-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79" />
    </svg>
  );
}

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { resolvedTheme, toggleTheme } = useTheme();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const links = linksForRole(role);
  const isDark = resolvedTheme === "dark";

  return (
    <header className="sticky top-0 z-40 bg-card border-b border-border shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white font-bold shadow-lg">
              PF
            </span>
            <span className="font-semibold text-foreground tracking-tight hidden sm:block">
              Pelaporan Fasilitas
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 overflow-x-auto">
            {links.map((link) => {
              const active =
                pathname === link.href || pathname.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={toggleTheme}
              aria-label={`Ubah ke mode ${isDark ? "terang" : "gelap"}`}
              className="p-2 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all"
              title={isDark ? "Mode Terang" : "Mode Gelap"}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
              <span className="hidden sm:inline-block ml-1.5 text-xs font-medium text-foreground">
                {isDark ? "Gelap" : "Terang"}
              </span>
            </button>
            <span className="hidden md:block text-sm text-muted-foreground max-w-[150px] truncate">
              {session?.user?.name || session?.user?.email}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="px-3 py-2 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 hover:text-destructive transition-all"
            >
              Keluar
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

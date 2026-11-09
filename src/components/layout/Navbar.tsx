"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

type NavLink = { href: string; label: string };

function linksForRole(role?: string): NavLink[] {
  if (role === "ADMIN") {
    return [
      { href: "/admin/dashboard", label: "Dashboard" },
      { href: "/admin/laporan", label: "Kelola Laporan" },
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
  ];
}

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const links = linksForRole(role);

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-zinc-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white font-bold">
              PF
            </span>
            <span className="font-semibold text-zinc-900 hidden sm:block">
              Pelaporan Fasilitas
            </span>
          </Link>

          <nav className="flex items-center gap-1 overflow-x-auto">
            {links.map((link) => {
              const active =
                pathname === link.href || pathname.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden md:block text-sm text-zinc-600 max-w-[160px] truncate">
              {session?.user?.name || session?.user?.email}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition"
            >
              Keluar
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

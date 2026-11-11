"use client";

import { createContext, useContext, useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // State tema yang disimpan pengguna ("light" | "dark" | "system")
  const [theme, setThemeState] = useState<Theme>("system");
  // Tema yang sudah di-resolve ke light/dark (dipakai untuk menentukan class "dark")
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  /**
   * Menerapkan tema ke DOM (class "dark" pada <html>) dan localStorage.
   * Tidak memanggil setState untuk menghindari loop.
   */
  const applyTheme = useCallback((next: Theme) => {
    localStorage.setItem("pelaporan_theme", next);

    let resolved: "light" | "dark";
    if (next === "system") {
      resolved = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } else {
      resolved = next;
    }

    setResolvedTheme(resolved);
    if (resolved === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  // Saat pertama kali dimuat (client), baca preferensi dari localStorage.
  useEffect(() => {
    const stored = localStorage.getItem("pelaporan_theme") as Theme | null;
    setThemeState(stored ?? "system");
  }, []);

  // Saat state tema berubah (karena toggleTheme atau setTheme), terapkan ke DOM.
  useEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  // Ikuti sistem saat tema = "system" dan preferensi sistem berubah.
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [theme, applyTheme]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      if (prev === "light") return "dark";
      if (prev === "dark") return "system";
      return "light";
    });
  }, []);

  const setThemeExternal = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  return (
    <ThemeContext.Provider
      value={{ theme, resolvedTheme, toggleTheme, setTheme: setThemeExternal }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme harus digunakan di dalam ThemeProvider");
  }
  return ctx;
}

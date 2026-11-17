import { describe, expect, it } from "vitest";
import {
  DASHBOARD_STATUS_COLORS,
  dashboardStatusColor,
} from "@/lib/dashboard-colors";

describe("DASHBOARD_STATUS_COLORS", () => {
  it("keeps the exact colour strings rendered before the refactor", () => {
    expect(DASHBOARD_STATUS_COLORS).toEqual({
      DIAJUKAN: "bg-blue-50 text-blue-700 border-blue-200",
      DIVERIFIKASI: "bg-indigo-50 text-indigo-700 border-indigo-200",
      DITUGASKAN: "bg-purple-50 text-purple-700 border-purple-200",
      DIPROSES: "bg-amber-50 text-amber-700 border-amber-200",
      SELESAI: "bg-green-50 text-green-700 border-green-200",
      DITOLAK: "bg-red-50 text-red-700 border-red-200",
    });
  });

  it("covers all six report statuses", () => {
    expect(Object.keys(DASHBOARD_STATUS_COLORS)).toHaveLength(6);
  });
});

describe("dashboardStatusColor", () => {
  it("returns the mapped class for a known status", () => {
    expect(dashboardStatusColor("SELESAI")).toBe(
      "bg-green-50 text-green-700 border-green-200"
    );
  });

  it("falls back to the zinc palette for unknown statuses", () => {
    expect(dashboardStatusColor("TIDAK_DIKENAL")).toBe(
      "bg-zinc-100 text-zinc-600 border-zinc-200"
    );
    expect(dashboardStatusColor("")).toBe(
      "bg-zinc-100 text-zinc-600 border-zinc-200"
    );
  });

  it("differs from the list badge palette (shade 50 vs 100)", () => {
    // Guard rail: bila suatu saat kedua palet disatukan, test ini menandai
    // bahwa nilai visualnya memang berbeda.
    expect(dashboardStatusColor("DIAJUKAN")).not.toBe(
      "bg-blue-100 text-blue-700 border-blue-200"
    );
  });
});

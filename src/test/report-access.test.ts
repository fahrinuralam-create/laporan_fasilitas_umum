import { describe, expect, it } from "vitest";
import { canViewReport } from "@/lib/report-access";

const OWNER_ID = "user-masyarakat";
const OFFICER_ID = "user-petugas";
const OTHER_OFFICER_ID = "user-petugas-lain";
const ADMIN_ID = "user-admin";

function report(
  overrides: Partial<{ reporterId: string; assignedOfficerId: string | null }> = {}
) {
  return {
    reporterId: OWNER_ID,
    assignedOfficerId: OFFICER_ID,
    ...overrides,
  };
}

describe("canViewReport", () => {
  it("mengizinkan MASYARAKAT melihat laporannya sendiri", () => {
    expect(
      canViewReport({ id: OWNER_ID, role: "MASYARAKAT" }, report())
    ).toBe(true);
  });

  it("menolak MASYARAKAT yang bukan pemilik laporan", () => {
    expect(
      canViewReport({ id: "user-masyarakat-lain", role: "MASYARAKAT" }, report())
    ).toBe(false);
  });

  it("mengizinkan PETUGAS yang ditugaskan menangani laporan", () => {
    expect(canViewReport({ id: OFFICER_ID, role: "PETUGAS" }, report())).toBe(
      true
    );
  });

  it("menolak PETUGAS yang tidak ditugaskan pada laporan tersebut", () => {
    expect(
      canViewReport({ id: OTHER_OFFICER_ID, role: "PETUGAS" }, report())
    ).toBe(false);
  });

  it("mengizinkan PETUGAS melihat laporan yang ia buat sendiri", () => {
    expect(
      canViewReport(
        { id: OFFICER_ID, role: "PETUGAS" },
        report({ reporterId: OFFICER_ID, assignedOfficerId: null })
      )
    ).toBe(true);
  });

  it("mengizinkan ADMIN melihat laporan siapa pun", () => {
    expect(canViewReport({ id: ADMIN_ID, role: "ADMIN" }, report())).toBe(true);
  });

  it("menangani assignedOfficerId null tanpa memberi akses ke PETUGAS lain", () => {
    const unassigned = report({ assignedOfficerId: null });

    expect(canViewReport({ id: OFFICER_ID, role: "PETUGAS" }, unassigned)).toBe(
      false
    );
    expect(
      canViewReport({ id: OTHER_OFFICER_ID, role: "PETUGAS" }, unassigned)
    ).toBe(false);
    expect(canViewReport({ id: OWNER_ID, role: "MASYARAKAT" }, unassigned)).toBe(
      true
    );
    expect(canViewReport({ id: ADMIN_ID, role: "ADMIN" }, unassigned)).toBe(true);
  });
});

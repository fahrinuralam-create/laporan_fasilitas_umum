import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SYSTEM_ACTOR_NOTE_PREFIX,
  buildReportNumber,
  categoryLabel,
  cleanHistoryNotes,
  formatDate,
  formatDateTime,
  inferPriority,
  isSystemActorNote,
  priorityColor,
  priorityLabel,
  statusColor,
  statusLabel,
} from "@/lib/report-utils";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("label helpers", () => {
  it("maps every known category to its display label", () => {
    expect(categoryLabel("JALAN")).toBe("Jalan");
    expect(categoryLabel("LAMPU_JALAN")).toBe("Lampu Jalan");
    expect(categoryLabel("SALURAN_AIR")).toBe("Saluran Air");
    expect(categoryLabel("JEMBATAN")).toBe("Jembatan");
    expect(categoryLabel("FASILITAS_KESEHATAN")).toBe("Fasilitas Kesehatan");
    expect(categoryLabel("LAINNYA")).toBe("Lainnya");
  });

  it("falls back to the raw value for unknown categories", () => {
    expect(categoryLabel("TIDAK_DIKENAL")).toBe("TIDAK_DIKENAL");
    expect(categoryLabel("")).toBe("");
  });

  it("maps priorities and statuses to Indonesian labels", () => {
    expect(priorityLabel("RENDAH")).toBe("Rendah");
    expect(priorityLabel("DARURAT")).toBe("Darurat");
    expect(priorityLabel("???")).toBe("???");

    expect(statusLabel("DIAJUKAN")).toBe("Diajukan");
    expect(statusLabel("SELESAI")).toBe("Selesai");
    expect(statusLabel("DITOLAK")).toBe("Ditolak");
    expect(statusLabel("???")).toBe("???");
  });

  it("returns distinct badge classes per status and a default for unknown", () => {
    const classes = [
      statusColor("DIAJUKAN"),
      statusColor("DIVERIFIKASI"),
      statusColor("DITUGASKAN"),
      statusColor("DIPROSES"),
      statusColor("SELESAI"),
      statusColor("DITOLAK"),
    ];
    expect(new Set(classes).size).toBe(classes.length);
    expect(statusColor("TIDAK_DIKENAL")).toBe(
      "bg-zinc-100 text-zinc-700 border-zinc-200"
    );
  });

  it("returns distinct badge classes per priority and a default for unknown", () => {
    const classes = [
      priorityColor("RENDAH"),
      priorityColor("SEDANG"),
      priorityColor("TINGGI"),
      priorityColor("DARURAT"),
    ];
    expect(new Set(classes).size).toBe(classes.length);
    expect(priorityColor("TIDAK_DIKENAL")).toBe(
      "bg-zinc-100 text-zinc-700 border-zinc-200"
    );
  });
});

describe("system actor notes", () => {
  it("recognises notes written by the AI system", () => {
    expect(isSystemActorNote(`${SYSTEM_ACTOR_NOTE_PREFIX} ditolak otomatis`)).toBe(
      true
    );
    expect(isSystemActorNote("[SISTEM AI]")).toBe(true);
  });

  it("rejects notes that are absent or written by a human", () => {
    expect(isSystemActorNote(undefined)).toBe(false);
    expect(isSystemActorNote(null)).toBe(false);
    expect(isSystemActorNote("")).toBe(false);
    expect(isSystemActorNote("Diverifikasi oleh admin")).toBe(false);
  });

  it("strips the system prefix from history notes", () => {
    expect(cleanHistoryNotes("[SISTEM AI] Ditolak otomatis")).toBe(
      "Ditolak otomatis"
    );
    expect(cleanHistoryNotes("[SISTEM AI]   spasi berlebih")).toBe(
      "spasi berlebih"
    );
    expect(cleanHistoryNotes("[SISTEM AI]")).toBe("");
  });

  it("leaves human notes untouched and normalises empty input to an empty string", () => {
    expect(cleanHistoryNotes("  Catatan admin  ")).toBe("  Catatan admin  ");
    expect(cleanHistoryNotes(undefined)).toBe("");
    expect(cleanHistoryNotes(null)).toBe("");
    expect(cleanHistoryNotes("")).toBe("");
  });
});

describe("inferPriority", () => {
  it("escalates to DARURAT when an urgent keyword appears in the title", () => {
    expect(
      inferPriority({
        category: "LAMPU_JALAN",
        title: "Tiang listrik ambruk",
        description: "",
      })
    ).toBe("DARURAT");
  });

  it("escalates to DARURAT when an urgent keyword appears in the description", () => {
    expect(
      inferPriority({
        category: "JALAN",
        title: "Jalan rusak",
        description: "Ada korban yang membahayakan pengendara",
      })
    ).toBe("DARURAT");
  });

  it("matches urgent keywords case-insensitively", () => {
    expect(
      inferPriority({
        category: "JALAN",
        title: "JEMBATAN RUNTUH",
        description: "",
      })
    ).toBe("DARURAT");
  });

  it("treats URGENT as stronger than LOW keywords", () => {
    expect(
      inferPriority({
        category: "JALAN",
        title: "Lubang kecil tapi bahaya",
        description: "",
      })
    ).toBe("DARURAT");
  });

  it("uses a high baseline for bridges and health facilities", () => {
    expect(inferPriority({ category: "JEMBATAN", title: "Jembatan", description: "" })).toBe(
      "TINGGI"
    );
    expect(
      inferPriority({ category: "FASILITAS_KESEHATAN", title: "Puskesmas", description: "" })
    ).toBe("TINGGI");
  });

  it("uses a low baseline for street lights", () => {
    expect(
      inferPriority({ category: "LAMPU_JALAN", title: "Lampu mati", description: "" })
    ).toBe("RENDAH");
  });

  it("uses a medium baseline for roads, drains, others and unknown categories", () => {
    expect(inferPriority({ category: "JALAN", title: "Aspal", description: "" })).toBe(
      "SEDANG"
    );
    expect(
      inferPriority({ category: "SALURAN_AIR", title: "Selokan", description: "" })
    ).toBe("SEDANG");
    expect(inferPriority({ category: "LAINNYA", title: "Lain", description: "" })).toBe(
      "SEDANG"
    );
    expect(inferPriority({ category: "TIDAK_DIKENAL", title: "Lain", description: "" })).toBe(
      "SEDANG"
    );
  });

  it("downgrades to RENDAH when a low keyword is present", () => {
    expect(
      inferPriority({ category: "JALAN", title: "Lubang kecil", description: "" })
    ).toBe("RENDAH");
    expect(
      inferPriority({ category: "LAMPU_JALAN", title: "Lampu", description: "sedikit redup" })
    ).toBe("RENDAH");
  });

  it("never downgrades vital facilities below TINGGI", () => {
    expect(
      inferPriority({ category: "JEMBATAN", title: "Kerusakan kecil", description: "" })
    ).toBe("TINGGI");
  });

  it("upgrades by one level when a high keyword is present", () => {
    expect(
      inferPriority({ category: "LAMPU_JALAN", title: "Lampu parah", description: "" })
    ).toBe("SEDANG");
    expect(
      inferPriority({ category: "JALAN", title: "Jalan parah", description: "" })
    ).toBe("TINGGI");
  });

  it("prefers LOW over HIGH when both appear (documented precedence)", () => {
    expect(
      inferPriority({ category: "JALAN", title: "kecil tapi parah", description: "" })
    ).toBe("RENDAH");
  });
});

describe("buildReportNumber", () => {
  it("formats the date part as REP-YYYYMMDD", () => {
    expect(buildReportNumber(new Date(2026, 0, 5))).toMatch(/^REP-20260105-\d{4}$/);
  });

  it("pads single-digit months and days", () => {
    expect(buildReportNumber(new Date(2026, 8, 9))).toMatch(/^REP-20260909-\d{4}$/);
  });

  it("always produces a four digit suffix", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(buildReportNumber(new Date(2026, 0, 5))).toBe("REP-20260105-1000");

    vi.spyOn(Math, "random").mockReturnValue(0.9999);
    expect(buildReportNumber(new Date(2026, 0, 5))).toBe("REP-20260105-9999");
  });
});

describe("date formatting", () => {
  it("produces the same output for a Date and its ISO string", () => {
    const date = new Date(2026, 0, 5, 10, 30);
    expect(formatDate(date)).toBe(formatDate(date.toISOString()));
    expect(formatDateTime(date)).toBe(formatDateTime(date.toISOString()));
  });

  it("renders Indonesian, non-empty output", () => {
    const date = new Date(2026, 0, 5, 10, 30);
    expect(formatDate(date)).toContain("2026");
    expect(formatDateTime(date)).toContain("2026");
  });
});

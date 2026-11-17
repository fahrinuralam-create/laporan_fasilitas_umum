// @vitest-environment node

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  reportCreate: vi.fn(),
  analyzeReportById: vi.fn(),
  deliverWhatsAppNotification: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));

vi.mock("@/lib/prisma", () => ({
  default: { report: { create: mocks.reportCreate } },
}));

vi.mock("@/lib/report-ai", () => ({
  analyzeReportById: mocks.analyzeReportById,
}));

vi.mock("@/lib/whatsapp-notify", () => ({
  deliverWhatsAppNotification: mocks.deliverWhatsAppNotification,
}));

import { POST } from "@/app/api/reports/route";

const CATEGORY_VALUES = [
  "JALAN",
  "LAMPU_JALAN",
  "SALURAN_AIR",
  "JEMBATAN",
  "FASILITAS_KESEHATAN",
  "LAINNYA",
];

const USER = { id: "user-1", role: "MASYARAKAT", name: "Warga" };

function buildRequest(body: unknown, raw = false) {
  return new NextRequest("http://localhost/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? String(body) : JSON.stringify(body),
  });
}

async function callPost(body: unknown, raw = false) {
  const response = await POST(buildRequest(body, raw));
  return { status: response.status, json: await response.json() };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    title: "Jalan rusak",
    description: "Lubang besar di depan sekolah",
    category: "JALAN",
    ...overrides,
  };
}

function createdReport(overrides: Record<string, unknown> = {}) {
  return {
    id: "rep-1",
    reportNumber: "REP-20260105-1000",
    reportimage: [],
    reporthistory: [],
    notification: [{ id: "notif-1" }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue(USER);
  mocks.reportCreate.mockImplementation(async () => createdReport());
  mocks.analyzeReportById.mockResolvedValue({ ok: true });
  mocks.deliverWhatsAppNotification.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/reports — authentication", () => {
  it("returns 401 Unauthorized without a session", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const { status, json } = await callPost(validBody());

    expect(status).toBe(401);
    expect(json).toEqual({ error: "Unauthorized" });
    expect(mocks.reportCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/reports — body parsing", () => {
  it("returns 400 Body tidak valid for malformed JSON", async () => {
    const { status, json } = await callPost("{not-json", true);

    expect(status).toBe(400);
    expect(json).toEqual({ error: "Body tidak valid" });
    expect(mocks.reportCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/reports — validation messages and ordering", () => {
  it("reports every missing field in the documented order", async () => {
    const { status, json } = await callPost({});

    expect(status).toBe(400);
    expect(json).toEqual({
      error: "Judul wajib diisi, Deskripsi wajib diisi, Kategori tidak valid",
    });
    expect(mocks.reportCreate).not.toHaveBeenCalled();
  });

  it("reports a title that is too long after the empty-title rule", async () => {
    const { status, json } = await callPost(
      validBody({ title: "x".repeat(191) })
    );

    expect(status).toBe(400);
    expect(json).toEqual({ error: "Judul maksimal 190 karakter" });
  });

  it("accepts a title of exactly 190 characters", async () => {
    const { status } = await callPost(validBody({ title: "x".repeat(190) }));
    expect(status).toBe(201);
  });

  it("rejects an unknown category", async () => {
    const { status, json } = await callPost(validBody({ category: "ATAP" }));

    expect(status).toBe(400);
    expect(json).toEqual({ error: "Kategori tidak valid" });
  });

  it("does not trim the category (existing behaviour)", async () => {
    const { status, json } = await callPost(validBody({ category: " JALAN " }));

    expect(status).toBe(400);
    expect(json).toEqual({ error: "Kategori tidak valid" });
  });

  it("accepts every known category", async () => {
    for (const category of CATEGORY_VALUES) {
      const { status } = await callPost(validBody({ category }));
      expect(status).toBe(201);
    }
  });

  it("rejects a non numeric latitude and longitude", async () => {
    const { status, json } = await callPost(
      validBody({ latitude: "abc", longitude: "def" })
    );

    expect(status).toBe(400);
    expect(json).toEqual({
      error: "Latitude tidak valid, Longitude tidak valid",
    });
  });

  it("treats empty strings as absent coordinates", async () => {
    const { status } = await callPost(
      validBody({ latitude: "", longitude: null })
    );
    expect(status).toBe(201);

    const data = mocks.reportCreate.mock.calls[0][0].data;
    expect(data.latitude).toBeNull();
    expect(data.longitude).toBeNull();
  });

  it("rejects an oversized image payload", async () => {
    const { status, json } = await callPost(
      validBody({ imageDataUrl: "a".repeat(4_000_001) })
    );

    expect(status).toBe(400);
    expect(json).toEqual({ error: "Ukuran gambar terlalu besar" });
  });

  it("accepts an image payload at the size limit", async () => {
    const { status } = await callPost(
      validBody({ imageDataUrl: "a".repeat(4_000_000) })
    );
    expect(status).toBe(201);
  });

  it("joins multiple errors with a comma and space", async () => {
    const { json } = await callPost({
      title: "",
      description: "",
      category: "X",
      latitude: "abc",
      longitude: "def",
      imageDataUrl: "a".repeat(4_000_001),
    });

    expect(json.error).toBe(
      "Judul wajib diisi, Deskripsi wajib diisi, Kategori tidak valid, Latitude tidak valid, Longitude tidak valid, Ukuran gambar terlalu besar"
    );
  });
});

describe("POST /api/reports — normalisation", () => {
  it("trims title and description", async () => {
    await callPost(
      validBody({ title: "  Judul  ", description: "  Deskripsi  " })
    );

    const data = mocks.reportCreate.mock.calls[0][0].data;
    expect(data.title).toBe("Judul");
    expect(data.description).toBe("Deskripsi");
  });

  it("treats a falsy address as null and trims a present one", async () => {
    await callPost(validBody({ address: "" }));
    expect(mocks.reportCreate.mock.calls[0][0].data.address).toBeNull();

    await callPost(validBody({ address: "  Jl. Merdeka 1  " }));
    expect(mocks.reportCreate.mock.calls[1][0].data.address).toBe(
      "Jl. Merdeka 1"
    );
  });

  it("treats a falsy image payload as null", async () => {
    await callPost(validBody({ imageDataUrl: "" }));
    expect(mocks.reportCreate.mock.calls[0][0].data.reportimage).toBeUndefined();
  });

  it("coerces non numeric input through Number()", async () => {
    await callPost(validBody({ latitude: "1.5", longitude: 2 }));

    const data = mocks.reportCreate.mock.calls[0][0].data;
    expect(data.latitude).toBe(1.5);
    expect(data.longitude).toBe(2);
  });
});

describe("POST /api/reports — persistence", () => {
  it("creates the report with the original defaults", async () => {
    const { status, json } = await callPost(
      validBody({ title: "Jembatan ambruk" })
    );

    expect(status).toBe(201);
    expect(json.id).toBe("rep-1");

    const data = mocks.reportCreate.mock.calls[0][0].data;
    expect(data.status).toBe("DIAJUKAN");
    expect(data.priority).toBe("DARURAT");
    expect(data.reporterId).toBe("user-1");
    expect(data.reportNumber).toMatch(/^REP-\d{8}-\d{4}$/);
    expect(data.reporthistory.create[0]).toMatchObject({
      userId: "user-1",
      oldStatus: "DIAJUKAN",
      newStatus: "DIAJUKAN",
    });
    expect(data.notification.create[0].title).toBe(
      "Laporan Berhasil Dibuat"
    );
  });

  it("retries report number collisions (P2002) up to six times", async () => {
    mocks.reportCreate
      .mockRejectedValueOnce({ code: "P2002" })
      .mockRejectedValueOnce({ code: "P2002" })
      .mockResolvedValueOnce(createdReport());

    const { status } = await callPost(validBody());

    expect(status).toBe(201);
    expect(mocks.reportCreate).toHaveBeenCalledTimes(3);
  });

  it("returns 500 immediately for a non P2002 failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.reportCreate.mockRejectedValue({ code: "P2003" });

    const { status, json } = await callPost(validBody());

    expect(status).toBe(500);
    expect(json).toEqual({
      error: "Gagal membuat laporan. Silakan coba lagi.",
    });
    expect(mocks.reportCreate).toHaveBeenCalledTimes(1);
  });

  it("gives up after six P2002 collisions", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.reportCreate.mockRejectedValue({ code: "P2002" });

    const { status } = await callPost(validBody());

    expect(status).toBe(500);
    expect(mocks.reportCreate).toHaveBeenCalledTimes(6);
  });

  it("schedules background AI analysis and WhatsApp delivery", async () => {
    await callPost(validBody());

    expect(mocks.deliverWhatsAppNotification).toHaveBeenCalledWith("notif-1");
    expect(mocks.analyzeReportById).toHaveBeenCalledWith("rep-1");
  });
});

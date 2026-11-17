import { describe, expect, it } from "vitest";
import { validateReportInput } from "@/lib/report-validation";

const valid = {
  title: "Jalan rusak",
  description: "Lubang di depan sekolah",
  category: "JALAN",
};

describe("validateReportInput — accepted input", () => {
  it("returns the normalised data", () => {
    const result = validateReportInput({
      title: "  Judul  ",
      description: "  Deskripsi  ",
      category: "JALAN",
      address: "  Jl. Merdeka  ",
      imageDataUrl: "data:image/png;base64,aaa",
      latitude: "1.5",
      longitude: 2,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        title: "Judul",
        description: "Deskripsi",
        category: "JALAN",
        address: "Jl. Merdeka",
        imageDataUrl: "data:image/png;base64,aaa",
        latitude: 1.5,
        longitude: 2,
      },
    });
  });

  it("normalises absent optional fields to null", () => {
    const result = validateReportInput({ ...valid });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      title: "Jalan rusak",
      description: "Lubang di depan sekolah",
      category: "JALAN",
      address: null,
      imageDataUrl: null,
      latitude: null,
      longitude: null,
    });
  });

  it("treats empty string coordinates as absent", () => {
    const result = validateReportInput({ ...valid, latitude: "", longitude: "" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.latitude).toBeNull();
    expect(result.data.longitude).toBeNull();
  });

  it("accepts a title of exactly 190 characters and an image at the limit", () => {
    const result = validateReportInput({
      ...valid,
      title: "x".repeat(190),
      imageDataUrl: "a".repeat(4_000_000),
    });
    expect(result.ok).toBe(true);
  });

  it("accepts every known category", () => {
    for (const category of [
      "JALAN",
      "LAMPU_JALAN",
      "SALURAN_AIR",
      "JEMBATAN",
      "FASILITAS_KESEHATAN",
      "LAINNYA",
    ]) {
      expect(validateReportInput({ ...valid, category }).ok).toBe(true);
    }
  });
});

describe("validateReportInput — rejected input", () => {
  it("lists errors in the original order", () => {
    const result = validateReportInput({});

    expect(result).toEqual({
      ok: false,
      errors: [
        "Judul wajib diisi",
        "Deskripsi wajib diisi",
        "Kategori tidak valid",
      ],
    });
  });

  it("appends coordinate and image errors after the field errors", () => {
    const result = validateReportInput({
      title: "",
      description: "",
      category: "X",
      latitude: "abc",
      longitude: "def",
      imageDataUrl: "a".repeat(4_000_001),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      "Judul wajib diisi",
      "Deskripsi wajib diisi",
      "Kategori tidak valid",
      "Latitude tidak valid",
      "Longitude tidak valid",
      "Ukuran gambar terlalu besar",
    ]);
  });

  it("rejects an over-long title without duplicating the empty-title error", () => {
    const result = validateReportInput({ ...valid, title: "x".repeat(191) });

    expect(result).toEqual({
      ok: false,
      errors: ["Judul maksimal 190 karakter"],
    });
  });

  it("does not trim the category", () => {
    const result = validateReportInput({ ...valid, category: " JALAN " });
    expect(result).toEqual({ ok: false, errors: ["Kategori tidak valid"] });
  });

  it("rejects an image just over the size limit", () => {
    const result = validateReportInput({
      ...valid,
      imageDataUrl: "a".repeat(4_000_001),
    });
    expect(result).toEqual({
      ok: false,
      errors: ["Ukuran gambar terlalu besar"],
    });
  });

  it("rejects non numeric coordinates", () => {
    const result = validateReportInput({
      ...valid,
      latitude: "utara",
      longitude: {},
    });
    expect(result).toEqual({
      ok: false,
      errors: ["Latitude tidak valid", "Longitude tidak valid"],
    });
  });
});

describe("validateReportInput — coercions preserved from the inline code", () => {
  it("passes all values through String()", () => {
    const result = validateReportInput({
      title: 123,
      description: true,
      category: "LAINNYA",
      address: 0,
      imageDataUrl: 0,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        title: "123",
        description: "true",
        category: "LAINNYA",
        address: null,
        imageDataUrl: null,
        latitude: null,
        longitude: null,
      },
    });
  });

  it("uses truthiness for address and image, matching the original", () => {
    const result = validateReportInput({
      ...valid,
      address: "",
      imageDataUrl: "",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.address).toBeNull();
    expect(result.data.imageDataUrl).toBeNull();
  });

  it("accepts non-finite coordinates because only NaN is rejected", () => {
    const result = validateReportInput({ ...valid, latitude: "Infinity" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.latitude).toBe(Infinity);
  });
});

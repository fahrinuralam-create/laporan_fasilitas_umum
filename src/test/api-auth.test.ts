// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));

vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));

import { requireRole, requireUser } from "@/lib/api-auth";

const ADMIN = { id: "admin-1", role: "ADMIN", name: "Admin", email: "a@x.test" };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("requireUser", () => {
  it("returns the session user on success", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);

    const auth = await requireUser();

    expect(auth.user).toEqual(ADMIN);
    expect(auth.response).toBeNull();
  });

  it("returns a 401 Unauthorized response without a session", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const auth = await requireUser();

    expect(auth.user).toBeNull();
    expect(auth.response?.status).toBe(401);
    await expect(auth.response?.json()).resolves.toEqual({
      error: "Unauthorized",
    });
  });

  it("returns a fresh response instance per call", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const first = await requireUser();
    const second = await requireUser();

    expect(first.response).not.toBe(second.response);
  });
});

describe("requireRole", () => {
  it("returns the user when the role matches", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);

    const auth = await requireRole("ADMIN");

    expect(auth.user).toEqual(ADMIN);
    expect(auth.response).toBeNull();
  });

  it("returns 401 before considering the role", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const auth = await requireRole("ADMIN");

    expect(auth.response?.status).toBe(401);
    await expect(auth.response?.json()).resolves.toEqual({
      error: "Unauthorized",
    });
  });

  it("returns 403 Forbidden for a mismatched role", async () => {
    mocks.getCurrentUser.mockResolvedValue({
      id: "officer-1",
      role: "PETUGAS",
    });

    const auth = await requireRole("ADMIN");

    expect(auth.user).toBeNull();
    expect(auth.response?.status).toBe(403);
    await expect(auth.response?.json()).resolves.toEqual({
      error: "Forbidden",
    });
  });

  it("preserves a route-specific forbidden message", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);

    const auth = await requireRole(
      "MASYARAKAT",
      "Fitur WhatsApp hanya tersedia untuk masyarakat."
    );

    expect(auth.response?.status).toBe(403);
    await expect(auth.response?.json()).resolves.toEqual({
      error: "Fitur WhatsApp hanya tersedia untuk masyarakat.",
    });
  });

  it("compares roles with strict equality, as the inline checks did", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u", role: "admin" });

    const auth = await requireRole("ADMIN");

    expect(auth.response?.status).toBe(403);
  });
});

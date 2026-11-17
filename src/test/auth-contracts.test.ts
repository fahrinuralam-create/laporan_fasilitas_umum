// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  notificationFindMany: vi.fn(),
  notificationCount: vi.fn(),
  reportFindUnique: vi.fn(),
  userCount: vi.fn(),
  whatsappLinkRequestCount: vi.fn(),
  transitionReport: vi.fn(),
  getAiConfigHistoryView: vi.fn(),
  getWhatsAppLinkStatus: vi.fn(),
  getWhatsAppVerificationData: vi.fn(),
  setWhatsAppEnabled: vi.fn(),
  revokeWhatsAppLink: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));

vi.mock("@/lib/prisma", () => ({
  default: {
    notification: {
      findMany: mocks.notificationFindMany,
      count: mocks.notificationCount,
    },
    report: { findUnique: mocks.reportFindUnique },
    user: { count: mocks.userCount },
    whatsapplinkrequest: { count: mocks.whatsappLinkRequestCount },
  },
}));

vi.mock("@/lib/report-workflow", () => ({
  transitionReport: mocks.transitionReport,
}));

vi.mock("@/lib/ai-config", () => ({
  getAiConfigHistoryView: mocks.getAiConfigHistoryView,
}));

vi.mock("@/lib/whatsapp-link", () => ({
  getWhatsAppLinkStatus: mocks.getWhatsAppLinkStatus,
  getWhatsAppVerificationData: mocks.getWhatsAppVerificationData,
  setWhatsAppEnabled: mocks.setWhatsAppEnabled,
  revokeWhatsAppLink: mocks.revokeWhatsAppLink,
}));

import { GET as notificationsGet } from "@/app/api/notifications/route";
import { GET as aiConfigHistoryGet } from "@/app/api/admin/ai-config/history/route";
import { GET as adminWhatsappGet } from "@/app/api/admin/whatsapp/route";
import { POST as petugasActionPost } from "@/app/api/petugas/tasks/[id]/action/route";
import { GET as whatsappStatusGet } from "@/app/api/whatsapp/status/route";
import { GET as whatsappVerificationGet } from "@/app/api/whatsapp/verification/route";


const ADMIN = { id: "admin-1", role: "ADMIN", name: "Admin", email: "a@x.test" };
const PETUGAS = { id: "officer-1", role: "PETUGAS", name: "Petugas" };
const MASYARAKAT = { id: "user-1", role: "MASYARAKAT", name: "Warga" };

const WHATSAPP_FORBIDDEN = {
  error: "Fitur WhatsApp hanya tersedia untuk masyarakat.",
};

function jsonRequest(path: string, body: unknown = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function expectJson(response: Response, status: number, body: unknown) {
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toEqual(body);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.notificationFindMany.mockResolvedValue([]);
  mocks.getAiConfigHistoryView.mockResolvedValue([]);
  mocks.getWhatsAppLinkStatus.mockResolvedValue({
    linked: false,
    number: null,
    enabled: false,
  });
});

describe("Group A — session only (401 Unauthorized)", () => {
  it("GET /api/notifications rejects anonymous requests", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await expectJson(await notificationsGet(), 401, { error: "Unauthorized" });
    expect(mocks.notificationFindMany).not.toHaveBeenCalled();
  });

  it("GET /api/notifications allows every authenticated role", async () => {
    mocks.getCurrentUser.mockResolvedValue(MASYARAKAT);
    await expectJson(await notificationsGet(), 200, {
      notifications: [],
      unreadCount: 0,
    });
  });
});

describe("Group B — ADMIN only (401 then 403 Forbidden)", () => {
  it("rejects anonymous requests with 401", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await expectJson(await aiConfigHistoryGet(), 401, { error: "Unauthorized" });
    expect(mocks.getAiConfigHistoryView).not.toHaveBeenCalled();
  });

  it("rejects non-admin roles with 403 Forbidden", async () => {
    for (const user of [PETUGAS, MASYARAKAT]) {
      mocks.getCurrentUser.mockResolvedValue(user);
      await expectJson(await aiConfigHistoryGet(), 403, {
        error: "Forbidden",
      });
    }
    expect(mocks.getAiConfigHistoryView).not.toHaveBeenCalled();
  });

  it("allows admins", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    await expectJson(await aiConfigHistoryGet(), 200, { history: [] });
  });
});

describe("Group C — ADMIN via the former local requireAdmin()", () => {
  beforeEach(() => {
    mocks.userCount.mockResolvedValue(1);
    mocks.notificationCount.mockResolvedValue(2);
    mocks.whatsappLinkRequestCount.mockResolvedValue(0);
  });

  it("rejects anonymous requests with 401", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await expectJson(await adminWhatsappGet(), 401, { error: "Unauthorized" });
    expect(mocks.userCount).not.toHaveBeenCalled();
  });

  it("rejects non-admin roles with 403 Forbidden", async () => {
    mocks.getCurrentUser.mockResolvedValue(PETUGAS);
    await expectJson(await adminWhatsappGet(), 403, { error: "Forbidden" });
    expect(mocks.userCount).not.toHaveBeenCalled();
  });

  it("allows admins and keeps the response shape", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);

    const response = await adminWhatsappGet();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual([
      "configured",
      "counts",
      "env",
    ]);
    expect(body.counts).toEqual({
      verifiedUsers: 1,
      totalNotifications: 2,
      sent: 2,
      failed: 2,
      pendingAdmin: 0,
      pendingVerification: 0,
      activeLinks: 0,
    });
  });
});

describe("Group D — ADMIN via the former canVerify()", () => {
  it("rejects anonymous requests with 401", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await expectJson(await whatsappVerificationGet(), 401, {
      error: "Unauthorized",
    });
    expect(mocks.getWhatsAppVerificationData).not.toHaveBeenCalled();
  });

  it("rejects non-admin roles with 403 Forbidden", async () => {
    mocks.getCurrentUser.mockResolvedValue(MASYARAKAT);
    await expectJson(await whatsappVerificationGet(), 403, {
      error: "Forbidden",
    });
    expect(mocks.getWhatsAppVerificationData).not.toHaveBeenCalled();
  });

  it("allows admins", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    mocks.getWhatsAppVerificationData.mockResolvedValue({ requests: [] });

    await expectJson(await whatsappVerificationGet(), 200, { requests: [] });
  });
});

describe("Group E — PETUGAS only", () => {  const params = { params: Promise.resolve({ id: "rep-1" }) };

  it("rejects anonymous requests with 401", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await expectJson(
      await petugasActionPost(jsonRequest("/api/petugas/tasks/rep-1/action"), params),
      401,
      { error: "Unauthorized" }
    );
    expect(mocks.reportFindUnique).not.toHaveBeenCalled();
  });

  it("rejects other roles with 403 Forbidden", async () => {
    mocks.getCurrentUser.mockResolvedValue(ADMIN);
    await expectJson(
      await petugasActionPost(jsonRequest("/api/petugas/tasks/rep-1/action"), params),
      403,
      { error: "Forbidden" }
    );
    expect(mocks.reportFindUnique).not.toHaveBeenCalled();
  });

  it("still enforces assignment after the role check", async () => {
    mocks.getCurrentUser.mockResolvedValue(PETUGAS);
    mocks.reportFindUnique.mockResolvedValue({
      id: "rep-1",
      assignedOfficerId: "someone-else",
      status: "DITUGASKAN",
    });

    await expectJson(
      await petugasActionPost(
        jsonRequest("/api/petugas/tasks/rep-1/action", { action: "start" }),
        params
      ),
      403,
      { error: "Laporan ini bukan tugas Anda" }
    );
    expect(mocks.transitionReport).not.toHaveBeenCalled();
  });
});

describe("Group F — MASYARAKAT only (route-specific 403 message)", () => {
  it("rejects anonymous requests with 401", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await expectJson(await whatsappStatusGet(), 401, { error: "Unauthorized" });
    expect(mocks.getWhatsAppLinkStatus).not.toHaveBeenCalled();
  });

  it("rejects non-masyarakat roles with the existing custom message", async () => {
    for (const user of [ADMIN, PETUGAS]) {
      mocks.getCurrentUser.mockResolvedValue(user);
      await expectJson(await whatsappStatusGet(), 403, WHATSAPP_FORBIDDEN);
    }
    expect(mocks.getWhatsAppLinkStatus).not.toHaveBeenCalled();
  });

  it("allows masyarakat", async () => {
    mocks.getCurrentUser.mockResolvedValue(MASYARAKAT);
    await expectJson(await whatsappStatusGet(), 200, {
      linked: false,
      number: null,
      enabled: false,
    });
  });
});

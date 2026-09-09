import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRateLimitedCurrentUser, getPrisma, getOnboardedViewer, getPublicCourtSlot, getCourtMatchParticipation } = vi.hoisted(() => ({
  getRateLimitedCurrentUser: vi.fn(),
  getPrisma: vi.fn(),
  getOnboardedViewer: vi.fn(),
  getPublicCourtSlot: vi.fn(),
  getCourtMatchParticipation: vi.fn(),
}));

vi.mock("@/server/auth/current-user", () => ({
  getRateLimitedCurrentUser,
  AuthenticationError: class AuthenticationError extends Error {},
  AccountAccessError: class AccountAccessError extends Error {},
}));
vi.mock("@/server/db/prisma", () => ({ getPrisma }));
vi.mock("@/server/domain/match-service", () => ({ getOnboardedViewer }));
vi.mock("@/server/domain/court-slot-service", () => ({ getPublicCourtSlot }));
vi.mock("@/server/domain/court-match-view", () => ({ getCourtMatchParticipation }));

import { GET } from "./route";
import { DomainError } from "@/server/domain/profile-service";

const slotId = "e3e70682-c209-4cac-a29f-6fbed82c07cd";

describe("GET /api/v1/partner-session-slots/{slotId}", () => {
  beforeEach(() => {
    getRateLimitedCurrentUser.mockReset();
    getPrisma.mockReset();
    getOnboardedViewer.mockReset();
    getPublicCourtSlot.mockReset();
    getCourtMatchParticipation.mockReset();
  });

  it("requires an onboarded viewer before returning a public slot", async () => {
    const prisma = { courtSlot: {} };
    getRateLimitedCurrentUser.mockResolvedValue({ id: "member-id", onboardingCompletedAt: new Date() });
    getPrisma.mockReturnValue(prisma);
    getOnboardedViewer.mockResolvedValue({ id: "member-id" });
    // 공개된 시간에는 코트 매칭이 붙어 있고, 응답에 본인의 참가 상태를 함께 담는다.
    getPublicCourtSlot.mockResolvedValue({ id: slotId, status: "AVAILABLE", session: { matchId: "match-id" } });
    getCourtMatchParticipation.mockResolvedValue({ id: "match-id", canApply: true });

    const response = await GET(new Request(`http://localhost/api/v1/partner-session-slots/${slotId}`), { params: Promise.resolve({ slotId }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ participation: { canApply: true } });
    expect(getOnboardedViewer).toHaveBeenCalledWith(prisma, { id: "member-id", onboardingCompletedAt: expect.any(Date) });
    expect(getPublicCourtSlot).toHaveBeenCalledWith(prisma, slotId, "member-id");
  });

  it("rejects a malformed slot identifier before the domain lookup", async () => {
    getRateLimitedCurrentUser.mockResolvedValue({ id: "member-id", onboardingCompletedAt: new Date() });
    getPrisma.mockReturnValue({ courtSlot: {} });
    getOnboardedViewer.mockResolvedValue({ id: "member-id" });

    const response = await GET(new Request("http://localhost/api/v1/partner-session-slots/not-a-uuid"), { params: Promise.resolve({ slotId: "not-a-uuid" }) });

    expect(response.status).toBe(422);
    expect(getPublicCourtSlot).not.toHaveBeenCalled();
  });

  it("시간 보정으로 취소되면 상단 상태도 새로 읽어서 일치시킨다", async () => {
    getRateLimitedCurrentUser.mockResolvedValue({ id: "member-id" });
    getPrisma.mockReturnValue({});
    getOnboardedViewer.mockResolvedValue({ id: "member-id" });
    getPublicCourtSlot.mockResolvedValueOnce({ session: { matchId: "match-id", statusLabel: "모집 중" } });
    getCourtMatchParticipation.mockResolvedValue({ status: "CANCELLED", canApply: false });
    getPublicCourtSlot.mockResolvedValueOnce({ session: { matchId: "match-id", statusLabel: "취소됨" } });
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ slotId }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      session: { statusLabel: "취소됨" }, participation: { status: "CANCELLED", canApply: false },
    });
    expect(getPublicCourtSlot.mock.invocationCallOrder[1]).toBeGreaterThan(getCourtMatchParticipation.mock.invocationCallOrder[0]);
  });

  it("시간 접근이 거절되면 참가 상태를 읽거나 보정하지 않는다", async () => {
    getRateLimitedCurrentUser.mockResolvedValue({ id: "member-id" });
    getPrisma.mockReturnValue({});
    getOnboardedViewer.mockResolvedValue({ id: "member-id" });
    getPublicCourtSlot.mockRejectedValue(new DomainError("PARTNER_SLOT_NOT_AVAILABLE", 404, "조회할 수 없어요."));
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ slotId }) });
    expect(response.status).toBe(404);
    expect(getCourtMatchParticipation).not.toHaveBeenCalled();
  });
});

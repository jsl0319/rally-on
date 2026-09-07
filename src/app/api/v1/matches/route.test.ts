import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMatch, getOnboardedViewer, getPrisma, getRateLimitedCurrentUser } = vi.hoisted(() => ({
  createMatch: vi.fn(),
  getOnboardedViewer: vi.fn(),
  getPrisma: vi.fn(),
  getRateLimitedCurrentUser: vi.fn(),
}));

vi.mock("@/server/auth/current-user", () => ({
  getRateLimitedCurrentUser,
  AuthenticationError: class AuthenticationError extends Error {},
  AccountAccessError: class AccountAccessError extends Error {},
}));
vi.mock("@/server/db/prisma", () => ({ getPrisma }));
vi.mock("@/server/domain/match-service", () => ({ createMatch, getOnboardedViewer }));

import { POST } from "./route";

const externalReservedInput = {
  clientRequestId: "e3e70682-c209-4cac-a29f-6fbed82c07cd",
  title: "천천히 랠리 연습해요",
  startsAt: "2030-01-02T01:00:00.000Z",
  endsAt: "2030-01-02T03:00:00.000Z",
  courtSource: "EXTERNAL_RESERVED",
  externalCourt: { name: "마포 테니스장", address: "서울 마포구 월드컵로 00" },
  recruitCount: 2,
  playPurposes: ["RALLY_PRACTICE"],
  partnerPreference: "COMPLETE_BEGINNER_WELCOME",
  totalCourtFeeKrw: 40_000,
  introduction: "천천히 랠리하면서 즐겁게 연습해요.",
};

describe("POST /api/v1/matches", () => {
  beforeEach(() => {
    createMatch.mockReset();
    getOnboardedViewer.mockReset();
    getPrisma.mockReset();
    getRateLimitedCurrentUser.mockReset();
    getRateLimitedCurrentUser.mockResolvedValue({ id: "host-user-id" });
    getPrisma.mockReturnValue({});
    getOnboardedViewer.mockResolvedValue({ id: "host-user-id" });
  });

  it("rejects a client attempt to create a new court-undecided match before the service call", async () => {
    const response = await POST(new Request("http://localhost/api/v1/matches", {
      method: "POST",
      body: JSON.stringify({ ...externalReservedInput, courtSource: "COURT_TBD", externalCourt: null, totalCourtFeeKrw: null }),
      headers: { "Content-Type": "application/json" },
    }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION_FAILED" } });
    expect(createMatch).not.toHaveBeenCalled();
  });

  it("passes a complete external-reserved court request to the creation service", async () => {
    createMatch.mockResolvedValue({ created: true, match: { id: "match-id" } });

    const response = await POST(new Request("http://localhost/api/v1/matches", {
      method: "POST",
      body: JSON.stringify(externalReservedInput),
      headers: { "Content-Type": "application/json" },
    }));

    expect(response.status).toBe(201);
    expect(createMatch).toHaveBeenCalledWith({}, { id: "host-user-id" }, expect.objectContaining({
      courtSource: "EXTERNAL_RESERVED",
      externalCourt: expect.objectContaining({ name: "마포 테니스장" }),
    }));
  });
});

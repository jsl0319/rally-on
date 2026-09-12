import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRateLimitedCurrentUser, getPrisma, updateCourtSlot } = vi.hoisted(() => ({
  getRateLimitedCurrentUser: vi.fn(),
  getPrisma: vi.fn(),
  updateCourtSlot: vi.fn(),
}));

vi.mock("@/server/auth/current-user", () => ({
  getRateLimitedCurrentUser,
  AuthenticationError: class AuthenticationError extends Error {},
  AccountAccessError: class AccountAccessError extends Error {},
}));
vi.mock("@/server/db/prisma", () => ({ getPrisma }));
vi.mock("@/server/domain/court-slot-service", () => ({ updateCourtSlot }));

import { PATCH } from "./route";

const slotId = "e3e70682-c209-4cac-a29f-6fbed82c07cd";
const validBody = {
  courtUnitName: "2번 코트",
  startsAt: "2030-01-02T01:00:00.000Z",
  endsAt: "2030-01-02T03:00:00.000Z",
  priceKrw: 40_000,
  maxParticipantCount: 4,
  minParticipantCount: 4,
  gameType: "MIXED_DOUBLES",
  maleCapacity: 2,
  femaleCapacity: 2,
  approvalMode: "AUTO",
  usageNote: null,
  expectedVersion: 2,
};

describe("PATCH /api/v1/operator/slots/{slotId}", () => {
  beforeEach(() => {
    getRateLimitedCurrentUser.mockReset(); getPrisma.mockReset(); updateCourtSlot.mockReset();
  });

  it("uses the authenticated operator and server-validates a draft update", async () => {
    const prisma = { courtSlot: {} };
    getRateLimitedCurrentUser.mockResolvedValue({ id: "operator-user-id" });
    getPrisma.mockReturnValue(prisma);
    updateCourtSlot.mockResolvedValue({ id: slotId, status: "DRAFT" });

    const response = await PATCH(new Request(`http://localhost/api/v1/operator/slots/${slotId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...validBody, ownerUserId: "attacker-id" }) }), { params: Promise.resolve({ slotId }) });

    expect(response.status).toBe(200);
    expect(updateCourtSlot).toHaveBeenCalledWith(prisma, { id: "operator-user-id" }, slotId, validBody);
  });

  it("rejects a missing version before the domain service can update a slot", async () => {
    getRateLimitedCurrentUser.mockResolvedValue({ id: "operator-user-id" });

    const response = await PATCH(new Request(`http://localhost/api/v1/operator/slots/${slotId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...validBody, expectedVersion: 0 }) }), { params: Promise.resolve({ slotId }) });

    expect(response.status).toBe(422);
    expect(updateCourtSlot).not.toHaveBeenCalled();
  });
});

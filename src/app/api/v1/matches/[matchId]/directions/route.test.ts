import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/server/domain/profile-service";
const mocks = vi.hoisted(() => ({ getRateLimitedCurrentUser: vi.fn(), getPrisma: vi.fn(), getOnboardedViewer: vi.fn(), getMatchDetail: vi.fn(), getKakaoDirections: vi.fn() }));
vi.mock("@/server/auth/current-user", () => ({ getRateLimitedCurrentUser: mocks.getRateLimitedCurrentUser, AuthenticationError: class extends Error {}, AccountAccessError: class extends Error {} }));
vi.mock("@/server/db/prisma", () => ({ getPrisma: mocks.getPrisma }));
vi.mock("@/server/domain/match-service", () => ({ getOnboardedViewer: mocks.getOnboardedViewer, getMatchDetail: mocks.getMatchDetail }));
vi.mock("@/server/integrations/kakao-directions", () => ({ getKakaoDirections: mocks.getKakaoDirections }));
import { GET } from "./route";
import { AuthenticationError } from "@/server/auth/current-user";
const call = () => GET(new Request("http://localhost/api/v1/matches/match-id/directions?address=ignored"), { params: Promise.resolve({ matchId: "match-id" }) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getPrisma.mockReturnValue({});
  mocks.getRateLimitedCurrentUser.mockResolvedValue({ id: "user" });
  mocks.getOnboardedViewer.mockResolvedValue({ id: "user" });
  mocks.getMatchDetail.mockResolvedValue({ court: { source: "EXTERNAL_RESERVED", name: "코트", address: "저장된 주소" }, settlementAccount: { accountNumber: "private" } });
  mocks.getKakaoDirections.mockResolvedValue("https://map.kakao.com/link/to/court,37,127");
});
describe("match directions route", () => {
  it("returns only a destination URL based on the authorized stored court", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ href: "https://map.kakao.com/link/to/court,37,127" });
    expect(mocks.getMatchDetail).toHaveBeenCalledWith({}, { id: "user" }, "match-id");
    expect(mocks.getKakaoDirections).toHaveBeenCalledWith("코트", "저장된 주소");
  });
  it("rejects unauthenticated requests before querying the court or provider", async () => {
    mocks.getRateLimitedCurrentUser.mockRejectedValue(new AuthenticationError());
    expect((await call()).status).toBe(401);
    expect(mocks.getMatchDetail).not.toHaveBeenCalled();
    expect(mocks.getKakaoDirections).not.toHaveBeenCalled();
  });
  it("honors match access denial", async () => {
    mocks.getMatchDetail.mockRejectedValue(new DomainError("FORBIDDEN", 403, "권한 없음"));
    expect((await call()).status).toBe(403);
    expect(mocks.getKakaoDirections).not.toHaveBeenCalled();
  });
  it("does not geocode legacy courts without a location", async () => {
    mocks.getMatchDetail.mockResolvedValue({ court: { source: "COURT_TBD", name: null, address: null } });
    expect((await call()).status).toBe(422);
    expect(mocks.getKakaoDirections).not.toHaveBeenCalled();
  });
});

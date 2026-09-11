import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), findUnique: vi.fn(), rateLimit: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/db/prisma", () => ({ getPrisma: () => ({ user: { findUnique: mocks.findUnique } }) }));
vi.mock("@/server/http/api-rate-limit-service", () => ({ enforceApiRateLimit: mocks.rateLimit }));
import { AccountAccessError, AuthenticationError, getCurrentUser, getRateLimitedTransactionUser } from "./current-user";
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "owner" } }); });
describe("비활성 계정의 제한 인증", () => {
  it.each(["WITHDRAWN", "SUSPENDED"])("%s는 일반 서비스에 접근하지 못하고 별도 거래 인증만 허용한다", async (status) => {
    mocks.findUnique.mockResolvedValue({ id: "owner", status });
    await expect(getCurrentUser()).rejects.toBeInstanceOf(AccountAccessError);
    await expect(getRateLimitedTransactionUser()).resolves.toEqual({ id: "owner", status });
    expect(mocks.rateLimit).toHaveBeenCalledWith(expect.anything(), "owner");
  });
  it("로그인하지 않았으면 거래 접근도 허용하지 않는다", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(getRateLimitedTransactionUser()).rejects.toBeInstanceOf(AuthenticationError);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it("현재 DB에 없는 계정은 이전 세션만으로 접근할 수 없다", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(getRateLimitedTransactionUser()).rejects.toBeInstanceOf(AuthenticationError);
  });
});

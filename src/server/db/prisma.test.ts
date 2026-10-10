import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ adapter: vi.fn(), constructed: vi.fn() }));
vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: class {
    constructor(options: unknown) { mocks.constructed(options); }
  },
}));
vi.mock("./prisma-adapter", () => ({ createPrismaPg: mocks.adapter }));
vi.mock("@/server/env", () => ({ getDatabaseUrl: () => "postgresql://fixture.invalid/test" }));

const shared = globalThis as typeof globalThis & { prisma?: unknown };
let previous: unknown;
beforeEach(() => {
  previous = shared.prisma;
  delete shared.prisma;
  vi.resetModules();
  vi.clearAllMocks();
  mocks.adapter.mockReturnValue({});
});
afterEach(() => {
  shared.prisma = previous;
  vi.unstubAllEnvs();
});

describe("Prisma connection reuse", () => {
  it.each(["production", "development"])("creates one pool for repeated calls in %s", async (environment) => {
    vi.stubEnv("NODE_ENV", environment);
    const { getPrisma } = await import("./prisma");
    const first = getPrisma();
    expect(getPrisma()).toBe(first);
    expect(getPrisma()).toBe(first);
    expect(mocks.adapter).toHaveBeenCalledTimes(1);
    expect(mocks.constructed).toHaveBeenCalledTimes(1);
  });

  it("reuses an existing client after a module reload", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const first = (await import("./prisma")).getPrisma();
    vi.resetModules();
    expect((await import("./prisma")).getPrisma()).toBe(first);
    expect(mocks.constructed).toHaveBeenCalledTimes(1);
  });

  it("can retry when client construction fails", async () => {
    mocks.adapter.mockImplementationOnce(() => { throw new Error("temporary configuration failure"); });
    const { getPrisma } = await import("./prisma");
    expect(() => getPrisma()).toThrow("temporary configuration failure");
    expect(shared.prisma).toBeUndefined();
    expect(getPrisma()).toBe(getPrisma());
    expect(mocks.constructed).toHaveBeenCalledTimes(1);
  });
});

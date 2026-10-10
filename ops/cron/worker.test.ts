import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "./worker";

const secret = "test-only-".repeat(5);
const controller = () => ({ scheduledTime: 1_790_000_000_000, noRetry: vi.fn() });

describe("free lifecycle scheduler", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("calls only the production lifecycle API and waits for a confirmed result", async () => {
    fetchMock.mockResolvedValue(Response.json({ status: "ok", privateField: "must-not-log" }));
    const event = controller();
    await worker.scheduled(event, { RECONCILE_CRON_SECRET: secret });
    expect(event.noRetry).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("https://tennis-mate-ochre.vercel.app/api/cron/reconcile-matches", expect.objectContaining({ redirect: "manual", cache: "no-store", signal: expect.any(AbortSignal), headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" } }));
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("must-not-log");
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(secret);
  });

  it.each([undefined, "", "short", " ".repeat(40)])("fails before sending a missing or invalid secret", async (value) => {
    await expect(worker.scheduled(controller(), { RECONCILE_CRON_SECRET: value })).rejects.toThrow("configuration");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([301, 302, 401, 403, 429, 500, 504])("marks HTTP %i as failure without retrying or following redirects", async (status) => {
    fetchMock.mockResolvedValue(new Response("private error details", { status, headers: { Location: "https://example.com" } }));
    await expect(worker.scheduled(controller(), { RECONCILE_CRON_SECRET: secret })).rejects.toThrow("http_status");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(console.info).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private error");
  });

  it.each(["<html>login</html>", '{"status":"error"}', "null", "{}"])("does not mistake a 200 response for completed work (%s)", async (body) => {
    fetchMock.mockResolvedValue(new Response(body));
    await expect(worker.scheduled(controller(), { RECONCILE_CRON_SECRET: secret })).rejects.toThrow("invalid_result");
    expect(console.info).not.toHaveBeenCalled();
  });

  it.each([new Error(secret), new DOMException("Timed out", "TimeoutError")])("records network failure without logging raw errors or credentials", async (error) => {
    fetchMock.mockRejectedValue(error);
    await expect(worker.scheduled(controller(), { RECONCILE_CRON_SECRET: secret })).rejects.toThrow("network_or_timeout");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(secret);
  });
});

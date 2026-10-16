import { describe, expect, it } from "vitest";
import { detectClientEnvironment, getClientEnvironment } from "./client-environment";

describe("client environment presentation hints", () => {
  const base = { userAgent: "", platform: "", maxTouchPoints: 0 };
  it.each([
    ["iPhone Safari", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Safari/604.1" }, "ios"],
    ["iPhone Chrome", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/130.0 Mobile/15E148 Safari/604.1" }, "ios"],
    ["iPad desktop mode", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1", platform: "MacIntel", maxTouchPoints: 5 }, "ios"],
    ["Mac Safari", { platform: "MacIntel", maxTouchPoints: 0 }, "macos"],
    ["Android Chrome", { userAgent: "Mozilla/5.0 (Linux; Android 14; SM-T733) Chrome/130.0 Safari/537.36", platform: "Linux aarch64", maxTouchPoints: 5 }, "android"],
    ["Samsung Internet", { userAgent: "Mozilla/5.0 (Linux; Android 14) SamsungBrowser/27.0 Chrome/125.0 Safari/537.36" }, "android"],
    ["Windows touch PC", { userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0", platform: "Win32", maxTouchPoints: 10 }, "other"],
    ["Linux", { platform: "Linux x86_64" }, "other"],
  ] as const)("recognizes %s without screen-width guesses", (_name, hints, os) => {
    expect(detectClientEnvironment({ ...base, ...hints })).toEqual({ os, runtime: "browser" });
  });
  it("prefers the native bridge over a desktop-mode user agent", () => {
    expect(detectClientEnvironment({ ...base, platform: "MacIntel", maxTouchPoints: 5, nativePlatform: "android" })).toEqual({ os: "android", runtime: "native" });
    expect(detectClientEnvironment({ ...base, nativePlatform: "ios" })).toEqual({ os: "ios", runtime: "native" });
  });
  it("recognizes the installed prototype before the bridge is available", () => {
    expect(detectClientEnvironment({ ...base, userAgent: "Android 14 RallyOnNativePrototype/0.0.1", standalone: true })).toEqual({ os: "android", runtime: "native" });
  });
  it("keeps home-screen web apps separate from native apps", () => {
    expect(detectClientEnvironment({ ...base, userAgent: "iPhone", standalone: true, nativePlatform: "web" })).toEqual({ os: "ios", runtime: "standalone" });
  });
  it("does not access browser globals during server rendering", () => {
    expect(getClientEnvironment()).toEqual({ os: "other", runtime: "browser" });
  });
});

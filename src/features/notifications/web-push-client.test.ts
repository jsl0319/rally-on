import { afterEach, describe, expect, it, vi } from "vitest";
import { pushEnvironment } from "./web-push-client";

afterEach(() => vi.unstubAllGlobals());
function browser({ userAgent = "Android Chrome", platform = "Linux", touch = 5, standalone = false, nativePlatform, supported = true }: {
  userAgent?: string; platform?: string; touch?: number; standalone?: boolean; nativePlatform?: string; supported?: boolean;
} = {}) {
  vi.stubGlobal("navigator", { userAgent, platform, maxTouchPoints: touch, serviceWorker: {} });
  vi.stubGlobal("window", {
    isSecureContext: true, matchMedia: () => ({ matches: standalone }),
    ...(supported ? { PushManager: {}, Notification: {} } : {}),
    ...(nativePlatform ? { Capacitor: { getPlatform: () => nativePlatform } } : {}),
  });
}
describe("web push guidance", () => {
  it("does not offer web push inside an Android app even if browser APIs exist", () => {
    browser({ nativePlatform: "android" });
    expect(pushEnvironment()).toBe("native-android");
  });
  it("gives the iOS app its own installation guidance", () => {
    browser({ nativePlatform: "ios" });
    expect(pushEnvironment()).toBe("native-ios");
  });
  it("does not call an unidentified native environment an iPhone", () => {
    browser({ userAgent: "RallyOnNativePrototype/0.0.1", platform: "", touch: 0 });
    expect(pushEnvironment()).toBe("native");
  });
  it("guides iPad desktop-mode browsers to home-screen installation", () => {
    browser({ userAgent: "Macintosh Safari", platform: "MacIntel" });
    expect(pushEnvironment()).toBe("install");
  });
  it("allows a capable iPad home-screen web app", () => {
    browser({ userAgent: "Macintosh Safari", platform: "MacIntel", standalone: true });
    expect(pushEnvironment()).toBe("supported");
  });
  it("checks actual capabilities in Android and desktop browsers", () => {
    browser(); expect(pushEnvironment()).toBe("supported");
    browser({ supported: false }); expect(pushEnvironment()).toBe("unsupported");
    browser({ userAgent: "Macintosh Safari", platform: "MacIntel", touch: 0 });
    expect(pushEnvironment()).toBe("supported");
    vi.stubGlobal("window", { ...window, isSecureContext: false });
    expect(pushEnvironment()).toBe("unsupported");
  });
  it("does not promise support merely because the web app is installed", () => {
    browser({ userAgent: "iPhone", standalone: true, supported: false });
    expect(pushEnvironment()).toBe("unsupported");
  });
});

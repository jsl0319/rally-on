export type ClientEnvironment = {
  os: "ios" | "android" | "macos" | "other";
  runtime: "native" | "standalone" | "browser";
};

type EnvironmentHints = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  nativePlatform?: string;
  native?: boolean;
  standalone?: boolean;
};

/** Presentation hints only. Never use device detection for authentication or permissions. */
export function detectClientEnvironment(hints: EnvironmentHints): ClientEnvironment {
  const { userAgent, platform, maxTouchPoints, nativePlatform } = hints;
  const nativeOs = nativePlatform === "ios" || nativePlatform === "android" ? nativePlatform : null;
  const os = nativeOs ?? (/Android/i.test(userAgent) ? "android"
    : /iPhone|iPad|iPod/i.test(userAgent) || (/Mac/i.test(platform || userAgent) && maxTouchPoints > 1) ? "ios"
    : /Mac/i.test(platform || userAgent) ? "macos" : "other");
  const native = nativeOs !== null || hints.native || /RallyOnNativePrototype/.test(userAgent);
  return { os, runtime: native ? "native" : hints.standalone ? "standalone" : "browser" };
}

export function getClientEnvironment(): ClientEnvironment {
  if (typeof window === "undefined") return { os: "other", runtime: "browser" };
  const capacitor = (window as Window & { Capacitor?: { getPlatform?: () => string; isNativePlatform?: () => boolean } }).Capacitor;
  return detectClientEnvironment({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    nativePlatform: capacitor?.getPlatform?.(),
    native: capacitor?.isNativePlatform?.(),
    standalone: window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
  });
}

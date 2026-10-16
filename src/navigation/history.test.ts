import { describe, expect, it } from "vitest";
import { canReturnWithinApp, isAppScreen, readEntry } from "./history";

describe("앱 뒤로가기 경계", () => {
  const entry = { session: "current", key: "entry", path: "/activity/sent", back: true, y: 500 };
  it("이 앱이 기록한 같은 로그인 구간에서만 이전 화면으로 간다", () => {
    expect(canReturnWithinApp({ rallyNavigation: entry }, "current")).toBe(true);
    expect(canReturnWithinApp({ rallyNavigation: entry }, "after-logout")).toBe(false);
    expect(canReturnWithinApp({ rallyNavigation: { ...entry, back: false } }, "current")).toBe(false);
    expect(canReturnWithinApp({ length: 10 }, "current")).toBe(false);
  });
  it("인증 화면과 외부 주소는 앱 복귀 대상으로 사용하지 않는다", () => {
    for (const path of ["/login", "/login?returnTo=/my", "/api/auth/callback/kakao", "/my/notifications/open/id", "//evil.test", "/\\evil.test", "https://evil.test"]) expect(isAppScreen(path)).toBe(false);
    for (const path of ["/", "/my/notifications", "/partner-sessions?sort=priceLow", "/chats/123"]) expect(isAppScreen(path)).toBe(true);
  });
  it("깨진 기록과 음수 스크롤 위치를 복원하지 않는다", () => {
    for (const value of [null, {}, { rallyNavigation: {} }, { rallyNavigation: { ...entry, y: -1 } }, { rallyNavigation: { ...entry, y: NaN } }]) expect(readEntry(value)).toBe(null);
  });
});

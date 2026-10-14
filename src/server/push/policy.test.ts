import { describe, expect, it } from "vitest";
import { isPushEndpoint, pushPayload, safeNotificationHref, subscriptionInput } from "./policy";

describe("web push trust boundaries", () => {
  it("accepts only HTTPS browser-provider endpoints", () => {
    for (const url of ["https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/abc", "https://web.push.apple.com/abc"]) expect(isPushEndpoint(url)).toBe(true);
    for (const url of ["http://fcm.googleapis.com/a", "https://fcm.googleapis.com.evil.test/a", "https://127.0.0.1/a", "https://169.254.169.254/a", "https://user:pass@web.push.apple.com/a", "https://web.push.apple.com:444/a", "file:///a"]) expect(isPushEndpoint(url)).toBe(false);
  });
  it("validates key size and never accepts caller-selected user identity", () => {
    const valid = { endpoint: "https://web.push.apple.com/a", keys: { p256dh: "B" + "a".repeat(86), auth: "a".repeat(22) } };
    expect(subscriptionInput.safeParse(valid).success).toBe(true);
    expect(subscriptionInput.safeParse({ ...valid, userId: "other" }).success).toBe(false);
    expect(subscriptionInput.safeParse({ ...valid, keys: { ...valid.keys, auth: "short" } }).success).toBe(false);
  });
  it("payload contains no original title, body or personal information", () => {
    expect(pushPayload("id", "device")).toEqual({ version: 1, notificationId: "id", subscriptionId: "device", title: "랠리온", body: "새 알림이 있어요. 앱에서 확인해 주세요.", href: "/my/notifications/open/id" });
  });
  it("does not redirect notification clicks outside protected app paths", () => {
    for (const value of ["https://evil.test", "//evil.test", "/my\\evil", "/login?returnTo=evil", "/api/auth/signout", "/my/../../api/auth/signout", null]) expect(safeNotificationHref(value)).toBe("/my/notifications");
    expect(safeNotificationHref("/partner-sessions/abc")).toBe("/partner-sessions/abc");
  });
});

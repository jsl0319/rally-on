import { describe, expect, it } from "vitest";
import { activityScope, activityUnreadCounts } from "./activity";

describe("내 활동의 새 소식", () => {
  it("종류와 이동 경로로 신청자와 운영자 소식을 구분한다", () => {
    expect(activityScope({ type: "APPLICATION_RECEIVED", href: "/activity/received/abc-123" })).toBe("received");
    expect(activityScope({ type: "APPLICATION_RECEIVED", href: "/partner/court-matches/abc-123" })).toBe("received");
    expect(activityScope({ type: "COURT_MATCH_CONFIRMED", href: "/partner-sessions/abc-123" })).toBe("sent");
    expect(activityScope({ type: "COURT_MATCH_CANCELLED", href: "/partner/court-matches/abc-123" })).toBeNull();
    expect(activityScope({ type: "COURT_MATCH_CONFIRMED", href: "https://example.com/partner-sessions/abc-123" })).toBeNull();
  });
  it("목록에 없는 상세 거래·문의 안내는 확인하지 않은 상태로 남긴다", () => {
    for (const type of ["COURT_BALLS_MISSING_RECORDED", "COURT_REFUND_AGREEMENT_RECORDED", "SUPPORT_INQUIRY_REPLIED"]) {
      expect(activityScope({ type, href: "/partner-sessions/abc-123" })).toBeNull();
    }
    expect(activityUnreadCounts([
      { type: "APPLICATION_ACCEPTED", href: "/activity/sent" },
      { type: "APPLICATION_RECEIVED", href: "/activity/received/abc-123" },
      { type: "SUPPORT_INQUIRY_REPLIED", href: "/support/inquiry" },
    ])).toEqual({ sent: 1, received: 1 });
  });
});

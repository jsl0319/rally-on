import { describe, expect, it, vi } from "vitest";

import { recordApplicationNotification, recordApplicationNotifications } from "./notification-service";

/**
 * 알림을 꺼 둔 사람에게 무엇까지 전할 것인가.
 *
 * 이 경계가 무너지면 입금 기한이 지나 자리를 잃거나 매칭이 취소된 것을 모르는 사람이
 * 생긴다. 반대로 모든 것을 강제로 보내면 설정이 거짓말이 된다.
 */
function makeTransaction(matchNotificationsEnabled: boolean) {
  return {
    user: {
      findUnique: vi.fn().mockResolvedValue({ matchNotificationsEnabled }),
      findMany: vi.fn().mockImplementation(({ where }: { where: { matchNotificationsEnabled?: boolean } }) =>
        Promise.resolve(where.matchNotificationsEnabled === true && !matchNotificationsEnabled ? [] : [{ id: "user-1" }])),
    },
    notification: { create: vi.fn(), createMany: vi.fn() },
  };
}

type Transaction = Parameters<typeof recordApplicationNotification>[0];

describe("알림 수신 설정의 경계", () => {
  it("알림을 꺼도 매칭 취소는 전한다", async () => {
    const transaction = makeTransaction(false);
    await recordApplicationNotification(transaction as unknown as Transaction, {
      recipientUserId: "user-1", type: "MATCH_CANCELLED", matchTitle: "망원 한강공원 테니스장", href: "/activity/sent",
    });
    expect(transaction.notification.create).toHaveBeenCalledTimes(1);
  });

  it("알림을 꺼도 참가비와 환불 안내는 전한다", async () => {
    const transaction = makeTransaction(false);
    for (const type of ["COURT_MATCH_DEPOSIT_REQUIRED", "COURT_MATCH_DEPOSIT_EXPIRED", "COURT_MATCH_REFUND_COMPLETED"] as const) {
      await recordApplicationNotification(transaction as unknown as Transaction, {
        recipientUserId: "user-1", type, matchTitle: "준비된 테니스장", href: "/activity/sent",
      });
    }
    expect(transaction.notification.create).toHaveBeenCalledTimes(3);
  });

  it("알림을 끄면 신청 진행 소식은 전하지 않는다", async () => {
    const transaction = makeTransaction(false);
    for (const type of ["APPLICATION_RECEIVED", "APPLICATION_ACCEPTED", "APPLICATION_REJECTED", "MATCH_CLOSED"] as const) {
      await recordApplicationNotification(transaction as unknown as Transaction, {
        recipientUserId: "user-1", type, matchTitle: "망원 한강공원 테니스장", href: "/activity/sent",
      });
    }
    expect(transaction.notification.create).not.toHaveBeenCalled();
  });

  it("알림을 켜 두면 소식도 그대로 전한다", async () => {
    const transaction = makeTransaction(true);
    await recordApplicationNotification(transaction as unknown as Transaction, {
      recipientUserId: "user-1", type: "APPLICATION_ACCEPTED", matchTitle: "망원 한강공원 테니스장", href: "/activity/sent",
    });
    expect(transaction.notification.create).toHaveBeenCalledTimes(1);
  });

  it("여러 명에게 한 번에 보낼 때도 같은 경계를 지킨다", async () => {
    const cancelled = makeTransaction(false);
    await recordApplicationNotifications(cancelled as unknown as Transaction, {
      recipientUserIds: ["user-1"], type: "MATCH_CANCELLED", matchTitle: "망원 한강공원 테니스장", href: "/activity/sent",
    });
    // 거래·취소 안내는 수신 설정으로 거르지 않는다.
    expect(cancelled.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["user-1"] } },
    }));
    expect(cancelled.notification.createMany).toHaveBeenCalledTimes(1);

    const closed = makeTransaction(false);
    await recordApplicationNotifications(closed as unknown as Transaction, {
      recipientUserIds: ["user-1"], type: "MATCH_CLOSED", matchTitle: "망원 한강공원 테니스장", href: "/activity/sent",
    });
    expect(closed.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["user-1"] }, matchNotificationsEnabled: true },
    }));
    expect(closed.notification.createMany).not.toHaveBeenCalled();
  });
});

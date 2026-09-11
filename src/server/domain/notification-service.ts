import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

import { buildNotificationContent, type NotificationType } from "@/server/domain/notification";

type Transaction = Prisma.TransactionClient;

/**
 * Writes an in-app notification for a match application event, unless the
 * recipient has turned match notifications off. Best-effort: called from
 * inside the domain transaction that owns the state change, but a missing
 * recipient (should not happen) never blocks the underlying action.
 */
export async function recordApplicationNotification(
  transaction: Transaction,
  input: { recipientUserId: string; type: NotificationType; matchTitle: string; href: string },
) {
  const recipient = await transaction.user.findUnique({
    where: { id: input.recipientUserId },
    select: { matchNotificationsEnabled: true },
  });
  if (!recipient || !recipient.matchNotificationsEnabled) return;

  const { title, body } = buildNotificationContent(input.type, input.matchTitle);
  await transaction.notification.create({
    data: { userId: input.recipientUserId, type: input.type, title, body, href: input.href },
  });
}

/**
 * 같은 사건을 여러 사람에게 한 번에 알린다.
 *
 * 매칭 취소·모집 마감처럼 신청이 한꺼번에 정리되는 경로에서 쓴다. 한 명씩
 * `recordApplicationNotification`을 부르면 수신자 수만큼 질의가 트랜잭션 안에서
 * 늘어난다. 알림을 끈 사람은 조회 한 번으로 걸러 내고 쓰기도 한 번에 끝낸다.
 */
export async function recordApplicationNotifications(
  transaction: Transaction,
  input: { recipientUserIds: string[]; type: NotificationType; matchTitle: string; href: string },
) {
  const recipientUserIds = [...new Set(input.recipientUserIds)];
  if (recipientUserIds.length === 0) return;

  const recipients = await transaction.user.findMany({
    where: { id: { in: recipientUserIds }, matchNotificationsEnabled: true },
    select: { id: true },
  });
  if (recipients.length === 0) return;

  const { title, body } = buildNotificationContent(input.type, input.matchTitle);
  await transaction.notification.createMany({
    data: recipients.map(({ id }) => ({ userId: id, type: input.type, title, body, href: input.href })),
  });
}

/** 읽지 않은 알림 수만 센다. 목록까지 불러오지 않아 배지용으로 가볍다. */
export function countUnreadNotifications(prisma: PrismaClient, userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function getMyNotifications(prisma: PrismaClient, userId: string) {
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  return {
    unreadCount,
    items: items.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      body: item.body,
      href: item.href,
      read: item.readAt !== null,
      createdAt: item.createdAt.toISOString(),
    })),
  };
}

export async function markNotificationsRead(prisma: PrismaClient, userId: string, ids?: string[]) {
  const readAt = new Date();
  await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt },
  });
  return getMyNotifications(prisma, userId);
}

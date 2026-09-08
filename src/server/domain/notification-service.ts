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

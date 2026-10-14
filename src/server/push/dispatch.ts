import { randomUUID } from "node:crypto";
import webpush from "web-push";
import type { PrismaClient } from "@/generated/prisma/client";
import { isPushEndpoint, pushConfig, pushPayload } from "./policy";

const DAY = 86_400_000;
type Send = typeof webpush.sendNotification;

// Work is created only from committed in-app notifications. No provider I/O in a business transaction.
export async function dispatchPush(prisma: PrismaClient, send: Send = webpush.sendNotification, now = new Date()) {
  const config = pushConfig();
  if (!config) return { enabled: false, accepted: 0, failed: 0, retried: 0 };
  await prisma.$transaction(async (tx) => {
    const lock = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(8141401) AS locked`;
    if (!lock[0]?.locked) return;
    await tx.notification.updateMany({ where: { pushQueuedAt: null, createdAt: { lt: new Date(+now - DAY) } }, data: { pushQueuedAt: now } });
    const notifications = await tx.notification.findMany({ where: { pushQueuedAt: null }, orderBy: { createdAt: "asc" }, take: 50 });
    for (const notification of notifications) {
      const subscriptions = notification.readAt ? [] : await tx.pushSubscription.findMany({
        where: { userId: notification.userId, createdAt: { lte: notification.createdAt }, expiresAt: { gt: now }, user: { status: "ACTIVE" } }, select: { id: true },
      });
      if (subscriptions.length) await tx.pushDelivery.createMany({ data: subscriptions.map((subscription) => ({ notificationId: notification.id, subscriptionId: subscription.id, nextAttemptAt: now })), skipDuplicates: true });
      await tx.notification.update({ where: { id: notification.id }, data: { pushQueuedAt: now } });
    }
  }, { timeout: 10000 });
  const jobs = await prisma.pushDelivery.findMany({ where: { finishedAt: null, nextAttemptAt: { lte: now } }, orderBy: { nextAttemptAt: "asc" }, take: 20, select: { id: true } });
  const result = { enabled: true, accepted: 0, failed: 0, retried: 0 };
  // Four concurrent sends, each with a bounded timeout; at most 20 attempts per invocation.
  for (let offset = 0; offset < jobs.length; offset += 4) {
    await Promise.all(jobs.slice(offset, offset + 4).map(async ({ id }) => {
      const leaseToken = randomUUID();
      const claimed = await prisma.pushDelivery.updateMany({ where: { id, finishedAt: null, nextAttemptAt: { lte: now } }, data: { leaseToken, nextAttemptAt: new Date(+now + 120_000), attempts: { increment: 1 } } });
      if (!claimed.count) return;
      const job = await prisma.pushDelivery.findUnique({ where: { id }, include: { subscription: { include: { user: { select: { status: true } } } }, notification: true } });
      if (!job) return;
      const finish = (outcome: string) => prisma.pushDelivery.updateMany({ where: { id, leaseToken }, data: { outcome, finishedAt: new Date(), leaseToken: null } });
      if (job.subscription.userId !== job.notification.userId || job.subscription.user.status !== "ACTIVE" || job.subscription.expiresAt <= now || job.notification.readAt || +job.notification.createdAt < +now - DAY || job.attempts > 4 || !isPushEndpoint(job.subscription.endpoint)) {
        await finish("skipped"); return;
      }
      try {
        await send({ endpoint: job.subscription.endpoint, keys: { p256dh: job.subscription.p256dh, auth: job.subscription.authKey } }, JSON.stringify(pushPayload(job.notificationId, job.subscriptionId)), { vapidDetails: config, TTL: 3600, urgency: "normal", timeout: 5000 });
        await finish("accepted"); result.accepted++;
      } catch (error) {
        // Only status codes are inspected. Provider errors contain endpoint/keys; never log them.
        const status = error && typeof error === "object" && "statusCode" in error ? Number(error.statusCode) : 0;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.deleteMany({ where: { id: job.subscriptionId } }); result.failed++;
        } else if (job.attempts >= 4 || (status >= 400 && status < 500 && status !== 429)) {
          await finish("failed"); result.failed++;
        } else {
          await prisma.pushDelivery.updateMany({ where: { id, leaseToken }, data: { leaseToken: null, outcome: "retry", nextAttemptAt: new Date(+now + 60_000 * 5 * 2 ** (job.attempts - 1)) } }); result.retried++;
        }
      }
    }));
  }
  return result;
}
export async function cleanupPush(prisma: PrismaClient, now = new Date()) {
  await prisma.pushSubscription.deleteMany({ where: { OR: [{ expiresAt: { lte: now } }, { user: { status: { not: "ACTIVE" } } }] } });
  await prisma.pushDelivery.deleteMany({ where: { createdAt: { lt: new Date(+now - 7 * DAY) } } });
}

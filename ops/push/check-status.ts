import { config } from "dotenv";
import { getPrisma } from "../../src/server/db/prisma";
import { pushConfig } from "../../src/server/push/policy";
config({ path: ".env.local", quiet: true });
const prisma = getPrisma();
try {
  const now = new Date();
  const [subscriptions, pending, overdue, failed, accepted] = await Promise.all([
    prisma.pushSubscription.count({ where: { expiresAt: { gt: now }, user: { status: "ACTIVE" } } }),
    prisma.pushDelivery.count({ where: { finishedAt: null } }),
    prisma.notification.count({ where: { pushQueuedAt: null, createdAt: { lt: new Date(+now - 20 * 60_000), gt: new Date(+now - 86_400_000) } } }),
    prisma.pushDelivery.count({ where: { outcome: "failed", createdAt: { gt: new Date(+now - 86_400_000) } } }),
    prisma.pushDelivery.count({ where: { outcome: "accepted", createdAt: { gt: new Date(+now - 86_400_000) } } }),
  ]);
  console.log({ enabled: Boolean(pushConfig()), subscriptions, pending, overdueUnqueued: overdue, failed24h: failed, providerAccepted24h: accepted });
} catch {
  console.error("Push status lookup failed. Check the selected database and migration state."); process.exitCode = 1;
} finally { await prisma.$disconnect(); }

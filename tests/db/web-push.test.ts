import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { createPrismaPg } from "../../src/server/db/prisma-adapter";
import { requireE2eDatabaseUrl } from "../e2e/e2e-environment";
import { cleanupPush, dispatchPush } from "@/server/push/dispatch";
const databaseUrl = process.env.E2E_DATABASE_URL?.trim() ? requireE2eDatabaseUrl() : null;

describe.skipIf(!databaseUrl)("web push committed outbox · actual DB", () => {
  let db: PrismaClient;
  const now = new Date("2026-10-14T00:00:00Z");
  beforeAll(() => {
    db = new PrismaClient({ adapter: createPrismaPg(databaseUrl!) });
    vi.stubEnv("WEB_PUSH_ENABLED", "true"); vi.stubEnv("WEB_PUSH_PUBLIC_KEY", "test-public"); vi.stubEnv("WEB_PUSH_PRIVATE_KEY", "test-private"); vi.stubEnv("WEB_PUSH_SUBJECT", "mailto:push@example.test");
  });
  afterAll(async () => { await db?.$disconnect(); vi.unstubAllEnvs(); });
  beforeEach(async () => { await db.$executeRawUnsafe('TRUNCATE TABLE "users" CASCADE'); });
  async function fixture() {
    const user = await db.user.create({ data: { nickname: "푸시테스트" } });
    const subscription = await db.pushSubscription.create({ data: { userId: user.id, deviceHash: "a".repeat(64), endpoint: "https://web.push.apple.com/test", p256dh: "B" + "a".repeat(86), authKey: "a".repeat(22), createdAt: new Date(+now - 60_000), expiresAt: new Date(+now + 86_400_000) } });
    const notification = await db.notification.create({ data: { userId: user.id, type: "COURT_MATCH_CONFIRMED", title: "private title", body: "private bank account", href: "/activity/sent", createdAt: now } });
    return { user, subscription, notification };
  }
  const sender = () => vi.fn().mockResolvedValue({ statusCode: 201, body: "", headers: {} });

  it("concurrent dispatch creates a single job and a single provider call", async () => {
    await fixture(); const send = sender();
    await Promise.all([dispatchPush(db, send, now), dispatchPush(db, send, now)]);
    await dispatchPush(db, send, now);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).not.toContain("private");
    expect(await db.pushDelivery.count({ where: { outcome: "accepted" } })).toBe(1);
  });
  it("rolled back events never send, and newly registered devices do not receive history", async () => {
    const { user, subscription, notification } = await fixture();
    await db.notification.delete({ where: { id: notification.id } });
    await expect(db.$transaction(async tx => {
      await tx.notification.create({ data: { userId: user.id, type: "PUSH_TEST", title: "rollback", body: "rollback", createdAt: now } });
      throw new Error("rollback");
    })).rejects.toThrow("rollback");
    await db.notification.create({ data: { userId: user.id, type: "PUSH_TEST", title: "old", body: "old", createdAt: new Date(+subscription.createdAt - 1000) } });
    const send = sender(); await dispatchPush(db, send, now); expect(send).not.toHaveBeenCalled();
  });
  it("temporary provider failure retries without changing the original event", async () => {
    const { notification } = await fixture(); const send = sender().mockRejectedValueOnce({ statusCode: 503, body: "secret provider data" });
    await dispatchPush(db, send, now);
    expect(await db.pushDelivery.findFirst()).toMatchObject({ outcome: "retry", attempts: 1, finishedAt: null });
    await dispatchPush(db, send, new Date(+now + 301_000));
    expect(await db.pushDelivery.findFirst()).toMatchObject({ outcome: "accepted", attempts: 2 });
    expect((await db.notification.findUniqueOrThrow({ where: { id: notification.id } })).body).toBe("private bank account");
  });
  it("stops retrying after four attempts and removes expired browser subscriptions", async () => {
    await fixture(); const send = sender().mockRejectedValue({ statusCode: 503 });
    for (let i = 0; i < 5; i++) await dispatchPush(db, send, new Date(+now + i * 3_600_000));
    expect(send).toHaveBeenCalledTimes(4);
    expect(await db.pushDelivery.findFirst()).toMatchObject({ outcome: "failed", attempts: 4 });
    await db.pushDelivery.deleteMany(); await db.notification.updateMany({ data: { pushQueuedAt: null } });
    await dispatchPush(db, sender().mockRejectedValue({ statusCode: 410 }), now);
    expect(await db.pushSubscription.count()).toBe(0);
  });
  it("unsubscription, withdrawal, read events and ownership changes stop queued sends", async () => {
    const { user, subscription, notification } = await fixture();
    const send = sender().mockRejectedValueOnce({ statusCode: 503 });
    await dispatchPush(db, send, now);
    const other = await db.user.create({ data: { nickname: "다른회원" } });
    await db.pushSubscription.update({ where: { id: subscription.id }, data: { userId: other.id } });
    await dispatchPush(db, send, new Date(+now + 301_000));
    expect(send).toHaveBeenCalledTimes(1);
    expect(await db.pushDelivery.findFirst()).toMatchObject({ outcome: "skipped" });
    await db.pushSubscription.update({ where: { id: subscription.id }, data: { userId: user.id } });
    await db.pushDelivery.deleteMany(); await db.notification.update({ where: { id: notification.id }, data: { pushQueuedAt: null, readAt: now } });
    await dispatchPush(db, send, now); expect(send).toHaveBeenCalledTimes(1);
    await db.user.update({ where: { id: user.id }, data: { status: "WITHDRAWN" } });
    await cleanupPush(db, now); expect(await db.pushSubscription.count()).toBe(0);
  });
  it("recovers a worker crash after its lease expires", async () => {
    const { subscription, notification } = await fixture();
    await db.notification.update({ where: { id: notification.id }, data: { pushQueuedAt: now } });
    await db.pushDelivery.create({ data: { notificationId: notification.id, subscriptionId: subscription.id, leaseToken: randomUUID(), attempts: 1, nextAttemptAt: new Date(+now + 120_000) } });
    const send = sender(); await dispatchPush(db, send, now); expect(send).not.toHaveBeenCalled();
    await dispatchPush(db, send, new Date(+now + 121_000)); expect(send).toHaveBeenCalledTimes(1);
  });
});

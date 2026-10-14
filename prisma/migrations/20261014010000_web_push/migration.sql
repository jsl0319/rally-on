-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PUSH_TEST';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "push_queued_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_hash" VARCHAR(64) NOT NULL,
    "endpoint" VARCHAR(2048) NOT NULL,
    "p256dh" VARCHAR(100) NOT NULL,
    "auth_key" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_deliveries" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_token" UUID,
    "finished_at" TIMESTAMPTZ(6),
    "outcome" VARCHAR(24),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_device_hash_key" ON "push_subscriptions"("device_hash");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_expires_at_idx" ON "push_subscriptions"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "push_deliveries_finished_at_next_attempt_at_idx" ON "push_deliveries"("finished_at", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_deliveries_notification_id_subscription_id_key" ON "push_deliveries"("notification_id", "subscription_id");

-- CreateIndex
CREATE INDEX "notifications_push_queued_at_created_at_idx" ON "notifications"("push_queued_at", "created_at");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "push_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Historical notifications must not be replayed.
UPDATE "notifications" SET "push_queued_at" = CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "support_inquiry_messages" ADD COLUMN     "next_assignee_user_id" UUID,
ADD COLUMN     "previous_assignee_user_id" UUID;

-- CreateTable
CREATE TABLE "court_transaction_handoffs" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "assignee_user_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "court_transaction_handoffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "court_transaction_handoff_events" (
    "id" UUID NOT NULL,
    "handoff_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "previous_assignee_user_id" UUID,
    "client_request_id" UUID NOT NULL,
    "note" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "court_transaction_handoff_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "court_transaction_handoffs_match_id_key" ON "court_transaction_handoffs"("match_id");

-- CreateIndex
CREATE UNIQUE INDEX "court_transaction_handoff_events_handoff_id_client_request__key" ON "court_transaction_handoff_events"("handoff_id", "client_request_id");

-- AddForeignKey
ALTER TABLE "court_transaction_handoffs" ADD CONSTRAINT "court_transaction_handoffs_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_transaction_handoffs" ADD CONSTRAINT "court_transaction_handoffs_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_transaction_handoff_events" ADD CONSTRAINT "court_transaction_handoff_events_handoff_id_fkey" FOREIGN KEY ("handoff_id") REFERENCES "court_transaction_handoffs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_transaction_handoff_events" ADD CONSTRAINT "court_transaction_handoff_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

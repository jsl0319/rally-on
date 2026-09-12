-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "court_composition_passed_at" TIMESTAMPTZ(6),
ADD COLUMN     "court_composition_policy_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "court_composition_snapshot" JSONB;

-- CreateTable
CREATE TABLE "court_match_composition_cancellations" (
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "client_request_id" UUID NOT NULL,
    "note" VARCHAR(500) NOT NULL,
    "composition_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "court_match_composition_cancellations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "court_match_composition_cancellations_match_id_key" ON "court_match_composition_cancellations"("match_id");

-- AddForeignKey
ALTER TABLE "court_match_composition_cancellations" ADD CONSTRAINT "court_match_composition_cancellations_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "court_match_composition_cancellations" ADD CONSTRAINT "court_match_composition_cancellations_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

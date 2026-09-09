import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { getApplicationDeadline, getJudgementAt } from "@/server/domain/court-match";
import {
  applyToCourtMatch,
  claimCourtMatchDeposit,
  completeCourtMatchRefund,
  confirmCourtMatchDeposit,
  decideCourtMatchApplication,
  reconcileCourtMatch,
  submitCourtMatchRefundAccount,
} from "@/server/domain/court-match-service";
import { getCourtMatchParticipation, getOperatorCourtMatch } from "@/server/domain/court-match-view";
import { reportCourtSupplyIncident } from "@/server/domain/court-slot-service";
import { acceptApplication, cancelMatch } from "@/server/domain/match-service";
import { getProfile } from "@/server/domain/profile-service";

import { requireE2eDatabaseUrl } from "../e2e/e2e-environment";

/**
 * 전용 PostgreSQL에 직접 붙어 코트 매칭의 권한·상태 경계를 검증한다.
 * 단위 테스트의 모사와 달리 실제 행 잠금·커밋 순서를 확인한다(03-4 §6·§7).
 *
 * `E2E_DATABASE_URL`이 없으면 통째로 건너뛴다. 이 테스트는 users·regions를
 * TRUNCATE하므로 이름에 e2e가 들어간 전용 DB에서만 돈다.
 */
const databaseUrl = process.env.E2E_DATABASE_URL?.trim() ? requireE2eDatabaseUrl() : null;

const newClient = () => new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }) });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const HOUR = 60 * 60 * 1000;

describe.skipIf(!databaseUrl)("코트 매칭 · 실제 DB", () => {
  const prisma = newClient();

  afterAll(async () => { await prisma.$disconnect(); });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "users", "regions" RESTART IDENTITY CASCADE');
    await prisma.region.create({ data: { code: "DB-SEOUL", name: "DB 서울", shortName: "DB서울", type: "CITY", active: true } });
    await prisma.region.create({ data: { code: "DB-SEOUL-001", name: "DB 마포구", parentCode: "DB-SEOUL", type: "DISTRICT", active: true } });
  });

  async function makeUser(nickname: string, gender: "MALE" | "FEMALE") {
    const user = await prisma.user.create({
      data: {
        nickname, nicknameConfirmedAt: new Date(), onboardingCompletedAt: new Date(),
        tennisProfile: {
          create: {
            experienceRange: "MONTHS_6_TO_12", rallyLevel: "SHORT_RALLY", gameExperience: "KNOWS_RULES", gender,
            purposes: { create: { purpose: "RALLY_PRACTICE" } },
          },
        },
      },
    });
    const profile = await getProfile(prisma, user.id);
    return { id: user.id, gender, profile: profile!, viewer: { id: user.id, profile: profile! } };
  }

  type MatchOptions = {
    startsAt?: Date;
    approvalMode?: "AUTO" | "OPERATOR";
    minParticipantCount?: number;
    maxParticipantCount?: number;
    genderQuota?: boolean;
  };

  async function makeCourtMatch(operatorId: string, options: MatchOptions = {}) {
    const startsAt = options.startsAt ?? new Date(Date.now() + 10 * 24 * HOUR);
    const endsAt = new Date(startsAt.getTime() + 2 * HOUR);
    const max = options.maxParticipantCount ?? 2;
    const min = options.minParticipantCount ?? 2;
    const now = new Date();

    const application = await prisma.courtOperatorApplication.create({
      data: {
        applicantUserId: operatorId, status: "PUBLISH_APPROVED",
        businessName: "DB 테니스 운영", businessRegistrationNumberHash: `hash-${randomUUID()}`,
        businessVerificationStatus: "VERIFIED", venueVerificationStatus: "MATCHED",
        venueName: "DB 테니스장", venueAddress: "서울시 DB 마포구 1",
        normalizedVenueKey: `db-court-${randomUUID()}`,
        submittedAt: now, verifiedAt: now, publishApprovedAt: now,
      },
    });
    const court = await prisma.court.create({
      data: {
        operatorApplicationId: application.id, regionCode: "DB-SEOUL-001",
        name: "DB 테니스장", address: "서울시 DB 마포구 1", normalizedVenueKey: application.normalizedVenueKey!,
        settlementBank: "DB은행", settlementAccountNumber: "111-222-333", settlementAccountHolder: "DB테니스장",
      },
    });
    const unit = await prisma.courtUnit.create({ data: { courtId: court.id, name: "1번 코트" } });
    const slot = await prisma.courtSlot.create({
      data: {
        courtUnitId: unit.id, startsAt, endsAt, priceKrw: 36_000,
        maxParticipantCount: max, minParticipantCount: min,
        gameType: options.genderQuota ? "MIXED_DOUBLES" : "OTHER",
        maleCapacity: options.genderQuota ? 1 : null, femaleCapacity: options.genderQuota ? 1 : null,
        approvalMode: options.approvalMode ?? "AUTO", visibility: "PUBLIC", status: "AVAILABLE",
        publishedAt: now, statusChangedAt: now,
      },
    });
    const match = await prisma.match.create({
      data: {
        hostUserId: operatorId, clientRequestId: slot.id, title: "DB 코트 매칭",
        startsAt, endsAt, courtSource: "PARTNER_COURT", courtSlotId: slot.id,
        recruitCount: max,
        maleRecruitCount: options.genderQuota ? 1 : null, femaleRecruitCount: options.genderQuota ? 1 : null,
        gameType: options.genderQuota ? "MIXED_DOUBLES" : "OTHER",
        partnerPreference: "COMPLETE_BEGINNER_WELCOME", totalCourtFeeKrw: 36_000,
        settlementBank: "DB은행", settlementAccountNumber: "111-222-333", settlementAccountHolder: "DB테니스장",
      },
    });
    return { matchId: match.id, slotId: slot.id, startsAt, courtId: court.id };
  }

  /** 코트 슬롯은 최대 인원이 2 이상이어야 한다(DB 제약). 자리 하나를 미리 채워 "마지막 한 자리"를 만든다. */
  async function fillSeat(matchId: string, user: { id: string; gender: "MALE" | "FEMALE" }, status: "ACCEPTED" | "CONFIRMED" = "ACCEPTED") {
    return prisma.matchApplication.create({
      data: {
        matchId, applicantUserId: user.id, applicantGender: user.gender, status,
        profileSnapshot: {}, profileSnapshotVersion: 1, decidedAt: new Date(),
        depositCode: "999", paymentDueAt: new Date(Date.now() + HOUR),
        ...(status === "CONFIRMED" ? { confirmedAt: new Date() } : {}),
      },
    });
  }

  const errorCode = (caught: unknown) => (caught as { code?: string }).code;

  // ── §6 상태·권한 ─────────────────────────────────────────────

  it("운영자 승인 방식은 승인 전까지 계좌를 공개하지 않는다", async () => {
    const operator = await makeUser("운영자", "MALE");
    const applicant = await makeUser("참가자", "FEMALE");
    const { matchId } = await makeCourtMatch(operator.id, { approvalMode: "OPERATOR" });

    const applied = await applyToCourtMatch(prisma, applicant.viewer, matchId, { message: "잘 부탁드려요" });
    expect(applied.status).toBe("PENDING");
    expect(applied.depositCode).toBeNull();

    const pendingView = await getCourtMatchParticipation(prisma, applicant.viewer, matchId);
    expect(pendingView.settlementAccount).toBeNull();
    expect(pendingView.chatHref).toBeNull();

    const decided = await decideCourtMatchApplication(prisma, { id: operator.id }, applied.id, { accept: true });
    expect(decided.status).toBe("ACCEPTED");
    expect(decided.depositCode).toMatch(/^\d{3}$/);

    const acceptedView = await getCourtMatchParticipation(prisma, applicant.viewer, matchId);
    expect(acceptedView.settlementAccount).toEqual({ bank: "DB은행", accountNumber: "111-222-333", accountHolder: "DB테니스장" });
  });

  it("거절한 신청은 자리를 잡지 않는다", async () => {
    const operator = await makeUser("운영자", "MALE");
    const applicant = await makeUser("참가자", "FEMALE");
    const { matchId } = await makeCourtMatch(operator.id, { approvalMode: "OPERATOR" });

    const applied = await applyToCourtMatch(prisma, applicant.viewer, matchId, {});
    const decided = await decideCourtMatchApplication(prisma, { id: operator.id }, applied.id, { accept: false });
    expect(decided.status).toBe("REJECTED");

    const view = await getOperatorCourtMatch(prisma, { id: operator.id }, matchId);
    expect(view.seatCount).toBe(0);
    expect(view.remainingSpots).toBe(2);
  });

  it("자동 승인에서는 운영자에게 프로필 스냅샷과 신청 메시지를 주지 않는다", async () => {
    const operator = await makeUser("운영자", "MALE");
    const applicant = await makeUser("참가자", "FEMALE");
    const { matchId } = await makeCourtMatch(operator.id, { approvalMode: "AUTO" });

    await applyToCourtMatch(prisma, applicant.viewer, matchId, { message: "노출되면 안 되는 메시지" });
    const view = await getOperatorCourtMatch(prisma, { id: operator.id }, matchId);
    expect(view.applications).toHaveLength(1);
    expect(view.applications[0]).not.toHaveProperty("profileSnapshot");
    expect(view.applications[0]).not.toHaveProperty("message");
    expect(view.applications[0].nickname).toBe("참가자");
  });

  it("입금 알림은 기록만 남기고 확정은 운영자가 한다", async () => {
    const operator = await makeUser("운영자", "MALE");
    const applicant = await makeUser("참가자", "FEMALE");
    const { matchId } = await makeCourtMatch(operator.id);

    const applied = await applyToCourtMatch(prisma, applicant.viewer, matchId, {});
    await claimCourtMatchDeposit(prisma, { id: applicant.id }, applied.id, { depositorName: "홍길동" });

    const claimed = await prisma.matchApplication.findUniqueOrThrow({ where: { id: applied.id } });
    expect(claimed.status).toBe("ACCEPTED");
    expect(claimed.depositClaimedAt).not.toBeNull();
    expect(claimed.confirmedAt).toBeNull();

    await confirmCourtMatchDeposit(prisma, { id: operator.id }, applied.id);
    const confirmed = await prisma.matchApplication.findUniqueOrThrow({ where: { id: applied.id } });
    expect(confirmed.status).toBe("CONFIRMED");

    const membership = await prisma.matchConversationMember.findFirst({
      where: { userId: applicant.id, conversation: { matchId } },
    });
    expect(membership).not.toBeNull();
  });

  it("타인은 승인·확정·환불을 할 수 없다", async () => {
    const operator = await makeUser("운영자", "MALE");
    const other = await makeUser("다른 운영자", "MALE");
    const applicant = await makeUser("참가자", "FEMALE");
    const { matchId } = await makeCourtMatch(operator.id, { approvalMode: "OPERATOR" });
    const applied = await applyToCourtMatch(prisma, applicant.viewer, matchId, {});

    await expect(decideCourtMatchApplication(prisma, { id: other.id }, applied.id, { accept: true }))
      .rejects.toMatchObject({ code: "COURT_MATCH_OPERATOR_REQUIRED" });
    await expect(confirmCourtMatchDeposit(prisma, { id: other.id }, applied.id))
      .rejects.toMatchObject({ code: "COURT_MATCH_OPERATOR_REQUIRED" });
    await expect(getOperatorCourtMatch(prisma, { id: other.id }, matchId))
      .rejects.toMatchObject({ code: "COURT_MATCH_OPERATOR_REQUIRED" });
    await expect(getOperatorCourtMatch(prisma, { id: applicant.id }, matchId))
      .rejects.toMatchObject({ code: "COURT_MATCH_OPERATOR_REQUIRED" });
  });

  it("중복 신청과 중복 확정은 막힌다", async () => {
    const operator = await makeUser("운영자", "MALE");
    const applicant = await makeUser("참가자", "FEMALE");
    const { matchId } = await makeCourtMatch(operator.id);

    const applied = await applyToCourtMatch(prisma, applicant.viewer, matchId, {});
    await expect(applyToCourtMatch(prisma, applicant.viewer, matchId, {}))
      .rejects.toMatchObject({ code: "APPLICATION_ALREADY_EXISTS" });

    await confirmCourtMatchDeposit(prisma, { id: operator.id }, applied.id);
    await expect(confirmCourtMatchDeposit(prisma, { id: operator.id }, applied.id))
      .rejects.toMatchObject({ code: "APPLICATION_STATE_CONFLICT" });

    const members = await prisma.matchConversationMember.count({ where: { userId: applicant.id, conversation: { matchId } } });
    expect(members).toBe(1);
  });

  it("입금 기한이 지나면 자리를 돌려주고, 요청을 거절해도 만료 상태는 남는다", async () => {
    const operator = await makeUser("운영자", "MALE");
    const applicant = await makeUser("참가자", "FEMALE");
    // 판정 시점이 아직 오지 않아야 취소가 아니라 만료만 일어난다.
    const { matchId } = await makeCourtMatch(operator.id, { startsAt: new Date(Date.now() + 5 * HOUR), maxParticipantCount: 2, minParticipantCount: 1 });

    const applied = await applyToCourtMatch(prisma, applicant.viewer, matchId, {});
    await prisma.matchApplication.update({ where: { id: applied.id }, data: { paymentDueAt: new Date(Date.now() - 60_000) } });

    await expect(claimCourtMatchDeposit(prisma, { id: applicant.id }, applied.id, { depositorName: "홍길동" }))
      .rejects.toMatchObject({ code: "DEPOSIT_DEADLINE_PASSED" });

    const expired = await prisma.matchApplication.findUniqueOrThrow({ where: { id: applied.id } });
    expect(expired.status).toBe("EXPIRED_UNPAID");

    const view = await getOperatorCourtMatch(prisma, { id: operator.id }, matchId);
    expect(view.seatCount).toBe(0);
    expect(view.remainingSpots).toBe(2);
  });

  it("판정 시점에 최소 인원을 못 채우면 취소하고 이후 승인을 막는다", async () => {
    const operator = await makeUser("운영자", "MALE");
    const applicant = await makeUser("참가자", "FEMALE");
    const { matchId } = await makeCourtMatch(operator.id, {
      startsAt: new Date(Date.now() + 3 * HOUR - 30_000), approvalMode: "OPERATOR", minParticipantCount: 2, maxParticipantCount: 2,
    });
    const applied = await prisma.matchApplication.create({
      data: { matchId, applicantUserId: applicant.id, applicantGender: "FEMALE", status: "PENDING", profileSnapshot: {}, profileSnapshotVersion: 1 },
    });

    await expect(decideCourtMatchApplication(prisma, { id: operator.id }, applied.id, { accept: true }))
      .rejects.toMatchObject({ code: "COURT_MATCH_MINIMUM_NOT_MET" });

    // 요청은 실패했지만 취소는 커밋돼 있어야 한다(트랜잭션 rollback 재발 방지).
    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(match.status).toBe("CANCELLED");
    expect(await prisma.matchApplication.findUniqueOrThrow({ where: { id: applied.id } })).toMatchObject({ status: "CANCELLED" });
  });

  it("취소 뒤 환불 계좌는 본인만 넣고, 완료 표시 뒤에는 수정되지 않는다", async () => {
    const operator = await makeUser("운영자", "MALE");
    const applicant = await makeUser("참가자", "FEMALE");
    const outsider = await makeUser("제3자", "MALE");
    const { matchId } = await makeCourtMatch(operator.id, { startsAt: new Date(Date.now() + 5 * HOUR), maxParticipantCount: 2, minParticipantCount: 1 });

    const applied = await applyToCourtMatch(prisma, applicant.viewer, matchId, {});
    await confirmCourtMatchDeposit(prisma, { id: operator.id }, applied.id);
    // 판정 시점을 지나게 만들되 확정 인원은 판정 이후로 밀어 미달을 만든다.
    await prisma.match.update({ where: { id: matchId }, data: { startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + HOUR) } });
    await prisma.matchApplication.update({ where: { id: applied.id }, data: { confirmedAt: new Date(Date.now() + HOUR) } });
    await reconcileCourtMatch(prisma, matchId);

    const cancelled = await prisma.matchApplication.findUniqueOrThrow({ where: { id: applied.id } });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.confirmedAt).not.toBeNull();

    await expect(submitCourtMatchRefundAccount(prisma, { id: outsider.id }, applied.id, { bank: "DB은행", accountNumber: "999-999", accountHolder: "제3자" }))
      .rejects.toMatchObject({ code: "APPLICATION_NOT_FOUND" });

    await submitCourtMatchRefundAccount(prisma, { id: applicant.id }, applied.id, { bank: "DB은행", accountNumber: "111-111", accountHolder: "참가자" });
    await submitCourtMatchRefundAccount(prisma, { id: applicant.id }, applied.id, { bank: "DB은행", accountNumber: "222-222", accountHolder: "참가자" });
    expect((await prisma.matchApplication.findUniqueOrThrow({ where: { id: applied.id } })).refundAccountNumber).toBe("222-222");

    await completeCourtMatchRefund(prisma, { id: operator.id }, applied.id);
    await expect(submitCourtMatchRefundAccount(prisma, { id: applicant.id }, applied.id, { bank: "DB은행", accountNumber: "333-333", accountHolder: "참가자" }))
      .rejects.toMatchObject({ code: "REFUND_ALREADY_COMPLETED" });
    expect((await prisma.matchApplication.findUniqueOrThrow({ where: { id: applied.id } })).refundAccountNumber).toBe("222-222");
  });


  it("시작 30분 전이 지나면 신청도 승인도 받지 않고 남은 대기 신청을 정리한다", async () => {
    const operator = await makeUser("운영자", "MALE");
    const applicant = await makeUser("참가자", "FEMALE");
    const latecomer = await makeUser("늦은 사람", "FEMALE");
    // 이미 시작 20분 전. 판정 시점은 지났지만 확정 인원이 최소 인원을 채워 취소되지 않는다.
    const startsAt = new Date(Date.now() + 20 * 60_000);
    const { matchId } = await makeCourtMatch(operator.id, { startsAt, approvalMode: "OPERATOR", minParticipantCount: 1, maxParticipantCount: 2 });
    const confirmed = await fillSeat(matchId, applicant, "CONFIRMED");
    await prisma.matchApplication.update({ where: { id: confirmed.id }, data: { confirmedAt: new Date(Date.now() - 4 * HOUR) } });
    const pending = await prisma.matchApplication.create({
      data: { matchId, applicantUserId: latecomer.id, applicantGender: "FEMALE", status: "PENDING", profileSnapshot: {}, profileSnapshotVersion: 1 },
    });

    await expect(applyToCourtMatch(prisma, latecomer.viewer, matchId, {}))
      .rejects.toMatchObject({ code: "COURT_MATCH_APPLICATION_CLOSED" });
    await expect(decideCourtMatchApplication(prisma, { id: operator.id }, pending.id, { accept: true }))
      .rejects.toMatchObject({ code: "COURT_MATCH_APPLICATION_CLOSED" });

    // 마감 처리는 요청이 거절돼도 커밋된다.
    expect((await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).status).toBe("CLOSED");
    expect((await prisma.matchApplication.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("CANCELLED");
  });

  it("판정 시점에 최소 인원을 채웠으면 이후 승인도 되고 입금 기한은 시작 30분 전이다", async () => {
    const operator = await makeUser("운영자", "MALE");
    const early = await makeUser("먼저 확정한 사람", "MALE");
    const late = await makeUser("나중 신청자", "FEMALE");
    // 판정 시점(시작 3시간 전)은 이미 지났고 시작까지는 1시간 남았다.
    const startsAt = new Date(Date.now() + HOUR);
    const { matchId } = await makeCourtMatch(operator.id, { startsAt, approvalMode: "OPERATOR", minParticipantCount: 1, maxParticipantCount: 2 });
    const seat = await fillSeat(matchId, early, "CONFIRMED");
    await prisma.matchApplication.update({ where: { id: seat.id }, data: { confirmedAt: new Date(Date.now() - 4 * HOUR) } });
    const pending = await prisma.matchApplication.create({
      data: { matchId, applicantUserId: late.id, applicantGender: "FEMALE", status: "PENDING", profileSnapshot: {}, profileSnapshotVersion: 1 },
    });

    const decided = await decideCourtMatchApplication(prisma, { id: operator.id }, pending.id, { accept: true });
    expect(decided.status).toBe("ACCEPTED");
    expect(new Date(decided.paymentDueAt!).getTime()).toBe(getApplicationDeadline(startsAt).getTime());
    expect((await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).status).toBe("OPEN");
  });

  it("긴급 공급 철회는 공개된 코트 매칭을 취소하고 입금한 참가자를 환불 대상으로 남긴다", async () => {
    const operator = await makeUser("운영자", "MALE");
    const applicant = await makeUser("참가자", "FEMALE");
    const { matchId, slotId } = await makeCourtMatch(operator.id);
    const applied = await applyToCourtMatch(prisma, applicant.viewer, matchId, {});
    await confirmCourtMatchDeposit(prisma, { id: operator.id }, applied.id);

    const slot = await prisma.courtSlot.findUniqueOrThrow({ where: { id: slotId } });
    await reportCourtSupplyIncident(prisma, { id: operator.id }, slotId, { code: "FACILITY_CLOSED", expectedVersion: slot.version });

    expect((await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).status).toBe("CANCELLED");
    const after = await prisma.matchApplication.findUniqueOrThrow({ where: { id: applied.id } });
    expect(after.status).toBe("CANCELLED");
    expect(after.confirmedAt).not.toBeNull();
    expect(after.refundCompletedAt).toBeNull();

    const view = await getCourtMatchParticipation(prisma, applicant.viewer, matchId);
    expect(view.application?.awaitingRefund).toBe(true);
  });

  it("일반 매칭 API로 코트 매칭을 승인하거나 취소할 수 없다", async () => {
    const operator = await makeUser("운영자", "MALE");
    const applicant = await makeUser("참가자", "FEMALE");
    const { matchId } = await makeCourtMatch(operator.id, { approvalMode: "OPERATOR" });
    const applied = await applyToCourtMatch(prisma, applicant.viewer, matchId, {});
    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });

    await expect(acceptApplication(prisma, { id: operator.id, profile: operator.profile }, applied.id, { expectedMatchVersion: match.version }))
      .rejects.toMatchObject({ code: "COURT_MATCH_PATH_REQUIRED" });
    await expect(cancelMatch(prisma, { id: operator.id, profile: operator.profile }, matchId, { expectedVersion: match.version }))
      .rejects.toMatchObject({ code: "COURT_MATCH_PATH_REQUIRED" });

    // 우회가 막혔으니 입금 코드 없는 ACCEPTED가 생기지 않는다.
    expect((await prisma.matchApplication.findUniqueOrThrow({ where: { id: applied.id } })).status).toBe("PENDING");
  });

  // ── §7 실제 동시 실행 ─────────────────────────────────────────

  /**
   * 별도 연결이 Match 행 잠금을 실제로 쥔 동안 요청들을 시작시키고, 잠금을 놓은 뒤
   * 결과를 받는다. `Promise.all`만 쓰면 두 요청이 실제로 겹쳤는지 알 수 없다.
   */
  async function whileMatchLocked(matchId: string, start: () => Promise<unknown>[], holdMs = 400) {
    const holder = newClient();
    let acquired!: () => void;
    let release!: () => void;
    const lockAcquired = new Promise<void>((resolve) => { acquired = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const held = holder.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM matches WHERE id = ${matchId}::uuid FOR UPDATE`;
      acquired();
      await gate;
    }, { timeout: 60_000, maxWait: 10_000 });

    let started: Promise<unknown>[] = [];
    try {
      await lockAcquired;
      started = start();
      await sleep(holdMs);
    } finally {
      release();
      await held.catch(() => undefined);
      await holder.$disconnect();
    }
    return Promise.allSettled(started);
  }

  it("마지막 한 자리에 동시에 신청하면 한 명만 자리를 얻는다", async () => {
    const operator = await makeUser("운영자", "MALE");
    const applicantA = await makeUser("참가자1", "FEMALE");
    const applicantB = await makeUser("참가자2", "FEMALE");
    const seated = await makeUser("먼저 잡은 사람", "MALE");
    const { matchId } = await makeCourtMatch(operator.id, { maxParticipantCount: 2, minParticipantCount: 1 });
    await fillSeat(matchId, seated);

    const results = await whileMatchLocked(matchId, () => [
      applyToCourtMatch(prisma, applicantA.viewer, matchId, {}),
      applyToCourtMatch(prisma, applicantB.viewer, matchId, {}),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(errorCode(rejected.reason)).toBe("NO_REMAINING_SPOTS");
    expect(await prisma.matchApplication.count({ where: { matchId, status: { in: ["ACCEPTED", "CONFIRMED"] } } })).toBe(2);
  });

  it("마지막 자리를 두 신청에 동시에 승인하면 한 건만 승인된다", async () => {
    const operator = await makeUser("운영자", "MALE");
    const applicantA = await makeUser("참가자1", "FEMALE");
    const applicantB = await makeUser("참가자2", "FEMALE");
    const seated = await makeUser("먼저 잡은 사람", "MALE");
    const { matchId } = await makeCourtMatch(operator.id, { approvalMode: "OPERATOR", maxParticipantCount: 2, minParticipantCount: 1 });
    await fillSeat(matchId, seated);
    const appliedA = await applyToCourtMatch(prisma, applicantA.viewer, matchId, {});
    const appliedB = await applyToCourtMatch(prisma, applicantB.viewer, matchId, {});

    const results = await whileMatchLocked(matchId, () => [
      decideCourtMatchApplication(prisma, { id: operator.id }, appliedA.id, { accept: true }),
      decideCourtMatchApplication(prisma, { id: operator.id }, appliedB.id, { accept: true }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(errorCode(rejected.reason)).toBe("NO_REMAINING_SPOTS");
    expect(await prisma.matchApplication.count({ where: { matchId, status: "ACCEPTED" } })).toBe(2);
  });

  it("환불 완료가 먼저 잠금을 얻으면 뒤따르는 계좌 수정은 거절된다", async () => {
    const operator = await makeUser("운영자", "MALE");
    const applicant = await makeUser("참가자", "FEMALE");
    const { matchId } = await makeCourtMatch(operator.id, { startsAt: new Date(Date.now() + 5 * HOUR), maxParticipantCount: 2, minParticipantCount: 1 });
    const applied = await applyToCourtMatch(prisma, applicant.viewer, matchId, {});
    await confirmCourtMatchDeposit(prisma, { id: operator.id }, applied.id);
    await prisma.match.update({ where: { id: matchId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await prisma.matchApplication.update({
      where: { id: applied.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), refundBank: "DB은행", refundAccountNumber: "111-111", refundAccountHolder: "참가자" },
    });

    // 완료가 먼저 잠금 대기열에 들어가고, 계좌 수정이 그 뒤에 붙는다.
    const results = await whileMatchLocked(matchId, () => [
      completeCourtMatchRefund(prisma, { id: operator.id }, applied.id),
      sleep(200).then(() => submitCourtMatchRefundAccount(prisma, { id: applicant.id }, applied.id, { bank: "DB은행", accountNumber: "999-999", accountHolder: "참가자" })),
    ], 700);

    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("rejected");
    expect(errorCode((results[1] as PromiseRejectedResult).reason)).toBe("REFUND_ALREADY_COMPLETED");
    const finalState = await prisma.matchApplication.findUniqueOrThrow({ where: { id: applied.id } });
    expect(finalState.refundAccountNumber).toBe("111-111");
    expect(finalState.refundCompletedAt).not.toBeNull();
  });

  it("잠금을 기다리는 동안 판정 시점을 지나면 대기 전 시각으로 승인하지 않는다", async () => {
    const operator = await makeUser("운영자", "MALE");
    const applicant = await makeUser("참가자", "FEMALE");
    // 판정까지 2초 남은 코트 매칭. 승인 요청은 잠금을 기다리는 동안 판정 시점을 넘긴다.
    const startsAt = new Date(Date.now() + 3 * HOUR + 2_000);
    const { matchId } = await makeCourtMatch(operator.id, { startsAt, approvalMode: "OPERATOR", minParticipantCount: 1, maxParticipantCount: 2 });
    const applied = await applyToCourtMatch(prisma, applicant.viewer, matchId, {});

    const results = await whileMatchLocked(matchId, () => [
      decideCourtMatchApplication(prisma, { id: operator.id }, applied.id, { accept: true }),
    ], 2_600);

    expect(new Date() >= getJudgementAt(startsAt)).toBe(true);
    expect(results[0].status).toBe("rejected");
    expect(errorCode((results[0] as PromiseRejectedResult).reason)).toBe("COURT_MATCH_MINIMUM_NOT_MET");
    expect((await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).status).toBe("CANCELLED");
    expect(getApplicationDeadline(startsAt).getTime()).toBeGreaterThan(getJudgementAt(startsAt).getTime());
  });
});

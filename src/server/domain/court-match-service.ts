import { checkCourtComposition, countCourtComposition, courtCompositionPolicyVersion } from "@/matches/court-composition";
import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

import { addAcceptedMemberToConversation, makeConversationReadOnly, removeParticipantFromConversation } from "@/server/domain/match-chat-service";
import { recordApplicationNotification } from "@/server/domain/notification-service";
import { DomainError } from "@/server/domain/profile-service";
import type { ProfileWithRelations } from "./profile-service";
import { toProfileSnapshot } from "./match-service";

import { courtMoneySummary } from "./court-match-money";

import {
  getApplicationDeadline,
  canAcceptCourtApplication,
  getConfirmationDueAt,
  getJudgementAt,
  getPaymentDueAt,
  getRefundAmountKrw,
  makeDepositCode,
  seatHoldingStatuses,
  type CourtMatchDecisionInput,
  type DepositClaimInput,
} from "./court-match";

import { lockAccountTransactions, assertActiveTransactionUser } from "./account-transaction-lock";

type Transaction = Prisma.TransactionClient;

/**
 * 운영자 주최 코트 매칭의 참가·입금·확정·환불 흐름.
 *
 * 일반 매칭과 분리한 이유는 주최자와 확정 조건이 다르기 때문이다. 코트 매칭은
 * 운영자가 열고, 참가는 승인만으로 끝나지 않으며 계좌이체 입금이 확인돼야 확정된다.
 * 설계는 docs/03-2-court-match-operator-hosted-redesign.md를 따른다.
 */

const applicantSelect = {
  id: true,
  status: true,
  applicantUserId: true,
  applicantUser: { select: { status: true } },
  applicantGender: true,
  depositCode: true,
  paymentDueAt: true,
  confirmationDueAt: true,
  receivedAmountKrw: true,
  lastReceivedAt: true,
  feeReceivedAt: true,
  depositorName: true,
  depositClaimedAt: true,
  confirmedAt: true,
  refundCompletedAt: true,
  refundAmountKrw: true,
  refundBank: true,
  legacyRefundPaidKrw: true,
  refundAttempts: { select: { amountKrw: true, status: true } },
} satisfies Prisma.MatchApplicationSelect;

export const courtMatchSelect = {
  id: true,
  hostUserId: true,
  host: { select: { status: true } },
  title: true,
  status: true,
  startsAt: true,
  courtSource: true,
  gameType: true,
  courtCompositionPolicyVersion: true,
  courtCompositionPassedAt: true,
  courtCompositionSnapshot: true,
  totalCourtFeeKrw: true,
  recruitCount: true,
  maleRecruitCount: true,
  femaleRecruitCount: true,
  courtSlot: { select: { id: true, status: true, approvalMode: true, minParticipantCount: true, courtUnit: { select: { court: { select: { status: true, operatorApplication: { select: { applicantUserId: true, status: true } } } } } } } },
} satisfies Prisma.MatchSelect;

type CourtMatch = Prisma.MatchGetPayload<{ select: typeof courtMatchSelect }>;

// All seat and payment mutations for one match share this row lock, including the cron.
export async function lockCourtMatch(transaction: Transaction, matchId: string) {
  await transaction.$queryRaw(Prisma.sql`SELECT id FROM matches WHERE id = ${matchId}::uuid FOR UPDATE`);
}

export async function lockApplicationMatch(transaction: Transaction, applicationId: string) {
  const application = await transaction.matchApplication.findUnique({ where: { id: applicationId }, select: { matchId: true } });
  if (application) await lockCourtMatch(transaction, application.matchId);
  return application?.matchId;
}

/**
 * 시간 보정으로 취소·만료된 기록은 요청을 거절하더라도 커밋해야 한다.
 *
 * `allowAfterApplicationDeadline`은 신청 마감 뒤에도 받아야 하는 요청을 위한 것이다.
 * 참가 취소가 그렇다. 취소는 신청이 아니라 이미 잡은 자리를 놓는 일이라, 마감을
 * 이유로 막으면 신청 마감 이후에는 못 가게 된 사람이 자리를 붙잡고 있게 된다.
 */
async function withCurrentCourtMatch<T>(
  prisma: PrismaClient,
  target: { matchId: string } | { applicationId: string },
  action: (transaction: Transaction, now: Date) => Promise<T>,
  options: { allowAfterApplicationDeadline?: boolean } = {},
): Promise<T> {
  const result = await prisma.$transaction(async (transaction) => {
    await lockAccountTransactions(transaction);
    const matchId = "matchId" in target ? target.matchId : await lockApplicationMatch(transaction, target.applicationId);
    if ("matchId" in target) await lockCourtMatch(transaction, target.matchId);
    // 잠금 대기 중 기한을 넘길 수 있으므로 잠금을 얻은 뒤 시간을 읽는다.
    const now = new Date();
    const match = matchId ? await transaction.match.findUnique({ where: { id: matchId }, select: courtMatchSelect }) : null;
    const reconciled = await reconcileLockedCourtMatch(transaction, match, now);
    if (reconciled.didCancel) {
      return { error: new DomainError("COURT_MATCH_MINIMUM_NOT_MET", 409, "최소 인원이 모이지 않아 코트 매칭이 취소됐어요.") };
    }
    if (!options.allowAfterApplicationDeadline && isOperatorHostedActiveMatch(match) && now >= getApplicationDeadline(match.startsAt)) {
      return { error: new DomainError("COURT_MATCH_APPLICATION_CLOSED", 409, "참가 신청과 입금 기한이 지났어요.") };
    }
    if ("applicationId" in target) {
      const application = await transaction.matchApplication.findUnique({ where: { id: target.applicationId }, select: { status: true } });
      if (application?.status === "EXPIRED_UNPAID") {
        return { error: new DomainError("DEPOSIT_DEADLINE_PASSED", 409, "입금 기한이 지났어요.") };
      }
    }
    return { value: await action(transaction, now) };
  });
  if ("error" in result) throw result.error;
  return result.value;
}

/**
 * 코트 매칭 상세의 정본 주소는 슬롯 쪽이다. `/matches/{id}`로 보내면 리다이렉트로
 * 한 번 더 튄다. 옛 기록처럼 슬롯이 없으면 기존 주소로 떨어뜨린다.
 */
function courtMatchHref(match: CourtMatch) {
  return match.courtSlot ? `/partner-sessions/${match.courtSlot.id}` : `/matches/${match.id}`;
}

function assertAccepting(match: CourtMatch, now: Date, existingApproval = false) {
  const court = match.courtSlot?.courtUnit.court;
  if (match.host.status !== "ACTIVE" || !court || court.operatorApplication.applicantUserId !== match.hostUserId || court.status !== "ACTIVE" || court.operatorApplication.status !== "PUBLISH_APPROVED" || match.courtSlot?.status !== "AVAILABLE") {
    throw new DomainError("COURT_MATCH_UNAVAILABLE", 409, "현재 참가를 진행할 수 없는 코트 매칭이에요.");
  }
  if (match.status !== "OPEN" && match.status !== "CLOSED") throw new DomainError("MATCH_STATE_CONFLICT", 409, "취소되거나 종료된 코트 매칭이에요.");
  if (!existingApproval && !canAcceptCourtApplication(now, match.startsAt)) throw new DomainError("COURT_MATCH_APPLICATION_CLOSED", 409, "입금에 필요한 시간이 부족해 지금은 신청·승인을 받지 않아요.");
}

function assertCourtMatch(match: CourtMatch | null): asserts match is CourtMatch {
  if (!match) throw new DomainError("MATCH_NOT_FOUND", 404, "코트 매칭을 찾을 수 없어요.");
  if (match.courtSource !== "PARTNER_COURT") {
    throw new DomainError("NOT_A_COURT_MATCH", 409, "이 매칭은 코트 매칭이 아니에요.");
  }
}

/** 자리를 차지한 인원. 승인만 받고 아직 입금하지 않은 사람도 포함한다. */
function countSeats(transaction: Transaction, matchId: string, gender?: "MALE" | "FEMALE") {
  return transaction.matchApplication.count({
    where: { matchId, status: { in: [...seatHoldingStatuses] }, ...(gender ? { applicantGender: gender } : {}) },
  });
}

/** 진행 여부를 판정하는 인원. 입금이 확인된 사람만 센다. */
function countConfirmed(transaction: Transaction, matchId: string, confirmedBy?: Date) {
  return transaction.matchApplication.count({ where: { matchId, status: "CONFIRMED", ...(confirmedBy ? { confirmedAt: { lte: confirmedBy } } : {}) } });
}

/**
 * 판정 시점에 확정돼 있던 인원. 그 뒤에 참가자가 스스로 취소해도 이 수는 줄지 않는다.
 *
 * 판정을 통과했다는 것은 진행하기로 정했다는 뜻이고, 그때 운영자는 이미 코트를
 * 확보한 상태다. 나중에 한 명이 취소했다고 매칭 전체를 취소하면 남은 사람의 경기가
 * 사라지고 운영자만 손해를 본다. 당일 취소는 환불이 없다는 규칙도 무의미해진다
 * (전체가 취소되면 남은 사람은 전액을 돌려받으므로). 진행이 어려우면 운영자가 긴급
 * 공급 철회로 취소한다. 정책 근거는 03-2 §3.2·§3.7.
 */
function countConfirmedAtJudgement(transaction: Transaction, matchId: string, judgementAt: Date) {
  return transaction.matchApplication.count({
    where: {
      matchId,
      confirmedAt: { lte: judgementAt },
      OR: [
        { status: "CONFIRMED" },
        { status: "CANCELLED", participantCancelledAt: { gt: judgementAt } },
      ],
    },
  });
}

async function assertSeatAvailable(transaction: Transaction, match: CourtMatch, gender: "MALE" | "FEMALE" | null) {
  const seats = await countSeats(transaction, match.id, undefined);
  if (seats >= match.recruitCount) throw new DomainError("NO_REMAINING_SPOTS", 409, "남은 자리가 없어요.");

  const hasGenderQuota = match.maleRecruitCount != null && match.femaleRecruitCount != null;
  if (!hasGenderQuota) return;
  if (!gender) throw new DomainError("PROFILE_GENDER_REQUIRED", 409, "프로필에서 성별을 입력한 뒤 신청해 주세요.");

  const quota = gender === "MALE" ? match.maleRecruitCount : match.femaleRecruitCount;
  const taken = await countSeats(transaction, match.id, gender);
  if (taken >= (quota ?? 0)) throw new DomainError("GENDER_QUOTA_FULL", 409, "해당 성별의 모집 인원이 모두 찼어요.");
}

/** 같은 코트 매칭 안에서 겹치지 않는 입금 식별코드를 고른다. */
async function pickDepositCode(transaction: Transaction, matchId: string) {
  const used = await transaction.matchApplication.findMany({
    where: { matchId, depositCode: { not: null } },
    select: { depositCode: true },
  });
  const taken = new Set(used.map((item) => item.depositCode));
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = makeDepositCode();
    if (!taken.has(code)) return code;
  }
  throw new DomainError("DEPOSIT_CODE_UNAVAILABLE", 409, "입금 식별코드를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
}

async function approveApplication(transaction: Transaction, match: CourtMatch, applicationId: string, now: Date) {
  const depositCode = await pickDepositCode(transaction, match.id);
  const paymentDueAt = getPaymentDueAt(now, match.startsAt);
  await transaction.matchApplication.update({
    where: { id: applicationId },
    data: { status: "ACCEPTED", decidedAt: now, depositCode, paymentDueAt, confirmationDueAt: getConfirmationDueAt(paymentDueAt) },
  });
  return { depositCode, paymentDueAt };
}

export async function applyToCourtMatch(
  prisma: PrismaClient,
  viewer: { id: string; profile: ProfileWithRelations },
  matchId: string,
  input: { message?: string } = {},
) {
  return withCurrentCourtMatch(prisma, { matchId }, async (transaction, now) => {
    await assertActiveTransactionUser(transaction, viewer.id);
    const match = await transaction.match.findUnique({ where: { id: matchId }, select: courtMatchSelect });
    assertCourtMatch(match);

    if (match.hostUserId === viewer.id) throw new DomainError("OWN_MATCH_APPLICATION_NOT_ALLOWED", 409, "내가 연 코트 매칭에는 신청할 수 없어요.");
    if (match.status === "CANCELLED") throw new DomainError("MATCH_CANCELLED", 409, "취소된 코트 매칭이에요.");
    if (match.status !== "OPEN") throw new DomainError("MATCH_ALREADY_CLOSED", 409, "모집이 마감된 코트 매칭이에요.");
    if (now >= getApplicationDeadline(match.startsAt)) {
      throw new DomainError("COURT_MATCH_APPLICATION_CLOSED", 409, "시작 90분 전까지만 신청할 수 있어요.");
    }
    assertAccepting(match, now);
    if (!viewer.profile.gender) throw new DomainError("PROFILE_GENDER_REQUIRED", 409, "프로필에 성별을 입력해 주세요.");

    const existing = await transaction.matchApplication.findUnique({
      where: { matchId_applicantUserId: { matchId, applicantUserId: viewer.id } },
      select: { id: true },
    });
    if (existing) throw new DomainError("APPLICATION_ALREADY_EXISTS", 409, "이미 신청한 코트 매칭이에요.");

    await assertSeatAvailable(transaction, match, viewer.profile.gender);

    const autoApprove = match.courtSlot?.approvalMode === "AUTO";
    const created = await transaction.matchApplication.create({
      data: {
        matchId,
        applicantUserId: viewer.id,
        applicantGender: viewer.profile.gender,
        profileSnapshot: autoApprove ? {} : toProfileSnapshot(viewer.profile),
        message: autoApprove ? null : input.message?.trim() || null,
        profileSnapshotVersion: 1,
      },
      select: applicantSelect,
    });

    if (!autoApprove) {
      await recordApplicationNotification(transaction, {
        recipientUserId: match.hostUserId,
        type: "APPLICATION_RECEIVED",
        matchTitle: match.title,
        href: `/partner/court-matches/${matchId}`,
      });
      return { id: created.id, status: "PENDING" as const, depositCode: null, paymentDueAt: null };
    }

    const { depositCode, paymentDueAt } = await approveApplication(transaction, match, created.id, now);
    await recordApplicationNotification(transaction, {
      recipientUserId: viewer.id,
      type: "COURT_MATCH_DEPOSIT_REQUIRED",
      matchTitle: match.title,
      href: courtMatchHref(match),
    });
    return { id: created.id, status: "ACCEPTED" as const, depositCode, paymentDueAt: paymentDueAt.toISOString() };
  });
}

/** `OPERATOR` 승인 방식일 때만 쓰인다. 자동 승인 코트 매칭에는 PENDING 신청이 없다. */
export async function decideCourtMatchApplication(
  prisma: PrismaClient,
  operator: { id: string },
  applicationId: string,
  input: CourtMatchDecisionInput,
) {
  return withCurrentCourtMatch(prisma, { applicationId }, async (transaction, now) => {
    const application = await transaction.matchApplication.findUnique({
      where: { id: applicationId },
      select: { ...applicantSelect, match: { select: courtMatchSelect } },
    });
    if (!application) throw new DomainError("APPLICATION_NOT_FOUND", 404, "신청을 찾을 수 없어요.");
    const match = application.match;
    assertCourtMatch(match);
    if (match.hostUserId !== operator.id) throw new DomainError("COURT_MATCH_OPERATOR_REQUIRED", 403, "이 코트 매칭을 연 운영자만 신청을 검토할 수 있어요.");
    if (match.courtSlot?.approvalMode !== "OPERATOR") throw new DomainError("APPROVAL_MODE_CONFLICT", 409, "자동 승인 매칭에서는 신청을 검토하지 않아요.");
    if (input.accept) await assertActiveTransactionUser(transaction, application.applicantUserId);
    assertAccepting(match, now, !input.accept);
    if (application.status !== "PENDING") throw new DomainError("APPLICATION_STATE_CONFLICT", 409, "이미 처리된 신청이에요.");
    if (match.status !== "OPEN") throw new DomainError("MATCH_STATE_CONFLICT", 409, "모집 중인 코트 매칭에서만 신청을 검토할 수 있어요.");

    if (!input.accept) {
      await transaction.matchApplication.update({ where: { id: applicationId }, data: { status: "REJECTED", decidedAt: now } });
      await recordApplicationNotification(transaction, {
        recipientUserId: application.applicantUserId,
        type: "APPLICATION_REJECTED",
        matchTitle: match.title,
        href: "/activity/sent",
      });
      return { id: applicationId, status: "REJECTED" as const, depositCode: null, paymentDueAt: null };
    }

    if (now >= getApplicationDeadline(match.startsAt)) {
      throw new DomainError("COURT_MATCH_APPLICATION_CLOSED", 409, "시작 90분 전이 지나 승인할 수 없어요.");
    }
    await assertSeatAvailable(transaction, match, application.applicantGender);

    const { depositCode, paymentDueAt } = await approveApplication(transaction, match, applicationId, now);
    await recordApplicationNotification(transaction, {
      recipientUserId: application.applicantUserId,
      type: "COURT_MATCH_DEPOSIT_REQUIRED",
      matchTitle: match.title,
      href: courtMatchHref(match),
    });
    return { id: applicationId, status: "ACCEPTED" as const, depositCode, paymentDueAt: paymentDueAt.toISOString() };
  });
}

/** 참가자가 계좌이체를 마쳤다고 알린다. 서비스는 송금을 확인하지 않고 기록만 남긴다. */
export async function claimCourtMatchDeposit(
  prisma: PrismaClient,
  viewer: { id: string },
  applicationId: string,
  input: DepositClaimInput,
) {
  return withCurrentCourtMatch(prisma, { applicationId }, async (transaction, now) => {
    const application = await transaction.matchApplication.findUnique({
      where: { id: applicationId },
      select: { ...applicantSelect, match: { select: courtMatchSelect } },
    });
    if (!application || application.applicantUserId !== viewer.id) {
      throw new DomainError("APPLICATION_NOT_FOUND", 404, "신청을 찾을 수 없어요.");
    }
    const match = application.match;
    assertCourtMatch(match);
    if (application.status !== "ACCEPTED") throw new DomainError("APPLICATION_STATE_CONFLICT", 409, "입금을 알릴 수 있는 상태가 아니에요.");
    await assertActiveTransactionUser(transaction, application.applicantUserId);
    assertAccepting(match, now, true);
    if (!application.paymentDueAt || now >= application.paymentDueAt) throw new DomainError("DEPOSIT_DEADLINE_PASSED", 409, "입금 기한이 지났어요.");

    await transaction.matchApplication.update({
      where: { id: applicationId },
      data: { depositorName: input.depositorName, depositClaimedAt: now },
    });
    await recordApplicationNotification(transaction, {
      recipientUserId: match.hostUserId,
      type: "COURT_MATCH_DEPOSIT_CLAIMED",
      matchTitle: match.title,
      href: `/partner/court-matches/${match.id}`,
    });
    return { id: applicationId, depositorName: input.depositorName, depositClaimedAt: now.toISOString() };
  }, { allowAfterApplicationDeadline: true });
}

/** 운영자가 통장에서 입금을 확인하고 참가를 확정한다. */
export async function confirmCourtMatchDeposit(prisma: PrismaClient, operator: { id: string }, applicationId: string) {
  return withCurrentCourtMatch(prisma, { applicationId }, async (transaction, now) => {
    const application = await transaction.matchApplication.findUnique({
      where: { id: applicationId },
      select: { ...applicantSelect, match: { select: courtMatchSelect } },
    });
    if (!application) throw new DomainError("APPLICATION_NOT_FOUND", 404, "신청을 찾을 수 없어요.");
    const match = application.match;
    assertCourtMatch(match);
    if (match.hostUserId !== operator.id) throw new DomainError("COURT_MATCH_OPERATOR_REQUIRED", 403, "이 코트 매칭을 연 운영자만 입금을 확인할 수 있어요.");
    if (application.status !== "ACCEPTED") throw new DomainError("APPLICATION_STATE_CONFLICT", 409, "입금을 확인할 수 있는 상태가 아니에요.");
    await assertActiveTransactionUser(transaction, application.applicantUserId);
    assertAccepting(match, now, true);
    const confirmationDueAt = application.confirmationDueAt ?? application.paymentDueAt;
    if (!confirmationDueAt || now >= confirmationDueAt) throw new DomainError("DEPOSIT_DEADLINE_PASSED", 409, "입금 확인 기한이 지났어요.");
    if (application.receivedAmountKrw === null || application.receivedAmountKrw < (match.totalCourtFeeKrw ?? 0) || !application.feeReceivedAt) {
      throw new DomainError("RECEIPT_REQUIRED", 409, "통장에서 확인한 수령 금액과 시각을 먼저 기록해 주세요.");
    }
    if (!application.paymentDueAt || application.feeReceivedAt > application.paymentDueAt) throw new DomainError("LATE_DEPOSIT", 409, "이체 기한 후 입금은 참가 확정에 사용할 수 없어요. 종료 후 반환해 주세요.");

    const confirmed = await transaction.matchApplication.updateMany({
      where: { id: applicationId, status: "ACCEPTED" },
      data: { status: "CONFIRMED", confirmedAt: now },
    });
    if (confirmed.count !== 1) throw new DomainError("APPLICATION_STATE_CONFLICT", 409, "이미 처리된 신청이에요.");

    await addAcceptedMemberToConversation(transaction, {
      matchId: match.id,
      hostUserId: match.hostUserId,
      applicantUserId: application.applicantUserId,
      now,
    });
    await recordApplicationNotification(transaction, {
      recipientUserId: application.applicantUserId,
      type: "COURT_MATCH_CONFIRMED",
      matchTitle: match.title,
      href: courtMatchHref(match),
    });

    // 정원이 다 차면 모집을 닫고 남은 대기 신청을 정리한다.
    const seats = await countConfirmed(transaction, match.id);
    if (seats >= match.recruitCount) {
      await transaction.match.update({ where: { id: match.id }, data: { status: "CLOSED", closedAt: now } });
      await transaction.matchApplication.updateMany({
        where: { matchId: match.id, status: "PENDING" },
        data: { status: "CANCELLED", cancelledAt: now },
      });
    }
    return { id: applicationId, status: "CONFIRMED" as const, confirmedAt: now.toISOString() };
  }, { allowAfterApplicationDeadline: true });
}

/**
 * 참가자가 스스로 참가를 취소한다(§3.7).
 *
 * 환불 금액은 취소 시점의 **한국 시간 날짜**로 정한다. 이틀 전까지 전액, 하루 전
 * 절반, 당일은 없다. 앱은 돈을 옮기지 않으므로 이 금액은 운영자가 얼마를 보내야
 * 하는지 적어 둔 기록이다.
 *
 * 미확정 신청은 자리를 철회한다. 실제 수령한 금액은 별도 금전 기록을 기준으로 전액 반환한다.
 *
 * 자리는 언제 취소하든 돌려준다. 남은 자리가 다시 열려야 운영자가 대체 참가자를
 * 받을 수 있고 현장 인원도 실제와 맞는다.
 */
/**
 * 자리가 비면 다시 모집 중으로 되돌린다.
 *
 * 정원이 차면 매칭을 `CLOSED`로 닫는데, 참가자가 취소해 자리가 생겨도 닫힌 채로 두면
 * 돌려준 자리를 아무도 쓸 수 없다. 신청 마감 전이라면 다시 열어 대체 참가자를 받는다.
 * 마감될 때 취소된 대기 신청은 되살리지 않는다. 이미 취소 알림을 받았기 때문이다.
 */
async function reopenIfSeatFreed(transaction: Transaction, match: CourtMatch, now: Date) {
  if (match.status !== "CLOSED" || now >= getApplicationDeadline(match.startsAt)) return;
  const seats = await countSeats(transaction, match.id);
  if (seats >= match.recruitCount) return;
  await transaction.match.updateMany({ where: { id: match.id, status: "CLOSED" }, data: { status: "OPEN", closedAt: null } });
}

export async function cancelCourtMatchApplication(prisma: PrismaClient, viewer: { id: string }, applicationId: string) {
  return withCurrentCourtMatch(prisma, { applicationId }, (tx, now) => cancelCourtApplicationLocked(tx, viewer, applicationId, now), { allowAfterApplicationDeadline: true });
}

/** Caller owns the account gate and match row lock. */
export async function cancelCourtApplicationLocked(transaction: Transaction, viewer: { id: string }, applicationId: string, now: Date) {
    const application = await transaction.matchApplication.findUnique({
      where: { id: applicationId },
      select: { ...applicantSelect, match: { select: courtMatchSelect } },
    });
    if (!application || application.applicantUserId !== viewer.id) {
      throw new DomainError("APPLICATION_NOT_FOUND", 404, "신청을 찾을 수 없어요.");
    }
    const match = application.match;
    assertCourtMatch(match);
    if (match.status === "CANCELLED") throw new DomainError("MATCH_CANCELLED", 409, "이미 취소된 코트 매칭이에요.");
    if (now >= match.startsAt) throw new DomainError("COURT_MATCH_ALREADY_STARTED", 409, "이미 시작한 코트 매칭이에요.");

    if (application.status === "PENDING" || application.status === "ACCEPTED") {
      await transaction.matchApplication.update({
        where: { id: applicationId },
        data: { status: "WITHDRAWN", withdrawnAt: now, participantCancelledAt: now },
      });
      await reopenIfSeatFreed(transaction, match, now);
      await recordApplicationNotification(transaction, {
        recipientUserId: match.hostUserId,
        type: "COURT_MATCH_PARTICIPANT_CANCELLED",
        matchTitle: match.title,
        href: `/partner/court-matches/${match.id}`,
      });
      return { id: applicationId, status: "WITHDRAWN" as const, refundAmountKrw: courtMoneySummary({ ...application, status: "WITHDRAWN" }, match.totalCourtFeeKrw ?? 0).outstandingKrw };
    }

    if (application.status !== "CONFIRMED") throw new DomainError("APPLICATION_STATE_CONFLICT", 409, "취소할 수 있는 상태가 아니에요.");

    const refundAmountKrw = getRefundAmountKrw(match.totalCourtFeeKrw ?? 0, now, match.startsAt);
    await transaction.matchApplication.update({
      where: { id: applicationId },
      data: { status: "CANCELLED", cancelledAt: now, participantCancelledAt: now, refundAmountKrw },
    });
    await reopenIfSeatFreed(transaction, match, now);
    await removeParticipantFromConversation(transaction, { matchId: match.id, userId: viewer.id, now });
    await recordApplicationNotification(transaction, {
      recipientUserId: match.hostUserId,
      type: "COURT_MATCH_PARTICIPANT_CANCELLED",
      matchTitle: match.title,
      href: `/partner/court-matches/${match.id}`,
    });
    return { id: applicationId, status: "CANCELLED" as const, refundAmountKrw: courtMoneySummary({ ...application, status: "CANCELLED", refundAmountKrw }, match.totalCourtFeeKrw ?? 0).outstandingKrw };
}

async function expireOverdueDeposits(transaction: Transaction, matchId: string, matchTitle: string, now: Date) {
  const overdue = await transaction.matchApplication.findMany({
    where: { matchId, status: "ACCEPTED", OR: [{ confirmationDueAt: { lte: now } }, { confirmationDueAt: null, paymentDueAt: { lte: now } }] },
    select: { id: true, applicantUserId: true },
  });
  if (!overdue.length) return 0;

  await transaction.matchApplication.updateMany({
    where: { id: { in: overdue.map((item) => item.id) } },
    data: { status: "EXPIRED_UNPAID", cancelledAt: now },
  });
  for (const item of overdue) {
    await recordApplicationNotification(transaction, {
      recipientUserId: item.applicantUserId,
      type: "COURT_MATCH_DEPOSIT_EXPIRED",
      matchTitle,
      href: "/activity/sent",
    });
  }
  return overdue.length;
}

async function cancelForShortfall(transaction: Transaction, match: CourtMatch, now: Date) {
  const minimum = match.courtSlot?.minParticipantCount ?? 0;
  const currentPolicy = match.courtCompositionPolicyVersion === courtCompositionPolicyVersion;
  // A passed judgement remains passed, including cancellation at the same millisecond.
  if (currentPolicy && match.courtCompositionPassedAt) return false;
  const judgementAt = getJudgementAt(match.startsAt);
  if (currentPolicy) {
    const applications = await transaction.matchApplication.findMany({
      where: { matchId: match.id, confirmedAt: { lte: judgementAt }, OR: [
        { status: "CONFIRMED" }, { status: "CANCELLED", participantCancelledAt: { gt: judgementAt } },
      ] }, select: { applicantGender: true },
    });
    const composition = checkCourtComposition(match.gameType, minimum, countCourtComposition(applications));
    if (composition.ready) {
      await transaction.match.update({ where: { id: match.id }, data: {
        courtCompositionPassedAt: now,
        courtCompositionSnapshot: { gameType: match.gameType, judgementAt: judgementAt.toISOString(), required: composition.required, counts: composition.counts },
      } });
      return false;
    }
  } else if (await countConfirmedAtJudgement(transaction, match.id, judgementAt) >= minimum) return false;

  await transaction.match.update({
    where: { id: match.id },
    data: { status: "CANCELLED", cancelledAt: now, cancellationReason: currentPolicy ? "진행에 필요한 경기 구성이 모이지 않아 취소됐어요." : "인원이 모이지 않아 자동으로 취소됐어요." },
  });
  const affected = await transaction.matchApplication.findMany({
    where: { matchId: match.id, status: { in: ["PENDING", "ACCEPTED", "CONFIRMED"] } },
    select: { id: true, applicantUserId: true },
  });
  await transaction.matchApplication.updateMany({
    where: { id: { in: affected.map((item) => item.id) } },
    data: { status: "CANCELLED", cancelledAt: now },
  });
  await makeConversationReadOnly(transaction, match.id, "코트 매칭이 취소되어 읽기 전용이에요.", now);
  await recordApplicationNotification(transaction, { recipientUserId: match.hostUserId, type: "COURT_MATCH_CANCELLED", matchTitle: match.title, href: `/partner/court-matches/${match.id}` });
  for (const item of affected) {
    await recordApplicationNotification(transaction, {
      recipientUserId: item.applicantUserId,
      type: "COURT_MATCH_CANCELLED",
      matchTitle: match.title,
      href: "/activity/sent",
    });
  }
  return true;
}

function isOperatorHostedActiveMatch(match: CourtMatch | null): match is CourtMatch {
  return Boolean(match && match.courtSource === "PARTNER_COURT" && ["OPEN", "CLOSED"].includes(match.status)
    && match.courtSlot?.courtUnit.court.operatorApplication.applicantUserId === match.hostUserId);
}

/**
 * 호출자는 Match 행 잠금을 보유해야 한다. 요청과 크론이 같은 판정을 사용한다.
 * 입금 기한 만료로 자리를 반환한 뒤, 판정 시점까지 확정된 최소 인원을 확인한다.
 */
export async function reconcileLockedCourtMatch(transaction: Transaction, match: CourtMatch | null, now: Date) {
  if (!isOperatorHostedActiveMatch(match)) return { expiredCount: 0, didCancel: false };
  const expiredCount = await expireOverdueDeposits(transaction, match.id, match.title, now);
  const didCancel = now >= getJudgementAt(match.startsAt) ? await cancelForShortfall(transaction, match, now) : false;
  if (!didCancel && now >= getApplicationDeadline(match.startsAt)) {
    await transaction.match.updateMany({ where: { id: match.id, status: "OPEN" }, data: { status: "CLOSED", closedAt: now } });
    await transaction.matchApplication.updateMany({ where: { matchId: match.id, status: "PENDING" }, data: { status: "CANCELLED", cancelledAt: now } });
  }
  return { expiredCount, didCancel };
}

export async function reconcileCourtMatch(prisma: PrismaClient, matchId: string, at?: Date) {
  return prisma.$transaction(async (transaction) => {
    await lockCourtMatch(transaction, matchId);
    const now = at ?? new Date();
    const match = await transaction.match.findUnique({ where: { id: matchId }, select: courtMatchSelect });
    return reconcileLockedCourtMatch(transaction, match, now);
  });
}

export async function reconcileCourtMatches(prisma: PrismaClient, now?: Date) {
  const matches = await prisma.match.findMany({
    where: { courtSource: "PARTNER_COURT", status: { in: ["OPEN", "CLOSED"] } },
    select: courtMatchSelect,
  });

  let expired = 0;
  let cancelled = 0;
  for (const match of matches) {
    const result = await reconcileCourtMatch(prisma, match.id, now);
    expired += result.expiredCount;
    if (result.didCancel) cancelled += 1;
  }

  return { checked: matches.length, expired, cancelled };
}

import { Prisma } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

import { addAcceptedMemberToConversation, makeConversationReadOnly } from "@/server/domain/match-chat-service";
import { recordApplicationNotification } from "@/server/domain/notification-service";
import { DomainError } from "@/server/domain/profile-service";
import type { ProfileWithRelations } from "./profile-service";
import { toProfileSnapshot } from "./match-service";

import {
  getApplicationDeadline,
  getJudgementAt,
  getPaymentDueAt,
  makeDepositCode,
  seatHoldingStatuses,
  type CourtMatchDecisionInput,
  type DepositClaimInput,
  type RefundAccountInput,
} from "./court-match";

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
  applicantGender: true,
  depositCode: true,
  paymentDueAt: true,
  depositorName: true,
  depositClaimedAt: true,
  confirmedAt: true,
  refundCompletedAt: true,
  refundBank: true,
} satisfies Prisma.MatchApplicationSelect;

const courtMatchSelect = {
  id: true,
  hostUserId: true,
  title: true,
  status: true,
  startsAt: true,
  courtSource: true,
  recruitCount: true,
  maleRecruitCount: true,
  femaleRecruitCount: true,
  courtSlot: { select: { id: true, status: true, approvalMode: true, minParticipantCount: true, courtUnit: { select: { court: { select: { status: true, operatorApplication: { select: { applicantUserId: true, status: true } } } } } } } },
} satisfies Prisma.MatchSelect;

type CourtMatch = Prisma.MatchGetPayload<{ select: typeof courtMatchSelect }>;

// All seat and payment mutations for one match share this row lock, including the cron.
async function lockCourtMatch(transaction: Transaction, matchId: string) {
  await transaction.$queryRaw(Prisma.sql`SELECT id FROM matches WHERE id = ${matchId}::uuid FOR UPDATE`);
}

async function lockApplicationMatch(transaction: Transaction, applicationId: string) {
  const application = await transaction.matchApplication.findUnique({ where: { id: applicationId }, select: { matchId: true } });
  if (application) await lockCourtMatch(transaction, application.matchId);
}

/**
 * 코트 매칭 상세의 정본 주소는 슬롯 쪽이다. `/matches/{id}`로 보내면 리다이렉트로
 * 한 번 더 튄다. 옛 기록처럼 슬롯이 없으면 기존 주소로 떨어뜨린다.
 */
function courtMatchHref(match: CourtMatch) {
  return match.courtSlot ? `/partner-sessions/${match.courtSlot.id}` : `/matches/${match.id}`;
}

function assertAccepting(match: CourtMatch, now: Date) {
  const court = match.courtSlot?.courtUnit.court;
  if (!court || court.operatorApplication.applicantUserId !== match.hostUserId || court.status !== "ACTIVE" || court.operatorApplication.status !== "PUBLISH_APPROVED" || match.courtSlot?.status !== "AVAILABLE") {
    throw new DomainError("COURT_MATCH_UNAVAILABLE", 409, "현재 참가를 진행할 수 없는 코트 매칭이에요.");
  }
  if (match.status !== "OPEN" && match.status !== "CLOSED") throw new DomainError("MATCH_STATE_CONFLICT", 409, "취소되거나 종료된 코트 매칭이에요.");
  if (now >= getApplicationDeadline(match.startsAt)) throw new DomainError("COURT_MATCH_APPLICATION_CLOSED", 409, "참가 신청과 입금 기한이 지났어요.");
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
function countConfirmed(transaction: Transaction, matchId: string) {
  return transaction.matchApplication.count({ where: { matchId, status: "CONFIRMED" } });
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
    data: { status: "ACCEPTED", decidedAt: now, depositCode, paymentDueAt },
  });
  return { depositCode, paymentDueAt };
}

export async function applyToCourtMatch(
  prisma: PrismaClient,
  viewer: { id: string; profile: ProfileWithRelations },
  matchId: string,
  input: { message?: string } = {},
) {
  const now = new Date();
  return prisma.$transaction(async (transaction) => {
    await lockCourtMatch(transaction, matchId);
    const match = await transaction.match.findUnique({ where: { id: matchId }, select: courtMatchSelect });
    assertCourtMatch(match);

    if (match.hostUserId === viewer.id) throw new DomainError("OWN_MATCH_APPLICATION_NOT_ALLOWED", 409, "내가 연 코트 매칭에는 신청할 수 없어요.");
    if (match.status === "CANCELLED") throw new DomainError("MATCH_CANCELLED", 409, "취소된 코트 매칭이에요.");
    if (match.status !== "OPEN") throw new DomainError("MATCH_ALREADY_CLOSED", 409, "모집이 마감된 코트 매칭이에요.");
    if (now >= getApplicationDeadline(match.startsAt)) {
      throw new DomainError("COURT_MATCH_APPLICATION_CLOSED", 409, "시작 30분 전까지만 신청할 수 있어요.");
    }
    assertAccepting(match, now);
    if (!viewer.profile.gender) throw new DomainError("PROFILE_GENDER_REQUIRED", 409, "프로필에 성별을 입력해 주세요.");
    if (now >= getJudgementAt(match.startsAt) && await countConfirmed(transaction, match.id) < (match.courtSlot?.minParticipantCount ?? 0)) {
      throw new DomainError("COURT_MATCH_MINIMUM_NOT_MET", 409, "최소 인원이 모이지 않아 참가 신청이 종료됐어요.");
    }

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
  const now = new Date();
  return prisma.$transaction(async (transaction) => {
    await lockApplicationMatch(transaction, applicationId);
    const application = await transaction.matchApplication.findUnique({
      where: { id: applicationId },
      select: { ...applicantSelect, match: { select: courtMatchSelect } },
    });
    if (!application) throw new DomainError("APPLICATION_NOT_FOUND", 404, "신청을 찾을 수 없어요.");
    const match = application.match;
    assertCourtMatch(match);
    if (match.hostUserId !== operator.id) throw new DomainError("COURT_MATCH_OPERATOR_REQUIRED", 403, "이 코트 매칭을 연 운영자만 신청을 검토할 수 있어요.");
    if (match.courtSlot?.approvalMode !== "OPERATOR") throw new DomainError("APPROVAL_MODE_CONFLICT", 409, "자동 승인 매칭에서는 신청을 검토하지 않아요.");
    assertAccepting(match, now);
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
      throw new DomainError("COURT_MATCH_APPLICATION_CLOSED", 409, "시작 30분 전이 지나 승인할 수 없어요.");
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
  const now = new Date();
  return prisma.$transaction(async (transaction) => {
    await lockApplicationMatch(transaction, applicationId);
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
    assertAccepting(match, now);
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
  });
}

/** 운영자가 통장에서 입금을 확인하고 참가를 확정한다. */
export async function confirmCourtMatchDeposit(prisma: PrismaClient, operator: { id: string }, applicationId: string) {
  const now = new Date();
  return prisma.$transaction(async (transaction) => {
    await lockApplicationMatch(transaction, applicationId);
    const application = await transaction.matchApplication.findUnique({
      where: { id: applicationId },
      select: { ...applicantSelect, match: { select: courtMatchSelect } },
    });
    if (!application) throw new DomainError("APPLICATION_NOT_FOUND", 404, "신청을 찾을 수 없어요.");
    const match = application.match;
    assertCourtMatch(match);
    if (match.hostUserId !== operator.id) throw new DomainError("COURT_MATCH_OPERATOR_REQUIRED", 403, "이 코트 매칭을 연 운영자만 입금을 확인할 수 있어요.");
    if (application.status !== "ACCEPTED") throw new DomainError("APPLICATION_STATE_CONFLICT", 409, "입금을 확인할 수 있는 상태가 아니에요.");
    assertAccepting(match, now);
    if (!application.paymentDueAt || now >= application.paymentDueAt) throw new DomainError("DEPOSIT_DEADLINE_PASSED", 409, "입금 확인 기한이 지났어요.");

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
  });
}

/** 취소가 실제로 난 뒤에만 환불받을 계좌를 받는다(§3.9). */
export async function submitCourtMatchRefundAccount(
  prisma: PrismaClient,
  viewer: { id: string },
  applicationId: string,
  input: RefundAccountInput,
) {
  const now = new Date();
  const application = await prisma.matchApplication.findUnique({
    where: { id: applicationId },
    select: { ...applicantSelect, match: { select: { courtSource: true } } },
  });
  if (!application || application.applicantUserId !== viewer.id) {
    throw new DomainError("APPLICATION_NOT_FOUND", 404, "신청을 찾을 수 없어요.");
  }
  if (application.match.courtSource !== "PARTNER_COURT") throw new DomainError("NOT_A_COURT_MATCH", 409, "이 매칭은 코트 매칭이 아니에요.");
  if (application.status !== "CANCELLED" || !application.confirmedAt) {
    throw new DomainError("REFUND_NOT_APPLICABLE", 409, "환불 대상이 아니에요.");
  }
  if (application.refundCompletedAt) throw new DomainError("REFUND_ALREADY_COMPLETED", 409, "이미 환불 완료로 표시됐어요.");

  await prisma.matchApplication.update({
    where: { id: applicationId },
    data: {
      refundBank: input.bank,
      refundAccountNumber: input.accountNumber,
      refundAccountHolder: input.accountHolder,
      refundRequestedAt: now,
    },
  });
  return { id: applicationId, refundRequestedAt: now.toISOString() };
}

/**
 * 운영자가 환불했다고 표시한다. 서비스는 송금을 대행하거나 확인하지 않으므로
 * 이 기록은 송금 증명이 아니다. 화면에서 그렇게 안내해야 한다(§3.9).
 */
export async function completeCourtMatchRefund(prisma: PrismaClient, operator: { id: string }, applicationId: string) {
  const now = new Date();
  return prisma.$transaction(async (transaction) => {
    await lockApplicationMatch(transaction, applicationId);
    const application = await transaction.matchApplication.findUnique({
      where: { id: applicationId },
      select: { ...applicantSelect, match: { select: courtMatchSelect } },
    });
    if (!application) throw new DomainError("APPLICATION_NOT_FOUND", 404, "신청을 찾을 수 없어요.");
    const match = application.match;
    assertCourtMatch(match);
    if (match.hostUserId !== operator.id) throw new DomainError("COURT_MATCH_OPERATOR_REQUIRED", 403, "이 코트 매칭을 연 운영자만 환불을 표시할 수 있어요.");
    if (application.status !== "CANCELLED" || !application.confirmedAt) {
      throw new DomainError("REFUND_NOT_APPLICABLE", 409, "환불 대상이 아니에요.");
    }
    if (application.refundCompletedAt) throw new DomainError("REFUND_ALREADY_COMPLETED", 409, "이미 환불 완료로 표시됐어요.");
    if (!application.refundBank) throw new DomainError("REFUND_ACCOUNT_REQUIRED", 409, "참가자가 환불 계좌를 입력한 뒤 처리해 주세요.");

    await transaction.matchApplication.update({ where: { id: applicationId }, data: { refundCompletedAt: now } });
    await recordApplicationNotification(transaction, {
      recipientUserId: application.applicantUserId,
      type: "COURT_MATCH_REFUND_COMPLETED",
      matchTitle: match.title,
      href: "/activity/sent",
    });
    return { id: applicationId, refundCompletedAt: now.toISOString() };
  });
}

async function expireOverdueDeposits(transaction: Transaction, matchId: string, matchTitle: string, now: Date) {
  const overdue = await transaction.matchApplication.findMany({
    where: { matchId, status: "ACCEPTED", paymentDueAt: { lte: now } },
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
  const confirmed = await countConfirmed(transaction, match.id);
  if (confirmed >= minimum) return false;

  await transaction.match.update({
    where: { id: match.id },
    data: { status: "CANCELLED", cancelledAt: now, cancellationReason: "인원이 모이지 않아 자동으로 취소됐어요." },
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

/**
 * 코트 매칭의 시간 기반 정리. 크론에서 주기적으로 부른다.
 *
 * 1. 입금 기한이 지난 승인 건을 `EXPIRED_UNPAID`로 돌려 자리를 반환한다.
 * 2. 판정 시점(시작 3시간 전)을 지난 코트 매칭 중 입금 완료 인원이 최소 인원에
 *    미달하면 자동으로 취소한다.
 *
 * 순서가 중요하다. 기한 만료를 먼저 처리해야 미달 판정이 실제 입금 인원을 본다.
 */
export async function reconcileCourtMatches(prisma: PrismaClient, now = new Date()) {
  const matches = await prisma.match.findMany({
    where: { courtSource: "PARTNER_COURT", status: { in: ["OPEN", "CLOSED"] } },
    select: courtMatchSelect,
  });

  let expired = 0;
  let cancelled = 0;
  for (const match of matches) {
    const result = await prisma.$transaction(async (transaction) => {
      await lockCourtMatch(transaction, match.id);
      const current = await transaction.match.findUnique({ where: { id: match.id }, select: courtMatchSelect });
      if (!current || !["OPEN", "CLOSED"].includes(current.status) || current.courtSlot?.courtUnit.court.operatorApplication.applicantUserId !== current.hostUserId) return { expiredCount: 0, didCancel: false };
      const expiredCount = await expireOverdueDeposits(transaction, current.id, current.title, now);
      const judged = now >= getJudgementAt(current.startsAt);
      const didCancel = judged ? await cancelForShortfall(transaction, current, now) : false;
      if (!didCancel && now >= getApplicationDeadline(current.startsAt)) {
        await transaction.match.updateMany({ where: { id: current.id, status: "OPEN" }, data: { status: "CLOSED", closedAt: now } });
        await transaction.matchApplication.updateMany({ where: { matchId: current.id, status: "PENDING" }, data: { status: "CANCELLED", cancelledAt: now } });
      }
      return { expiredCount, didCancel };
    });
    expired += result.expiredCount;
    if (result.didCancel) cancelled += 1;
  }

  return { checked: matches.length, expired, cancelled };
}

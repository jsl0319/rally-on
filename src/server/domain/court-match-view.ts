import { assertHandoffAccess } from "./court-transaction-handoff";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { DomainError } from "./profile-service";
import { reconcileCourtMatch } from "./court-match-service";
import { getApplicationDeadline, getJudgementAt, getRefundAmountKrw, getRefundPercent, canAcceptCourtApplication, seatHoldingStatuses } from "./court-match";

import { courtMoneySummary } from "./court-match-money";

const applicationSelect = {
  id: true, applicantUserId: true, applicantGender: true, status: true, createdAt: true,
  message: true, profileSnapshot: true, paymentDueAt: true, depositCode: true,
  depositorName: true, depositClaimedAt: true, confirmedAt: true,
  refundBank: true, refundAccountNumber: true, refundAccountHolder: true,
  refundRequestedAt: true, refundCompletedAt: true, refundAmountKrw: true, participantCancelledAt: true,
  confirmationDueAt: true, receivedAmountKrw: true, lastReceivedAt: true, feeReceivedAt: true, receiptVersion: true,
  refundAccountVersion: true, legacyRefundPaidKrw: true,
  receiptRecords: { orderBy: { version: "desc" } },
  refundAttempts: { orderBy: { createdAt: "desc" }, include: { events: { orderBy: { createdAt: "asc" } } } },
  applicantUser: { select: { nickname: true } },
} satisfies Prisma.MatchApplicationSelect;

const matchInclude = {
  applications: { select: applicationSelect, orderBy: { createdAt: "asc" } },
  conversation: { select: { status: true } },
  host: { select: { status: true } },
  courtSlot: { include: { courtUnit: { include: { court: { include: { operatorApplication: { select: { applicantUserId: true } } } } } } } },
} satisfies Prisma.MatchInclude;

type Application = Prisma.MatchApplicationGetPayload<{ select: typeof applicationSelect }>;
type Match = Prisma.MatchGetPayload<{ include: typeof matchInclude }>;

export function courtApplicationStatusLabel(application: Pick<Application, "status" | "depositClaimedAt" | "confirmedAt" | "refundCompletedAt" | "refundAmountKrw">) {
  if (application.status === "CANCELLED" && application.confirmedAt) {
    if (application.refundAmountKrw === 0) return "취소됨 · 환불 없음";
    return application.refundCompletedAt ? "환불 완료 표시" : "환불 대기";
  }
  if (application.status === "ACCEPTED" && application.depositClaimedAt) return "입금 확인 중";
  return ({ PENDING: "승인 대기", ACCEPTED: "입금 대기", CONFIRMED: "참가 확정", REJECTED: "신청 거절", WITHDRAWN: "신청 철회", EXPIRED_UNPAID: "입금 기한 만료", CANCELLED: "취소됨" } as const)[application.status];
}

function toApplication(application: Application, fee: number, operator = false) {
  const money = courtMoneySummary(application, fee);
  const activeRefund = application.refundAttempts.find((r) => r.status === "PROCESSING" || r.status === "REVIEW");
  return {
    money, refundAccountVersion: application.refundAccountVersion,
    refundLocked: Boolean(activeRefund),
    receiptVersion: application.receiptVersion,
    receivedAmountKrw: application.receivedAmountKrw,
    lastReceivedAt: application.lastReceivedAt?.toISOString() ?? null,
    feeReceivedAt: application.feeReceivedAt?.toISOString() ?? null,
    confirmationDueAt: (application.confirmationDueAt ?? application.paymentDueAt)?.toISOString() ?? null,
    receiptRecords: operator ? application.receiptRecords.map((r) => ({ id: r.id, version: r.version, amountKrw: r.amountKrw, previousAmountKrw: r.previousAmountKrw, receivedAt: r.receivedAt?.toISOString() ?? null, feeReceivedAt: r.feeReceivedAt?.toISOString() ?? null, note: r.note, createdAt: r.createdAt.toISOString() })) : [],
    refundAttempts: application.refundAttempts.map((r) => ({
      id: r.id, status: r.status, version: r.version, amountKrw: r.amountKrw,
      bank: r.bank, accountNumber: r.accountNumber, accountHolder: r.accountHolder,
      createdAt: r.createdAt.toISOString(), transferredAt: r.transferredAt?.toISOString() ?? null,
      events: operator ? r.events.map((e) => ({ id: e.id, status: e.status, note: e.note, createdAt: e.createdAt.toISOString() })) : [],
    })),
    id: application.id, nickname: application.applicantUser.nickname, gender: application.applicantGender,
    status: application.status, statusLabel: activeRefund ? activeRefund.status === "REVIEW" ? "환불 확인 필요" : "환불 처리 중" : money.outstandingKrw > 0 ? "환불 대기" : courtApplicationStatusLabel(application),
    createdAt: application.createdAt.toISOString(), depositCode: application.depositCode,
    paymentDueAt: application.paymentDueAt?.toISOString() ?? null,
    depositorName: application.depositorName, depositClaimedAt: application.depositClaimedAt?.toISOString() ?? null,
    confirmedAt: application.confirmedAt?.toISOString() ?? null,
    awaitingRefund: money.outstandingKrw > 0 || Boolean(activeRefund),
    refundAccount: application.refundBank
      ? { bank: application.refundBank, accountNumber: application.refundAccountNumber!, accountHolder: application.refundAccountHolder! } : null,
    refundRequestedAt: application.refundRequestedAt?.toISOString() ?? null,
    refundCompletedAt: application.refundCompletedAt?.toISOString() ?? null,
    refundAmountKrw: application.refundAmountKrw,
    participantCancelledAt: application.participantCancelledAt?.toISOString() ?? null,
  };
}

function summary(match: Match) {
  const seats = match.applications.filter((a) => seatHoldingStatuses.some((s) => s === a.status));
  const confirmed = match.applications.filter((a) => a.status === "CONFIRMED");
  return {
    id: match.id, slotId: match.courtSlotId, status: match.status,
    title: match.courtSlot?.courtUnit.court.name ?? match.title,
    startsAt: match.startsAt.toISOString(), endsAt: match.endsAt.toISOString(),
    guestFeeKrw: match.totalCourtFeeKrw ?? 0,
    approvalMode: match.courtSlot?.approvalMode ?? "OPERATOR",
    minParticipantCount: match.courtSlot?.minParticipantCount ?? 0,
    maxParticipantCount: match.recruitCount, seatCount: seats.length, confirmedCount: confirmed.length,
    remainingSpots: Math.max(0, match.recruitCount - seats.length),
    remainingGenderSpots: match.maleRecruitCount !== null && match.femaleRecruitCount !== null ? {
      male: Math.max(0, match.maleRecruitCount - seats.filter((a) => a.applicantGender === "MALE").length),
      female: Math.max(0, match.femaleRecruitCount - seats.filter((a) => a.applicantGender === "FEMALE").length),
    } : null,
    applicationDeadline: getApplicationDeadline(match.startsAt).toISOString(),
    judgementAt: getJudgementAt(match.startsAt).toISOString(),
    cancellationReason: match.cancellationReason,
  };
}

async function readMatch(prisma: PrismaClient, matchId: string) {
  await reconcileCourtMatch(prisma, matchId);
  const match = await prisma.match.findUnique({ where: { id: matchId }, include: matchInclude });
  if (!match || match.courtSource !== "PARTNER_COURT") throw new DomainError("MATCH_NOT_FOUND", 404, "코트 매칭을 찾을 수 없어요.");
  return match;
}

/** Caller must first authorize access to the public slot (including private participant history). */
export async function getCourtMatchParticipation(prisma: PrismaClient, viewer: { id: string; profile: { gender: "MALE" | "FEMALE" | null } }, matchId: string) {
  const match = await readMatch(prisma, matchId);
  const application = match.applications.find((a) => a.applicantUserId === viewer.id);
  const info = summary(match);
  const isOperator = match.hostUserId === viewer.id;
  const legacy = !match.courtSlot || match.courtSlot.courtUnit.court.operatorApplication.applicantUserId !== match.hostUserId;
  let blockedReason: string | null = null;
  if (legacy) blockedReason = "이전 방식으로 개설된 코트 매칭은 새 신청을 받지 않아요.";
  else if (match.host.status !== "ACTIVE") blockedReason = "운영이 중단되어 신규 신청을 받지 않아요.";
  else if (isOperator) blockedReason = "내가 개설한 코트 매칭이에요.";
  else if (application) blockedReason = "이미 신청한 코트 매칭이에요.";
  else if (match.status !== "OPEN" || match.courtSlot?.status !== "AVAILABLE") blockedReason = "지금은 참가 신청을 받지 않아요.";
  else if (!canAcceptCourtApplication(new Date(), match.startsAt)) blockedReason = "참가 신청이 마감됐어요.";
  else if (!viewer.profile.gender) blockedReason = "프로필에 성별을 입력해 주세요.";
  else if (info.remainingSpots === 0) blockedReason = "남은 자리가 없어요.";
  else if (info.remainingGenderSpots && (viewer.profile.gender === "MALE" ? info.remainingGenderSpots.male : info.remainingGenderSpots.female) === 0) blockedReason = "해당 성별의 자리가 모두 찼어요.";

  const operationsPaused = match.host.status !== "ACTIVE";
  const canSeeAccount = !operationsPaused && (application?.status === "ACCEPTED" || application?.status === "CONFIRMED");
  // 취소는 시작 전까지 언제든 되지만, 지금 누르면 얼마가 돌아오는지 먼저 보여 준다(§3.7).
  const now = new Date();
  const cancellable = application !== undefined
    && ["PENDING", "ACCEPTED", "CONFIRMED"].includes(application.status)
    && match.status !== "CANCELLED"
    && now < match.startsAt;
  return {
    ...info, isOperator, legacy, operationsPaused, canApply: blockedReason === null, blockedReason,
    application: application ? toApplication(application, info.guestFeeKrw) : null,
    cancellation: cancellable && application
      ? {
        refundPercent: application.status === "CONFIRMED" ? getRefundPercent(now, match.startsAt) : 0,
        refundAmountKrw: courtMoneySummary({ ...application, status: "CANCELLED", refundAmountKrw: application.status === "CONFIRMED" ? getRefundAmountKrw(info.guestFeeKrw, now, match.startsAt) : null }, info.guestFeeKrw).outstandingKrw,
        paidBeforeConfirmation: application.status === "ACCEPTED" && application.depositClaimedAt !== null,
      }
      : null,
    settlementAccount: canSeeAccount && match.settlementBank && match.settlementAccountNumber && match.settlementAccountHolder
      ? { bank: match.settlementBank, accountNumber: match.settlementAccountNumber, accountHolder: match.settlementAccountHolder } : null,
    chatHref: match.conversation && (isOperator || (application?.status === "CONFIRMED" || (match.status === "CANCELLED" && application?.confirmedAt && !application.participantCancelledAt)) || (legacy && application?.status === "ACCEPTED")) ? `/chats/${match.id}` : null,
  };
}

export async function getOperatorCourtMatch(prisma: PrismaClient, viewer: { id: string }, matchId: string, handoff = false) {
  if (handoff) await assertHandoffAccess(prisma, viewer.id, matchId);
  const match = await readMatch(prisma, matchId);
  if (!handoff && (match.hostUserId !== viewer.id || match.courtSlot?.courtUnit.court.operatorApplication.applicantUserId !== viewer.id)) {
    throw new DomainError("COURT_MATCH_OPERATOR_REQUIRED", 403, "이 코트 매칭을 연 운영자만 조회할 수 있어요.");
  }
  const showProfile = !handoff && match.courtSlot?.approvalMode === "OPERATOR";
  return {
    ...summary(match),
    applications: match.applications.map((application) => ({
      ...toApplication(application, match.totalCourtFeeKrw ?? 0, true),
      ...(showProfile ? { profileSnapshot: application.profileSnapshot, message: application.message } : {}),
    })),
  };
}

export type CourtMatchParticipation = Awaited<ReturnType<typeof getCourtMatchParticipation>>;
export type OperatorCourtMatch = Awaited<ReturnType<typeof getOperatorCourtMatch>>;

export async function getMyCourtTransactions(prisma: PrismaClient, userId: string) {
  const matches = await prisma.match.findMany({ where: { courtSource: "PARTNER_COURT", OR: [{ hostUserId: userId }, { applications: { some: { applicantUserId: userId } } }] }, orderBy: [{ startsAt: "desc" }, { id: "asc" }], select: { id: true, title: true, startsAt: true, hostUserId: true, totalCourtFeeKrw: true } });
  for (const match of matches) await reconcileCourtMatch(prisma, match.id);
  const applications = await prisma.matchApplication.findMany({ where: { applicantUserId: userId, match: { courtSource: "PARTNER_COURT" } }, select: { ...applicationSelect, matchId: true } });
  return { items: matches.map((m) => {
    const a = applications.find((a) => a.matchId === m.id);
    return { id: m.id, title: m.title, startsAt: m.startsAt.toISOString(), isHost: m.hostUserId === userId, application: a ? toApplication(a, m.totalCourtFeeKrw ?? 0) : null };
  }) };
}
export type MyCourtTransactions = Awaited<ReturnType<typeof getMyCourtTransactions>>;

import { z } from "zod";

/**
 * 운영자 주최 코트 매칭의 계좌이체 흐름 규칙.
 * 설계 근거는 docs/03-2-court-match-operator-hosted-redesign.md §3.1~§3.2.
 */

/** 자동 취소 판정 시점: 시작 3시간 전. */
export const autoCancelLeadMinutes = 180;

/** 승인 뒤 기본 입금 기한. */
export const depositWindowMinutes = 360;

/** 판정 시점이 지난 뒤의 신청 마감이자 그때의 입금 기한: 시작 30분 전. */
export const lateApplicationLeadMinutes = 30;

export function getJudgementAt(startsAt: Date) {
  return new Date(startsAt.getTime() - autoCancelLeadMinutes * 60_000);
}

export function getApplicationDeadline(startsAt: Date) {
  return new Date(startsAt.getTime() - lateApplicationLeadMinutes * 60_000);
}

/**
 * 입금 기한. 판정 전에는 `min(지금 + 6시간, 판정 시점)`이다. 최소 인원을 입금 완료
 * 인원으로 세기 때문에(§3.2), 기한이 판정 시점보다 늦으면 "자리는 찼는데 돈은 안 낸"
 * 상태로 판정을 맞게 된다. 판정 시점이 지난 뒤의 신청은 시작 30분 전까지다.
 */
export function getPaymentDueAt(now: Date, startsAt: Date) {
  const judgementAt = getJudgementAt(startsAt);
  if (now >= judgementAt) return getApplicationDeadline(startsAt);
  return new Date(Math.min(now.getTime() + depositWindowMinutes * 60_000, judgementAt.getTime()));
}

/**
 * 참가자 취소 환불 단계(§3.7). 시각이 아니라 **한국 시간 날짜**를 센다.
 * "이틀 전"이라고 안내해 놓고 시각 차이 때문에 절반만 돌려주면 설명할 수 없다.
 * 한국은 서머타임이 없어 고정 +9로 날짜를 계산해도 어긋나지 않는다.
 */
const seoulOffsetMs = 9 * 60 * 60_000;
const dayMs = 24 * 60 * 60_000;

function seoulDayNumber(date: Date) {
  return Math.floor((date.getTime() + seoulOffsetMs) / dayMs);
}

/** 매칭 시작일까지 며칠 남았는지. 같은 날이면 0. */
export function daysBeforeMatchDate(cancelledAt: Date, startsAt: Date) {
  return seoulDayNumber(startsAt) - seoulDayNumber(cancelledAt);
}

/** 이틀 전까지 전액, 하루 전 절반, 당일은 없음. */
export function getRefundPercent(cancelledAt: Date, startsAt: Date) {
  const daysBefore = daysBeforeMatchDate(cancelledAt, startsAt);
  if (daysBefore >= 2) return 100;
  if (daysBefore === 1) return 50;
  return 0;
}

/** 원 단위로 내림한다. 참가자에게 더 주는 반올림보다 운영자 정산이 단순하다. */
export function getRefundAmountKrw(guestFeeKrw: number, cancelledAt: Date, startsAt: Date) {
  return Math.floor((guestFeeKrw * getRefundPercent(cancelledAt, startsAt)) / 100);
}

/**
 * 자리를 차지하는 신청 상태. 진행 여부 판정(`CONFIRMED`만)과 기준이 다르다.
 * 승인만 받고 입금하지 않은 사람도 자리는 잡고 있어야 초과 승인이 나지 않는다.
 */
export const seatHoldingStatuses = ["ACCEPTED", "CONFIRMED"] as const;

/**
 * 입금자명 뒤에 붙여 통장 내역과 대조하는 3자리 코드. 은행 앱에서 입금자명을 바꿀 수
 * 있어 이름만으로는 누가 보낸 돈인지 특정할 수 없다(§3.4).
 */
export function makeDepositCode() {
  return String(100 + Math.floor(Math.random() * 900));
}

export const depositClaimInputSchema = z.object({
  depositorName: z.string().trim().min(1, "입금자명을 입력해 주세요.").max(50, "입금자명은 50자 이하로 입력해 주세요."),
});

export type DepositClaimInput = z.infer<typeof depositClaimInputSchema>;

export const refundAccountInputSchema = z.object({
  bank: z.string().trim().min(1, "은행을 선택해 주세요.").max(50),
  accountNumber: z.string().trim().regex(/^[0-9-]{5,40}$/, "계좌번호는 숫자와 하이픈으로 5~40자 입력해 주세요.").refine((value) => /[0-9]/.test(value), "계좌번호를 확인해 주세요."),
  accountHolder: z.string().trim().min(1, "예금주를 입력해 주세요.").max(50),
});

export type RefundAccountInput = z.infer<typeof refundAccountInputSchema>;

export const courtMatchDecisionInputSchema = z.object({
  accept: z.boolean(),
});

export type CourtMatchDecisionInput = z.infer<typeof courtMatchDecisionInputSchema>;

export const courtMatchApplicationInputSchema = z.object({
  message: z.string().trim().max(200, "자기소개는 200자까지 입력해 주세요.").optional(),
});

/**
 * 환불 대기는 별도 상태가 아니라 이 조건의 조합이다(§4.2).
 * 환불 금액이 0원인 당일 취소는 돌려줄 것이 없으므로 환불 대기가 아니다.
 * `refundAmountKrw`가 null이면 앱 사유 취소이거나 이 열이 생기기 전의 기록으로 전액이다.
 */
export function isAwaitingRefund(application: { status: string; confirmedAt: Date | null; refundCompletedAt: Date | null; refundAmountKrw?: number | null }) {
  return application.status === "CANCELLED"
    && application.confirmedAt !== null
    && application.refundCompletedAt === null
    && application.refundAmountKrw !== 0;
}

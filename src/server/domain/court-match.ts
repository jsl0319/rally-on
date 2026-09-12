import { z } from "zod";

/**
 * 운영자 주최 코트 매칭의 계좌이체 흐름 규칙.
 * 설계 근거는 docs/03-2-court-match-operator-hosted-redesign.md §3.1~§3.2.
 */

/** 자동 취소 판정 시점: 시작 3시간 전. */
export const autoCancelLeadMinutes = 180;

/** 승인 뒤 기본 입금 기한. */
export const depositWindowMinutes = 360;

/** 추가 모집은 이체·대조에 각각 30분을 남긴다. */
export const lateApplicationLeadMinutes = 90;
export const confirmationWindowMinutes = 30;

export function getJudgementAt(startsAt: Date) {
  return new Date(startsAt.getTime() - autoCancelLeadMinutes * 60_000);
}

export function getApplicationDeadline(startsAt: Date) {
  return new Date(startsAt.getTime() - lateApplicationLeadMinutes * 60_000);
}

export function getPaymentDueAt(now: Date, startsAt: Date) {
  if (now >= getJudgementAt(startsAt)) return new Date(startsAt.getTime() - 60 * 60_000);
  return new Date(Math.min(now.getTime() + depositWindowMinutes * 60_000, getJudgementAt(startsAt).getTime() - 30 * 60_000));
}

export function getConfirmationDueAt(paymentDueAt: Date) {
  return new Date(paymentDueAt.getTime() + confirmationWindowMinutes * 60_000);
}

export function getLateConfirmationDeadline(startsAt: Date) {
  return getConfirmationDueAt(getPaymentDueAt(getJudgementAt(startsAt), startsAt));
}

export function canAcceptCourtApplication(now: Date, startsAt: Date) {
  return now < getApplicationDeadline(startsAt) && getPaymentDueAt(now, startsAt).getTime() - now.getTime() >= 30 * 60_000;
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
  noticeAccepted: z.literal(true, { error: "신청 조건과 환불 안내를 확인해 주세요." }),
  noticeFingerprint: z.string().regex(/^[a-f0-9]{64}$/, "최신 신청 조건을 다시 확인해 주세요."),
  message: z.string().trim().max(200, "자기소개는 200자까지 입력해 주세요.").optional(),
});

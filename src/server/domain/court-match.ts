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

/** 환불 대기는 별도 상태가 아니라 이 조건의 조합이다(§4.2). */
export function isAwaitingRefund(application: { status: string; confirmedAt: Date | null; refundCompletedAt: Date | null }) {
  return application.status === "CANCELLED" && application.confirmedAt !== null && application.refundCompletedAt === null;
}

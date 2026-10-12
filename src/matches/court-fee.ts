/** 신청 시 고정한 할인 가격과, 현장 미지참 확인 후 추가 납부를 분리한다. */
export const ballDiscountKrw = 5_000;
export const ballHoldingStatuses = ["PENDING", "ACCEPTED", "CONFIRMED"] as const;
export const ballContributionLabel = "새 테니스공 1캔(최소 3구)을 가져와 함께 사용";
export type CourtFeeSnapshot = { courtFeeKrw?: number | null; bringsBalls?: boolean; ballsMissingAt?: Date | string | null };
export const courtFeeSelect = { courtFeeKrw: true, bringsBalls: true, ballsMissingAt: true } as const;
export function applicationCourtFee(a: CourtFeeSnapshot, legacyFee: number) {
  return a.courtFeeKrw ?? legacyFee;
}
export function payableCourtFee(a: CourtFeeSnapshot, legacyFee: number) {
  return applicationCourtFee(a, legacyFee) + (a.bringsBalls && a.ballsMissingAt ? ballDiscountKrw : 0);
}

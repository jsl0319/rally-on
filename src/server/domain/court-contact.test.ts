import { describe, expect, it } from "vitest";
import { courtContactInputSchema } from "@/matches/court-contact";
import { canReadCourtContact } from "./court-contact";

const endsAt = new Date("2030-01-01T10:00:00Z");
const cutoff = new Date("2030-01-02T10:00:00Z");
const application = { status: "PENDING", confirmedAt: null, receivedAmountKrw: null, refundAmountKrw: null, legacyRefundPaidKrw: 0, refundAttempts: [], depositClaimedAt: null, receiptRecords: [] };
const input = { application, fee: 12000, endsAt, matchStatus: "OPEN", operatorActive: true };

describe("코트 운영자 연락처 공개 경계", () => {
  it.each(["PENDING", "ACCEPTED", "CONFIRMED"])("%s 본인 신청은 입금 전부터 종료 24시간 직전까지만 공개한다", (status) => {
    const value = { ...input, application: { ...application, status } };
    expect(canReadCourtContact(value, new Date(cutoff.getTime() - 1))).toBe(true);
    expect(canReadCourtContact(value, cutoff)).toBe(false);
  });
  it.each(["WITHDRAWN", "REJECTED", "EXPIRED_UNPAID", "CANCELLED"])("%s 종료 신청에 남은 거래가 없으면 즉시 숨긴다", (status) => {
    expect(canReadCourtContact({ ...input, application: { ...application, status } }, endsAt)).toBe(false);
  });
  it("신청 전·운영자 비활성·전체 취소는 일반 공개를 허용하지 않는다", () => {
    expect(canReadCourtContact({ ...input, application: undefined }, endsAt)).toBe(false);
    expect(canReadCourtContact({ ...input, operatorActive: false }, endsAt)).toBe(false);
    expect(canReadCourtContact({ ...input, matchStatus: "CANCELLED" }, endsAt)).toBe(false);
  });
  it("취소 후 실제 반환 잔액은 종료 24시간 이후에도 해결까지 공개한다", () => {
    const pending = { ...application, status: "CANCELLED", receivedAmountKrw: 12000 };
    expect(canReadCourtContact({ ...input, application: pending }, cutoff)).toBe(true);
    expect(canReadCourtContact({ ...input, application: { ...pending, refundAttempts: [{ status: "PAID", amountKrw: 12000 }] } }, cutoff)).toBe(false);
    expect(canReadCourtContact({ ...input, operatorActive: false, application: pending }, cutoff)).toBe(false);
  });
  it("대조되지 않은 입금 알림을 유지하되 0원 대조나 참가 확정 후에는 무기한 공개하지 않는다", () => {
    const pending = { ...application, status: "CANCELLED", depositClaimedAt: new Date(endsAt.getTime() - 1000) };
    expect(canReadCourtContact({ ...input, application: pending }, cutoff)).toBe(true);
    expect(canReadCourtContact({ ...input, application: { ...pending, receivedAmountKrw: 0, receiptRecords: [{ createdAt: endsAt }] } }, cutoff)).toBe(false);
    expect(canReadCourtContact({ ...input, application: { ...pending, status: "CONFIRMED", confirmedAt: endsAt, receivedAmountKrw: 12000 } }, cutoff)).toBe(false);
    expect(canReadCourtContact({ ...input, application: { ...pending, receiptRecords: [{ createdAt: new Date(endsAt.getTime() - 2000) }] } }, cutoff)).toBe(true);
  });
  it("처리 중·검토 중 반환과 과송금 검토는 유지한다", () => {
    for (const status of ["PROCESSING", "REVIEW", "PAID"]) {
      expect(canReadCourtContact({ ...input, application: { ...application, status: "CANCELLED", receivedAmountKrw: 0, refundAttempts: [{ status, amountKrw: 1000 }] } }, cutoff)).toBe(true);
    }
  });
  it.each(["javascript:alert(1)", "tel:01012345678", "123", "+82-10-1234-5678", "000-0000-0000"])("잘못된 번호 %s를 저장하지 않는다", (phone) => {
    expect(courtContactInputSchema.safeParse({ phone, hours: "매일 9~18시", publicationAgreed: true, expectedVersion: 0 }).success).toBe(false);
  });
  it("국내 번호를 정규화하고 공개 동의·연락 시간을 필수로 받는다", () => {
    const value = { phone: "02-1234-5678", hours: " 매일 9~18시 ", publicationAgreed: true, expectedVersion: 0 };
    expect(courtContactInputSchema.parse(value)).toMatchObject({ phone: "0212345678", hours: "매일 9~18시" });
    for (const phone of ["010-1234-5678", "0507-1234-5678", "1588-1234"]) expect(courtContactInputSchema.safeParse({ ...value, phone }).success).toBe(true);
    expect(courtContactInputSchema.safeParse({ ...value, publicationAgreed: false }).success).toBe(false);
    expect(courtContactInputSchema.safeParse({ ...value, hours: " " }).success).toBe(false);
    expect(courtContactInputSchema.safeParse({ ...value, hours: "1".repeat(81) }).success).toBe(false);
  });
});

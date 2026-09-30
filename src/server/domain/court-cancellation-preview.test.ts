import { describe, expect, it } from "vitest";
import { buildCourtCancellationPreview, courtCancellationInputSchema } from "./court-cancellation-preview";

const match = { id: "match", startsAt: new Date("2030-09-20T10:00:00+09:00"), totalCourtFeeKrw: 12001 };
const application = { id: "application", status: "CONFIRMED", confirmedAt: new Date("2030-09-17T10:00:00+09:00"), depositClaimedAt: null, receivedAmountKrw: 15001, refundAmountKrw: null, legacyRefundPaidKrw: 1000, refundAttempts: [] };
const preview = (time: string, changes = {}) => buildCourtCancellationPreview({ ...application, ...changes }, match, new Date(time));

describe("취소 금액 확인값", () => {
  it.each([
    ["2030-09-18T23:59:59+09:00", 100, 14001, "2030-09-18T15:00:00.000Z"],
    ["2030-09-19T00:00:00+09:00", 50, 8000, "2030-09-19T15:00:00.000Z"],
    ["2030-09-20T00:00:00+09:00", 0, 2000, "2030-09-20T01:00:00.000Z"],
  ])("%s에 초과 입금·기지급액을 포함한 잔액을 안내한다", (time, percent, amount, validUntil) => {
    expect(preview(time)).toMatchObject({ refundPercent: percent, refundAmountKrw: amount, validUntil });
  });
  it("같은 조건은 발급 시각이 달라도 같고, 자정에 환불율이 바뀌면 달라진다", () => {
    expect(preview("2030-09-18T12:00:00+09:00").fingerprint).toBe(preview("2030-09-18T23:59:59+09:00").fingerprint);
    expect(preview("2030-09-18T23:59:59+09:00").fingerprint).not.toBe(preview("2030-09-19T00:00:00+09:00").fingerprint);
    expect(preview("2030-09-19T23:59:59+09:00").fingerprint).not.toBe(preview("2030-09-20T00:00:00+09:00").fingerprint);
  });
  it("미확정 철회는 당일에도 실제 수령액에서 기지급액만 제외한다", () => {
    expect(preview("2030-09-20T00:00:00+09:00", { status: "ACCEPTED", confirmedAt: null })).toMatchObject({ refundAmountKrw: 14001 });
  });
  it.each([
    { id: "other-application" }, { status: "ACCEPTED", confirmedAt: null },
    { receivedAmountKrw: 16001 }, { legacyRefundPaidKrw: 2000 },
    { refundAttempts: [{ status: "PROCESSING", amountKrw: 1000 }] },
  ])("신청·입금·지급·송금 처리 상태 변경을 감지한다: %j", (changes) => {
    const time = "2030-09-18T12:00:00+09:00";
    expect(preview(time, changes).fingerprint).not.toBe(preview(time).fingerprint);
  });
  it.each([undefined, {}, { cancellationFingerprint: "invalid" }, { cancellationFingerprint: 12000 }])("확인값이 없는 요청을 허용하지 않는다: %j", (input) => {
    expect(courtCancellationInputSchema.safeParse(input).success).toBe(false);
  });
});

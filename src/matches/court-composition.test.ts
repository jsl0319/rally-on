import { describe, expect, it } from "vitest";
import { checkCourtComposition, courtCompositionIssues } from "./court-composition";
import { courtSlotCreateInputSchema } from "@/server/domain/court-slot";

const base = { gameType: "MIXED_DOUBLES" as const, minParticipantCount: 4, maxParticipantCount: 6, maleCapacity: 4, femaleCapacity: 2 };
describe("코트 경기의 실제 최소 구성", () => {
  it("혼복 총원이 충분해도 여자 2명이 없으면 진행할 수 없다", () => {
    expect(checkCourtComposition("MIXED_DOUBLES", 4, { total: 4, male: 4, female: 0 })).toMatchObject({ ready: false, missing: { total: 0, female: 2 } });
    expect(checkCourtComposition("MIXED_DOUBLES", 4, { total: 4, male: 2, female: 2 }).ready).toBe(true);
  });
  it("운영자가 더 높은 최소 인원을 지정하면 성별 구성을 채워도 총원을 충족해야 한다", () => {
    expect(checkCourtComposition("MIXED_DOUBLES", 6, { total: 4, male: 2, female: 2 }).ready).toBe(false);
  });
  it.each(["MENS_DOUBLES", "WOMENS_DOUBLES"] as const)("%s는 해당 성별 최소 4명을 요구한다", (type) => {
    expect(checkCourtComposition(type, 4, { total: 4, male: 2, female: 2 }).ready).toBe(false);
    expect(checkCourtComposition(type, 4, { total: 4, male: type === "MENS_DOUBLES" ? 4 : 0, female: type === "WOMENS_DOUBLES" ? 4 : 0 }).ready).toBe(true);
  });
  it("새 혼복의 불가능한 정원과 최소 1명을 서버 입력 검증에서 거절한다", () => {
    const times = { courtUnitName: "1번", startsAt: "2030-01-02T10:00:00.000Z", endsAt: "2030-01-02T12:00:00.000Z", priceKrw: 12000, approvalMode: "AUTO" };
    expect(courtSlotCreateInputSchema.safeParse({ ...base, ...times }).success).toBe(true);
    expect(courtSlotCreateInputSchema.safeParse({ ...base, ...times, minParticipantCount: 1 }).success).toBe(false);
    expect(courtSlotCreateInputSchema.safeParse({ ...base, ...times, maleCapacity: 6, femaleCapacity: 0 }).success).toBe(false);
    expect(courtCompositionIssues({ ...base, maxParticipantCount: 3, maleCapacity: 2, femaleCapacity: 1 }).length).toBeGreaterThan(0);
  });
  it("기타는 성별 제한 없이 최소 2명이며 과거 유형을 새로 공개하지 않는다", () => {
    expect(courtCompositionIssues({ gameType: "OTHER", minParticipantCount: 2, maxParticipantCount: 2 })).toEqual([]);
    expect(checkCourtComposition("OTHER", 2, { total: 2, male: 0, female: 2 }).ready).toBe(true);
    expect(courtCompositionIssues({ gameType: "OTHER", minParticipantCount: 1, maxParticipantCount: 2 }).length).toBeGreaterThan(0);
    expect(courtCompositionIssues({ gameType: "RALLY", minParticipantCount: 2, maxParticipantCount: 2 })[0].path).toBe("gameType");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCourtApplicationNotice, readCourtApplicationNotice } from "./court-application-notice";
import { courtMatchApplicationInputSchema } from "./court-match";

const match = {
  id: "match", hostUserId: "operator", title: "코트 매칭",
  startsAt: new Date("2030-01-02T01:00:00Z"), endsAt: new Date("2030-01-02T03:00:00Z"),
  gameType: "MIXED_DOUBLES" as const, recruitCount: 6, totalCourtFeeKrw: 12000,
  maleRecruitCount: 3, femaleRecruitCount: 3, courtCompositionPolicyVersion: 1,
  courtSlot: { minParticipantCount: 4, approvalMode: "AUTO", usageNote: "실내화 지참",
    serviceScope: { balls: true, equipment: false, lesson: false, facilitator: true },
    courtUnit: { name: "2번 코트", court: { name: "준비된 테니스장", address: "서울 마포구" } } },
};

afterEach(() => vi.useRealTimers());
describe("코트 매칭 신청 전 안내", () => {
  it("오래 열어 둬도 시각·현재 자리 수 때문에 확인한 조건이 달라지지 않는다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    const before = buildCourtApplicationNotice({ ...match, ...{ applications: [], version: 1 } });
    vi.setSystemTime(new Date("2030-01-01T21:00:00Z"));
    const after = buildCourtApplicationNotice({ ...match, ...{ applications: [{ status: "ACCEPTED" }], version: 2 } });
    expect(after).toEqual(before);
  });

  it.each([
    ["참가비", { ...match, totalCourtFeeKrw: 15000 }],
    ["일시", { ...match, startsAt: new Date("2030-01-02T02:00:00Z") }],
    ["경기 유형", { ...match, gameType: "OTHER" as const }],
    ["최소 인원", { ...match, courtSlot: { ...match.courtSlot, minParticipantCount: 6 } }],
    ["정원", { ...match, recruitCount: 8, maleRecruitCount: 4, femaleRecruitCount: 4 }],
    ["승인 방식", { ...match, courtSlot: { ...match.courtSlot, approvalMode: "OPERATOR" } }],
    ["코트 안내", { ...match, courtSlot: { ...match.courtSlot, usageNote: "테니스화 필수" } }],
    ["포함 항목", { ...match, courtSlot: { ...match.courtSlot, serviceScope: { ...match.courtSlot.serviceScope, balls: false } } }],
  ])("%s 변경은 기존 확인으로 신청할 수 없게 식별한다", (_, changed) => {
    expect(buildCourtApplicationNotice(changed).fingerprint).not.toBe(buildCourtApplicationNotice(match).fingerprint);
  });

  it("과거 공개 경기의 최소 조건을 새 혼복 4명 기준으로 소급하지 않는다", () => {
    const legacy = buildCourtApplicationNotice({ ...match, courtCompositionPolicyVersion: 0, courtSlot: { ...match.courtSlot, minParticipantCount: 2 } });
    expect(legacy.terms.sections[0].body).toContain("최소 2명");
    expect(legacy.terms.sections[0].body).not.toContain("남 2명");
    expect(legacy.fingerprint).not.toBe(buildCourtApplicationNotice(match).fingerprint);
  });

  it("기존·불완전 기록에는 확인하지 않은 안내를 만들어 넣지 않는다", () => {
    expect(readCourtApplicationNotice(null)).toBeNull();
    expect(readCourtApplicationNotice({ version: "old" })).toBeNull();
    const snapshot = buildCourtApplicationNotice(match);
    expect(readCourtApplicationNotice(snapshot)).toEqual(snapshot);
  });

  it("원본 조회에 계좌나 프로필이 있어도 공개 안내에 복사하지 않는다", () => {
    const withPrivateData = { ...match, settlementAccountNumber: "secret-account", applications: [{ profileSnapshot: "private-profile" }] };
    const notice = JSON.stringify(buildCourtApplicationNotice(withPrivateData));
    expect(notice).not.toContain("secret-account");
    expect(notice).not.toContain("private-profile");
  });

  it("포함·미포함을 기록하고 과거 정보 미등록을 미포함으로 바꾸지 않는다", () => {
    const notice = buildCourtApplicationNotice(match);
    const section = notice.terms.sections.find((s) => s.title === "참가비 포함 항목");
    expect(section?.body).toBe("코트 이용·매칭 참가 · 테니스공 · 현장 경기 진행 포함. 장비 대여 · 레슨 미포함.");
    const unknown = buildCourtApplicationNotice({ ...match, courtSlot: { ...match.courtSlot, serviceScope: null } });
    expect(unknown.terms.serviceScope).toBeNull();
    expect(unknown.terms.sections.at(-1)?.body).toContain("등록되지 않았어요");
    const old = { ...notice, version: "court-application-2026-09-12-v1", terms: { ...notice.terms, sections: notice.terms.sections.filter((s) => s.title !== "참가비 포함 항목") } };
    delete old.terms.serviceScope;
    expect(readCourtApplicationNotice(old)).toEqual(old);
    expect(readCourtApplicationNotice(old)?.terms).not.toHaveProperty("serviceScope");
  });

  it("API 입력은 실제 확인과 올바른 서버 해시를 모두 요구한다", () => {
    const noticeFingerprint = buildCourtApplicationNotice(match).fingerprint;
    expect(courtMatchApplicationInputSchema.safeParse({}).success).toBe(false);
    expect(courtMatchApplicationInputSchema.safeParse({ noticeAccepted: false, noticeFingerprint }).success).toBe(false);
    expect(courtMatchApplicationInputSchema.safeParse({ noticeAccepted: true, noticeFingerprint: "fake" }).success).toBe(false);
    expect(courtMatchApplicationInputSchema.safeParse({ noticeAccepted: true, noticeFingerprint }).success).toBe(true);
  });
});

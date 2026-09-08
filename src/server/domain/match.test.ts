import { describe, expect, it } from "vitest";

import { getApplicationStatusLabel, getEstimatedFeePerPerson, getPendingCount, getRecommendation, isDiscoverableMatch, matchApplicationDecisionInputSchema, matchApplicationInputSchema, matchCancelInputSchema, matchCreateInputSchema, matchLifecycleInputSchema } from "./match";

const viewer = {
  rallyLevel: "SHORT_RALLY" as const,
  gameExperience: "NONE" as const,
  playPurposes: ["RALLY_PRACTICE"] as const,
};

describe("M3 match discovery rules", () => {
  it("scores same rally, purpose, and game experience without exposing the score", () => {
    const recommendation = getRecommendation(viewer, viewer, {
      partnerPreference: "COMPLETE_BEGINNER_WELCOME",
      playPurposes: ["RALLY_PRACTICE"],
    });
    expect(recommendation.score).toBe(80);
    expect(recommendation.reasons.map((reason) => reason.code)).toEqual([
      "SAME_RALLY_LEVEL", "SAME_PLAY_PURPOSE", "SIMILAR_GAME_EXPERIENCE", "BEGINNER_WELCOME",
    ]);
  });

  it("scores an adjacent rally level but not a two-step difference", () => {
    const adjacent = getRecommendation(viewer, { ...viewer, rallyLevel: "COMFORTABLE_RALLY" }, { partnerPreference: "SIMILAR_LEVEL", playPurposes: [] });
    const distant = getRecommendation(viewer, { ...viewer, rallyLevel: "STANDARD_RALLY" }, { partnerPreference: "SIMILAR_LEVEL", playPurposes: [] });
    expect(adjacent.score).toBe(35);
    expect(distant.score).toBe(10);
  });

  it("only exposes open, future matches with remaining spots", () => {
    const base = { status: "OPEN" as const, startsAt: new Date("2030-01-01T01:00:00.000Z"), recruitCount: 2, applications: [], now: new Date("2029-01-01T01:00:00.000Z") };
    expect(isDiscoverableMatch(base)).toBe(true);
    expect(isDiscoverableMatch({ ...base, applications: [{ status: "ACCEPTED" as const }, { status: "ACCEPTED" as const }] })).toBe(false);
    expect(isDiscoverableMatch({ ...base, status: "CLOSED" })).toBe(false);
    expect(isDiscoverableMatch({ ...base, startsAt: new Date("2028-01-01T01:00:00.000Z") })).toBe(false);
  });

  it("treats the stored amount as the fixed guest fee for both court sources", () => {
    expect(getEstimatedFeePerPerson(40_000)).toBe(40_000);
  });
});

describe("M4 match creation input", () => {
  const validInput = {
    clientRequestId: "e3e70682-c209-4cac-a29f-6fbed82c07cd", title: "천천히 랠리 연습해요",
    startsAt: "2030-01-02T01:00:00.000Z", endsAt: "2030-01-02T03:00:00.000Z",
    courtSource: "EXTERNAL_RESERVED", externalCourt: { name: "마포 테니스장", address: "서울 마포구" }, recruitCount: 2,
    playPurposes: ["RALLY_PRACTICE"], partnerPreference: "COMPLETE_BEGINNER_WELCOME", totalCourtFeeKrw: 40_000,
    introduction: "천천히 랠리하면서 즐겁게 연습해요.",
  } as const;

  it("accepts an external reserved court and a free court", () => {
    expect(matchCreateInputSchema.parse({ ...validInput, totalCourtFeeKrw: 0 }).courtSource).toBe("EXTERNAL_RESERVED");
  });

  it("rejects a court fee above 1,000,000 won", () => {
    expect(() => matchCreateInputSchema.parse({ ...validInput, totalCourtFeeKrw: 1_000_001 })).toThrow();
    expect(matchCreateInputSchema.parse({ ...validInput, totalCourtFeeKrw: 1_000_000 }).courtSource).toBe("EXTERNAL_RESERVED");
  });

  it("rejects a new court-undecided match without court details or a fee", () => {
    expect(() => matchCreateInputSchema.parse({
      ...validInput,
      courtSource: "COURT_TBD",
      externalCourt: null,
      totalCourtFeeKrw: null,
      additionalCostNote: null,
    })).toThrow();
  });

  it("accepts a partner court match only with the selected public slot", () => {
    const partner = matchCreateInputSchema.parse({
      clientRequestId: "e3e70682-c209-4cac-a29f-6fbed82c07cf",
      courtSource: "PARTNER_COURT",
      courtSlotId: "e3e70682-c209-4cac-a29f-6fbed82c07ce",
      title: "제휴 코트에서 랠리해요",
      recruitCount: 2,
      playPurposes: ["RALLY_PRACTICE"],
      partnerPreference: "SIMILAR_LEVEL",
    });

    expect(partner.courtSource).toBe("PARTNER_COURT");
    expect(() => matchCreateInputSchema.parse({ ...partner, startsAt: validInput.startsAt })).toThrow();
    expect(() => matchCreateInputSchema.parse({ ...partner, totalCourtFeeKrw: 40_000 })).toThrow();
  });

  it("requires an introduction for a directly reserved match, but not for a partner court session", () => {
    expect(() => matchCreateInputSchema.parse({ ...validInput, introduction: "" })).toThrow();
    expect(() => matchCreateInputSchema.parse({ ...validInput, introduction: undefined })).toThrow();

    const partnerWithoutIntroduction = matchCreateInputSchema.parse({
      clientRequestId: "e3e70682-c209-4cac-a29f-6fbed82c07d0",
      courtSource: "PARTNER_COURT",
      courtSlotId: "e3e70682-c209-4cac-a29f-6fbed82c07ce",
      title: "제휴 코트에서 랠리해요",
      recruitCount: 2,
      playPurposes: ["RALLY_PRACTICE"],
      partnerPreference: "SIMILAR_LEVEL",
    });
    expect(partnerWithoutIntroduction.introduction).toBeUndefined();
  });

  it("keeps the null fee calculation for historical court-undecided records", () => {
    expect(getEstimatedFeePerPerson(null)).toBeNull();
  });

  it("rejects an invalid court source or time range while keeping contact in the Match chat", () => {
    expect(() => matchCreateInputSchema.parse({ ...validInput, courtSource: "PARTNER_COURT" })).toThrow();
    expect(() => matchCreateInputSchema.parse({ ...validInput, endsAt: validInput.startsAt })).toThrow("종료 시간");
    expect(matchCreateInputSchema.parse(validInput).courtSource).toBe("EXTERNAL_RESERVED");
  });
});

describe("M5 match application input", () => {
  it("trims the optional message and rejects messages over 200 characters", () => {
    expect(matchApplicationInputSchema.parse({ message: "  천천히 랠리하고 싶어요.  " }).message).toBe("천천히 랠리하고 싶어요.");
    expect(() => matchApplicationInputSchema.parse({ message: "가".repeat(201) })).toThrow("200자");
  });
});

describe("M6 application decisions", () => {
  it("requires a positive, current match version for acceptance", () => {
    expect(matchApplicationDecisionInputSchema.parse({ expectedMatchVersion: 3 })).toEqual({ expectedMatchVersion: 3 });
    expect(() => matchApplicationDecisionInputSchema.parse({ expectedMatchVersion: 0 })).toThrow();
  });

  it("counts only pending applications for the host review badge", () => {
    expect(getPendingCount([{ status: "PENDING" as const }, { status: "ACCEPTED" as const }, { status: "PENDING" as const }])).toBe(2);
  });
});

describe("M7 lifecycle inputs and user-facing state", () => {
  it("requires a current version for lifecycle changes and limits an optional cancellation note", () => {
    expect(matchLifecycleInputSchema.parse({ expectedVersion: 4 })).toEqual({ expectedVersion: 4 });
    expect(matchCancelInputSchema.parse({ expectedVersion: 4, reason: null })).toEqual({ expectedVersion: 4, reason: null });
    expect(() => matchLifecycleInputSchema.parse({ expectedVersion: 0 })).toThrow();
    expect(() => matchCancelInputSchema.parse({ expectedVersion: 4, reason: "가".repeat(201) })).toThrow("200자");
  });

  it("distinguishes cancelled applications by their match outcome", () => {
    expect(getApplicationStatusLabel("CANCELLED", "CLOSED")).toBe("모집이 마감됐어요");
    expect(getApplicationStatusLabel("CANCELLED", "CANCELLED")).toBe("매칭이 취소됐어요");
    expect(getApplicationStatusLabel("CANCELLED", "EXPIRED")).toBe("성사 없이 종료됐어요");
    expect(getApplicationStatusLabel("ACCEPTED", "CLOSED")).toBe("같이 치게 됐어요");
  });
});


describe("match creation game and settlement validation", () => {
  const request = {
    introduction: "함께 편하게 연습해요.",
    clientRequestId: "e3e70682-c209-4cac-a29f-6fbed82c07cd",
    courtSource: "EXTERNAL_RESERVED", externalCourt: { name: "테니스장", address: "서울 마포구" },
    startsAt: "2099-01-02T10:00:00+09:00", endsAt: "2099-01-02T12:00:00+09:00",
    recruitCount: 2, playPurposes: ["RALLY_PRACTICE"], partnerPreference: "SIMILAR_LEVEL", totalCourtFeeKrw: 24000,
  };
  it("accepts a title-free request and an optional settlement account", () => {
    expect(matchCreateInputSchema.parse({ ...request, gameType: "OTHER" }).title).toBeUndefined();
    expect(matchCreateInputSchema.parse({ ...request, settlementAccount: null }).settlementAccount).toBeNull();
  });
  it.each([
    { bank: "은행", accountNumber: "12345" },
    { bank: "", accountNumber: "12345", accountHolder: "홍길동" },
    { bank: "은행", accountNumber: "abcde", accountHolder: "홍길동" },
    { bank: "은행", accountNumber: "-----", accountHolder: "홍길동" },
  ])("rejects partial or invalid accounts", (settlementAccount) => {
    expect(matchCreateInputSchema.safeParse({ ...request, settlementAccount }).success).toBe(false);
  });
  it.each(["UNKNOWN", "SINGLES", "RALLY"])("rejects unavailable game type %s", (gameType) => {
    expect(matchCreateInputSchema.safeParse({ ...request, gameType }).success).toBe(false);
  });
});

describe("gender quota and half-hour creation contract", () => {
  const request = {
    introduction: "함께 편하게 연습해요.",
    clientRequestId: "e3e70682-c209-4cac-a29f-6fbed82c07cd", courtSource: "EXTERNAL_RESERVED",
    externalCourt: { name: "테니스장", address: "서울 마포구" },
    startsAt: "2099-01-02T10:00:00+09:00", endsAt: "2099-01-02T12:30:00+09:00",
    recruitCount: 3, playPurposes: ["GAME"], partnerPreference: "SIMILAR_LEVEL", totalCourtFeeKrw: 24000,
    gameType: "MIXED_DOUBLES", maleRecruitCount: 1, femaleRecruitCount: 2,
  };
  it("accepts quota totals that exclude the host", () => {
    expect(matchCreateInputSchema.parse(request).recruitCount).toBe(3);
  });
  it.each([
    { maleRecruitCount: null }, { femaleRecruitCount: -1 }, { maleRecruitCount: 0.5 },
    { recruitCount: 4 }, { gameType: "MENS_DOUBLES" }, { gameType: "WOMENS_DOUBLES" },
    { startsAt: "2099-01-02T10:15:00+09:00" }, { endsAt: "2099-01-02T12:30:01+09:00" },
  ])("rejects invalid quotas or non-half-hour timing", (change) => {
    expect(matchCreateInputSchema.safeParse({ ...request, ...change }).success).toBe(false);
  });
});

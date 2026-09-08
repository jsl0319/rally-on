import { describe, expect, it } from "vitest";

import { nicknameSchema, profileInputSchema } from "./profile";

const validProfile = {
  gender: "MALE",
  experienceRange: "YEARS_1_TO_2",
  rallyLevel: "SHORT_RALLY",
  gameExperience: "NONE",
  playPurposes: ["CASUAL_HIT"],
  expectedVersion: null,
} as const;

describe("M2 profile input", () => {
  it("accepts the M2 experience contract", () => {
    expect(profileInputSchema.parse(validProfile)).toMatchObject(validProfile);
  });

  it("accepts the current profile version when editing an existing profile", () => {
    expect(profileInputSchema.parse({ ...validProfile, expectedVersion: 2 }).expectedVersion).toBe(2);
  });

  it("requires a gender", () => {
    const withoutGender = { ...validProfile, gender: undefined };
    expect(() => profileInputSchema.parse(withoutGender)).toThrow("성별을 선택해 주세요.");
  });

  it("rejects more than two play purposes", () => {
    expect(() => profileInputSchema.parse({
      ...validProfile,
      playPurposes: ["CASUAL_HIT", "RALLY_PRACTICE", "GAME"],
    })).toThrow("최대 2개");
  });

  it("accepts 2–12 Korean, English, or numeric nickname characters only", () => {
    expect(nicknameSchema.parse("랠리Mate12")).toBe("랠리Mate12");
    expect(() => nicknameSchema.parse("테니스 메이트")).toThrow("한글, 영문, 숫자");
    expect(() => nicknameSchema.parse("tennismate123")).toThrow("12자");
  });
});

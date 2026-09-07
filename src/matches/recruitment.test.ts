import { describe, expect, it } from "vitest";
import { genderApplicationBlock, remainingGenderSpots } from "./recruitment";

describe("gender recruitment", () => {
  const match = { maleRecruitCount: 1, femaleRecruitCount: 2 };
  const applications = [{ status: "ACCEPTED", applicantGender: "MALE" as const }, { status: "PENDING", applicantGender: "FEMALE" as const }];
  it("counts accepted snapshots separately and keeps pending seats available", () => {
    expect(remainingGenderSpots(match, applications, "MALE")).toBe(0);
    expect(remainingGenderSpots(match, applications, "FEMALE")).toBe(2);
    expect(genderApplicationBlock(match, applications, "MALE")).toBe("GENDER_QUOTA_FULL");
    expect(genderApplicationBlock(match, applications, "FEMALE")).toBeNull();
  });
  it("requires gender only for matches with explicit quotas", () => {
    expect(genderApplicationBlock(match, [], null)).toBe("PROFILE_GENDER_REQUIRED");
    expect(genderApplicationBlock({}, [], null)).toBeNull();
  });
});

import type { GameType } from "./game-type";

export type Gender = "MALE" | "FEMALE";
export type Recruitment = { maleRecruitCount?: number | null; femaleRecruitCount?: number | null };
export type AcceptedApplicant = { status: string; applicantGender?: Gender | null };
export const genderLabels: Record<Gender, string> = { MALE: "남자", FEMALE: "여자" };
export function needsGenderQuota(gameType: GameType | "" | null | undefined) {
  return gameType === "MIXED_DOUBLES" || gameType === "MENS_DOUBLES" || gameType === "WOMENS_DOUBLES";
}
export function hasGenderQuota(match: Recruitment) {
  return match.maleRecruitCount != null && match.femaleRecruitCount != null;
}
export function remainingGenderSpots(match: Recruitment, applications: AcceptedApplicant[], gender: Gender) {
  const count = gender === "MALE" ? match.maleRecruitCount : match.femaleRecruitCount;
  return Math.max(0, (count ?? 0) - applications.filter((item) => item.status === "ACCEPTED" && item.applicantGender === gender).length);
}
export function genderApplicationBlock(match: Recruitment, applications: AcceptedApplicant[], gender: Gender | null | undefined) {
  if (!hasGenderQuota(match)) return null;
  if (!gender) return "PROFILE_GENDER_REQUIRED";
  return remainingGenderSpots(match, applications, gender) === 0 ? "GENDER_QUOTA_FULL" : null;
}

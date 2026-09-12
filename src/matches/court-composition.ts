import { activeGameTypes, type GameType } from "./game-type";

export const courtCompositionPolicyVersion = 1;
export type CompositionCounts = { total: number; male: number; female: number };
export type CourtCompositionConfig = {
  gameType: GameType | null;
  minParticipantCount: number;
  maxParticipantCount: number;
  maleCapacity?: number | null;
  femaleCapacity?: number | null;
};

export function minimumForCourtGame(gameType: string | null) {
  return ["MIXED_DOUBLES", "MENS_DOUBLES", "WOMENS_DOUBLES"].includes(gameType ?? "") ? 4 : 2;
}

/** Shared by draft validation, first publication and the client form. */
export function courtCompositionIssues(input: CourtCompositionConfig) {
  const issues: Array<{ path: keyof CourtCompositionConfig; message: string }> = [];
  if (!activeGameTypes.some((type) => type === input.gameType)) issues.push({ path: "gameType", message: "현재 제공하는 경기 유형을 선택해 주세요." });
  const minimum = minimumForCourtGame(input.gameType);
  if (input.minParticipantCount < minimum) issues.push({ path: "minParticipantCount", message: `이 경기 유형의 최소 인원은 ${minimum}명 이상이어야 해요.` });
  if (input.maxParticipantCount < Math.max(minimum, input.minParticipantCount)) issues.push({ path: "maxParticipantCount", message: "모집 정원은 최소 진행 인원 이상이어야 해요." });
  const { maleCapacity: male, femaleCapacity: female } = input;
  if (minimum === 4 || male != null || female != null) {
    if (male == null || female == null || male < 0 || female < 0 || male + female !== input.maxParticipantCount) issues.push({ path: "maxParticipantCount", message: "남자·여자 정원의 합계가 모집 정원과 같아야 해요." });
    if (input.gameType === "MIXED_DOUBLES" && ((male ?? 0) < 2 || (female ?? 0) < 2)) issues.push({ path: "maleCapacity", message: "혼복은 남자·여자 정원이 각각 2명 이상이어야 해요." });
    if (input.gameType === "MENS_DOUBLES" && female !== 0) issues.push({ path: "femaleCapacity", message: "남복은 남자 자리만 모집할 수 있어요." });
    if (input.gameType === "WOMENS_DOUBLES" && male !== 0) issues.push({ path: "maleCapacity", message: "여복은 여자 자리만 모집할 수 있어요." });
  }
  return issues;
}

export function courtCompositionRequirement(gameType: GameType | null, minimum: number) {
  const total = Math.max(minimum, minimumForCourtGame(gameType));
  return { total, male: gameType === "MIXED_DOUBLES" ? 2 : gameType === "MENS_DOUBLES" ? total : 0, female: gameType === "MIXED_DOUBLES" ? 2 : gameType === "WOMENS_DOUBLES" ? total : 0 };
}

export function checkCourtComposition(gameType: GameType | null, minimum: number, counts: CompositionCounts) {
  const required = courtCompositionRequirement(gameType, minimum);
  const missing = { total: Math.max(0, required.total - counts.total), male: Math.max(0, required.male - counts.male), female: Math.max(0, required.female - counts.female) };
  const requirementLabel = gameType === "MIXED_DOUBLES" ? `최소 ${required.total}명 · 남 2명·여 2명 이상` : gameType === "MENS_DOUBLES" ? `남자 최소 ${required.total}명` : gameType === "WOMENS_DOUBLES" ? `여자 최소 ${required.total}명` : `최소 ${required.total}명`;
  const missingLabel = [missing.total ? `총 ${missing.total}명` : "", missing.male ? `남자 ${missing.male}명` : "", missing.female ? `여자 ${missing.female}명` : ""].filter(Boolean).join(" · ");
  return { required, counts, missing, requirementLabel, missingLabel, ready: missing.total === 0 && missing.male === 0 && missing.female === 0 };
}

export function countCourtComposition(applications: ReadonlyArray<{ applicantGender: string | null }>): CompositionCounts {
  return { total: applications.length, male: applications.filter((a) => a.applicantGender === "MALE").length, female: applications.filter((a) => a.applicantGender === "FEMALE").length };
}

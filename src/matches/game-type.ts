export const gameTypes = ["MIXED_DOUBLES", "MENS_DOUBLES", "WOMENS_DOUBLES", "SINGLES", "RALLY", "OTHER"] as const;
export const activeGameTypes = ["MIXED_DOUBLES", "MENS_DOUBLES", "WOMENS_DOUBLES", "OTHER"] as const;
export type ActiveGameType = (typeof activeGameTypes)[number];
export type GameType = (typeof gameTypes)[number];
export const gameTypeLabels: Record<GameType, string> = {
  MIXED_DOUBLES: "혼복",
  MENS_DOUBLES: "남복",
  WOMENS_DOUBLES: "여복",
  SINGLES: "단식",
  RALLY: "랠리",
  OTHER: "기타",
};

import type { ActiveGameType } from "./game-type";
export type CourtDiscoveryFilters = { date: string | null; gameType: ActiveGameType | null; sort: "soonest" | "priceLow" };
export const defaultCourtFilters: CourtDiscoveryFilters = { date: null, gameType: null, sort: "soonest" };
export const courtSortOptions: { value: CourtDiscoveryFilters["sort"]; label: string; description: string }[] = [
  { value: "soonest", label: "시간 빠른순", description: "시작 시간이 가까운 경기부터" },
  { value: "priceLow", label: "낮은 가격순", description: "할인 전 1인 참가비가 낮은 경기부터" },
];

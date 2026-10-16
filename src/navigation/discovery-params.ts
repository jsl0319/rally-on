import { activeGameTypes, type ActiveGameType } from "@/matches/game-type";

export type DiscoveryState<S extends string> = { date: string | null; gameType: ActiveGameType | null; sort: S; availableOnly: boolean };
export function readDiscoveryParams<S extends string>(params: URLSearchParams, sorts: readonly S[], defaultSort: S): DiscoveryState<S> {
  const date = params.get("date");
  const validDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  const gameType = params.get("gameType");
  const sort = params.get("sort");
  return {
    date: validDate ? date : null,
    gameType: activeGameTypes.find(type => type === gameType) ?? null,
    sort: sorts.find(value => value === sort) ?? defaultSort,
    availableOnly: params.get("availableOnly") === "true",
  };
}

export function writeDiscoveryParams(params: URLSearchParams, state: DiscoveryState<string>, defaultSort: string) {
  const next = new URLSearchParams(params);
  for (const key of ["date", "gameType", "sort", "availableOnly"]) next.delete(key);
  if (state.date) next.set("date", state.date);
  if (state.gameType) next.set("gameType", state.gameType);
  if (state.sort !== defaultSort) next.set("sort", state.sort);
  if (state.availableOnly) next.set("availableOnly", "true");
  return next;
}

import { z } from "zod";

export const courtServiceScopeFields = [
  { key: "balls", label: "테니스공" },
  { key: "equipment", label: "장비 대여" },
  { key: "lesson", label: "레슨" },
  { key: "facilitator", label: "현장 경기 진행" },
] as const;

const inclusion = z.boolean({ error: "각 항목의 참가비 포함 여부를 선택해 주세요." });
export const courtServiceScopeSchema = z.object({
  balls: inclusion,
  equipment: inclusion,
  lesson: inclusion,
  facilitator: inclusion,
}).strict();

export type CourtServiceScope = z.infer<typeof courtServiceScopeSchema>;
export const courtServiceScopeBasicLabel = "코트 이용·매칭 참가";
export const courtServiceScopeUnknownLabel = "공·장비·레슨·현장 진행의 제공 여부가 등록되지 않았어요.";

/** Missing historical data is unknown, never a promise or an exclusion. */
export function readCourtServiceScope(value: unknown): CourtServiceScope | null {
  const result = courtServiceScopeSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function describeCourtServiceScope(scope: CourtServiceScope | null): string {
  if (!scope) return courtServiceScopeUnknownLabel;
  const included = courtServiceScopeFields.filter(({ key }) => scope[key]).map(({ label }) => label);
  const excluded = courtServiceScopeFields.filter(({ key }) => !scope[key]).map(({ label }) => label);
  return `${[courtServiceScopeBasicLabel, ...included].join(" · ")} 포함.${excluded.length ? ` ${excluded.join(" · ")} 미포함.` : ""}`;
}

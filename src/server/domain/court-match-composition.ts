import { z } from "zod";
import { checkCourtComposition, countCourtComposition, courtCompositionPolicyVersion } from "@/matches/court-composition";
import type { GameType } from "@/matches/game-type";

export const compositionCancellationInputSchema = z.object({
  expectedVersion: z.number().int().positive(),
  clientRequestId: z.uuid(),
  note: z.string().trim().min(10, "제공 불가 확인 근거를 10자 이상 남겨 주세요.").max(450),
});

export function describeCourtComposition(match: {
  courtCompositionPolicyVersion: number;
  courtCompositionPassedAt: Date | null;
  gameType: GameType | null;
  startsAt: Date;
  status: string;
  courtSlot: { minParticipantCount: number } | null;
  applications: ReadonlyArray<{ status: string; applicantGender: string | null }>;
}, now: Date) {
  const enabled = match.courtCompositionPolicyVersion === courtCompositionPolicyVersion;
  const checked = checkCourtComposition(match.gameType, match.courtSlot?.minParticipantCount ?? 0, countCourtComposition(match.applications.filter((a) => a.status === "CONFIRMED")));
  const reviewRequired = ["OPEN", "CLOSED"].includes(match.status) && now >= match.startsAt && !match.courtCompositionPassedAt;
  const phase = reviewRequired ? "REVIEW_REQUIRED" : !enabled ? "LEGACY" : match.status === "CANCELLED" ? "CANCELLED" : now >= match.startsAt ? "STARTED" : match.courtCompositionPassedAt ? checked.ready ? "PASSED" : "ACTION_REQUIRED" : "BEFORE_JUDGEMENT";
  return { ...checked, enabled, phase, passedAt: match.courtCompositionPassedAt?.toISOString() ?? null };
}

export const courtLateReviewInputSchema = z.object({
  expectedVersion: z.number().int().positive(), clientRequestId: z.uuid(),
  outcome: z.enum(["PROVIDED", "NOT_PROVIDED"]),
  note: z.string().trim().min(10, "실제 제공 여부를 확인한 근거를 10자 이상 남겨 주세요.").max(450),
}).strict();

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
  const phase = !enabled ? "LEGACY" : match.status === "CANCELLED" ? "CANCELLED" : now >= match.startsAt ? "STARTED" : match.courtCompositionPassedAt ? checked.ready ? "PASSED" : "ACTION_REQUIRED" : "BEFORE_JUDGEMENT";
  return { ...checked, enabled, phase, passedAt: match.courtCompositionPassedAt?.toISOString() ?? null };
}

import { ballDiscountKrw, ballContributionLabel, ballMinimumCount } from "@/matches/court-fee";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { GameType } from "@/matches/game-type";
import { gameTypeLabels } from "@/matches/game-type";
import { checkCourtComposition, courtCompositionPolicyVersion } from "@/matches/court-composition";
import { courtServiceScopeSchema, readCourtServiceScope } from "@/matches/court-service-scope";
import { confirmationWindowMinutes, depositWindowMinutes, getApplicationDeadline, getJudgementAt, getPaymentDueAt, getLateConfirmationDeadline } from "./court-match";

export const courtApplicationNoticeVersion = "court-application-2026-10-17-v6";
export const courtApplicationNoticeSchema = z.object({
  version: z.string(), fingerprint: z.string(),
  terms: z.object({
    matchId: z.string(), operatorUserId: z.string(),
    courtName: z.string(), address: z.string(), courtNumber: z.string(),
    bringsBalls: z.boolean().optional(), ballMinimumCount: z.number().int().positive().optional(),
    startsAt: z.string(), endsAt: z.string(), feeKrw: z.number(),
    gameType: z.string(), minimum: z.number(), maximum: z.number(),
    maleCapacity: z.number().nullable(), femaleCapacity: z.number().nullable(),
    compositionPolicyVersion: z.number(), approvalMode: z.string(),
    usageNote: z.string().nullable(),
    serviceScope: courtServiceScopeSchema.nullable().optional(),
    sections: z.array(z.object({ title: z.string(), summary: z.string().optional(), body: z.string(),
      refundRates: z.array(z.object({ label: z.string(), percent: z.number().int().min(0).max(100) })).optional(),
    })),
  }),
});
export type CourtApplicationNotice = z.infer<typeof courtApplicationNoticeSchema>;

type NoticeMatch = {
  id: string; hostUserId: string; title: string; startsAt: Date; endsAt: Date;
  gameType: GameType | null; recruitCount: number; totalCourtFeeKrw: number | null;
  maleRecruitCount: number | null; femaleRecruitCount: number | null;
  courtCompositionPolicyVersion: number;
  courtSlot: { minParticipantCount: number; approvalMode: string; usageNote: string | null; serviceScope?: unknown; ballDiscountEnabled?: boolean;
    courtUnit: { name: string; court: { name: string; address: string } } } | null;
};

/** The fingerprint covers stable rules, never the current clock or a changing seat count. */
export function buildCourtApplicationNotice(match: NoticeMatch, bringBalls = false): CourtApplicationNotice {
  const slot = match.courtSlot;
  const minimum = slot?.minParticipantCount ?? 0;
  const serviceScope = readCourtServiceScope(slot?.serviceScope);
  const currentPolicy = match.courtCompositionPolicyVersion === courtCompositionPolicyVersion;
  const requirement = currentPolicy
    ? checkCourtComposition(match.gameType, minimum, { total: 0, male: 0, female: 0 }).requirementLabel
    : `최소 ${minimum}명`;
  const time = (at: Date) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
  const judgement = getJudgementAt(match.startsAt);
  const prePaymentCutoff = getPaymentDueAt(new Date(judgement.getTime() - 1), match.startsAt);
  const terms = {
    matchId: match.id, operatorUserId: match.hostUserId,
    courtName: slot?.courtUnit.court.name ?? match.title,
    address: slot?.courtUnit.court.address ?? "", courtNumber: slot?.courtUnit.name ?? "",
    startsAt: match.startsAt.toISOString(), endsAt: match.endsAt.toISOString(), feeKrw: (match.totalCourtFeeKrw ?? 0) - (bringBalls && slot?.ballDiscountEnabled ? ballDiscountKrw : 0),
    bringsBalls: bringBalls && Boolean(slot?.ballDiscountEnabled),
    ...(slot?.ballDiscountEnabled ? { ballMinimumCount } : {}),
    gameType: match.gameType ? gameTypeLabels[match.gameType] : "기타",
    minimum, maximum: match.recruitCount, maleCapacity: match.maleRecruitCount, femaleCapacity: match.femaleRecruitCount,
    compositionPolicyVersion: match.courtCompositionPolicyVersion, approvalMode: slot?.approvalMode ?? "OPERATOR",
    usageNote: slot?.usageNote ?? null,
    serviceScope,
    sections: [
      { title: "진행 조건", summary: `${requirement} · ${time(judgement)} 입금 확인 기준`, body: `필요 인원: ${requirement}\n${time(judgement)}까지 입금 확인이 완료된 참가자로 판정합니다.\n운영자는 참가 인원에 포함되지 않습니다.` },
      { title: "입금과 확정", summary: "운영자가 입금을 확인하면 참가가 확정됩니다.", body: `${slot?.approvalMode === "AUTO" ? "조건과 잔여 인원이 맞으면 신청 즉시 입금 안내를 제공합니다." : "운영자가 신청을 승인하면 입금 안내를 제공합니다."}\n승인 후 기본 ${depositWindowMinutes / 60}시간 이내, 진행 판정 전에는 늦어도 ${time(prePaymentCutoff)}까지 입금해야 합니다.\n운영자 확인 기한은 입금 기한의 ${confirmationWindowMinutes}분 뒤입니다. 개인별 정확한 기한은 승인 후 표시됩니다.\n입금 알림만으로는 참가가 확정되지 않습니다. 운영자의 입금 확인이 필요합니다.` },
      { title: "본인 사유의 취소", summary: "확정 전 전액 반환 · 확정 후 취소일별 환불", body: "확정 전 철회·거절·만료된 신청은 실제 입금액을 전액 반환합니다.\n취소는 경기 시작 전까지 가능하며, 초과 입금액은 별도로 반환합니다.", refundRates: [
        { label: "이틀 전까지", percent: 100 }, { label: "하루 전", percent: 50 }, { label: "당일", percent: 0 },
      ] },
      { title: "경기 취소와 반환", summary: "인원 미달·제공 불가로 전체 취소 시 전액 반환", body: `진행 조건 미달 또는 운영자의 제공 불가로 경기 전체가 취소되면, 남은 참가자의 실제 입금액을 전액 반환합니다.\n먼저 본인 사유로 취소한 신청에는 당시 환불 기준을 적용합니다.${currentPolicy ? "\n진행 판정 후 인원이 부족해지면 운영자가 보충 여부를 확인합니다. 제공이 불가능하면 경기를 취소합니다." : ""}\n입금 대조와 환불 송금은 운영자가 직접 처리합니다. 앱에서 자동 송금하지 않습니다.` },
      { title: "우천·시설 문제로 일부 중단", summary: "당시 확정 참가자와 운영자가 반환액을 협의합니다.", body: "일부 시간을 이용하지 못한 경우, 문제 발생 당시 확정 참가자와 운영자가 반환 금액을 직접 협의합니다.\n운영자가 합의 금액·사유를 기록하고 직접 반환합니다. 시간에 비례한 자동 계산은 하지 않습니다.\n기존 전액 반환 조건과 이전 본인 사유 취소의 환불 기준은 유지됩니다." },
      ...(slot?.ballDiscountEnabled ? [{ title: "테니스공 준비", summary: bringBalls ? "공 미지참 시 5,000원을 추가 입금합니다." : "공 준비 참가자 1명이 새 공을 가져옵니다.", body: bringBalls
        ? `${ballContributionLabel}해야 합니다.\n경기당 1명에게 신청 접수 순으로 5,000원 할인을 적용합니다.\n공을 가져오지 않으면 운영자 확인 후 5,000원을 추가 입금해야 합니다.`
        : `공 준비 참가자 1명이 새 테니스공 1캔(최소 ${ballMinimumCount}구)을 가져와 함께 사용합니다.\n5,000원 할인은 공 준비로 신청한 1명에게만 적용됩니다.\n준비자가 없거나 취소하면 운영자가 참가자와 준비 방법을 협의합니다.` }] : []),
      { title: "추가 모집 기한", summary: `${time(getApplicationDeadline(match.startsAt))}까지 신청·승인`, body: `진행 판정을 통과한 경기만 추가 모집합니다.\n신청·승인: ${time(getApplicationDeadline(match.startsAt))}까지\n입금: ${time(getPaymentDueAt(judgement, match.startsAt))}까지\n운영자 입금 확인: ${time(getLateConfirmationDeadline(match.startsAt))}까지` },
    ],
  };
  const fingerprint = createHash("sha256").update(JSON.stringify({ version: courtApplicationNoticeVersion, terms })).digest("hex");
  return { version: courtApplicationNoticeVersion, fingerprint, terms };
}

export function readCourtApplicationNotice(snapshot: unknown) {
  const parsed = courtApplicationNoticeSchema.safeParse(snapshot);
  return parsed.success ? parsed.data : null;
}

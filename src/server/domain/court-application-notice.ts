import { ballDiscountKrw, ballContributionLabel, ballMinimumCount } from "@/matches/court-fee";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { GameType } from "@/matches/game-type";
import { gameTypeLabels } from "@/matches/game-type";
import { checkCourtComposition, courtCompositionPolicyVersion } from "@/matches/court-composition";
import { courtServiceScopeSchema, describeCourtServiceScope, readCourtServiceScope } from "@/matches/court-service-scope";
import { confirmationWindowMinutes, depositWindowMinutes, getApplicationDeadline, getJudgementAt, getPaymentDueAt, getLateConfirmationDeadline } from "./court-match";

export const courtApplicationNoticeVersion = "court-application-2026-10-12-v5";
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
    sections: z.array(z.object({ title: z.string(), summary: z.string().optional(), body: z.string() })),
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
      ...(slot?.ballDiscountEnabled ? [{ title: "테니스공 준비", body: bringBalls
        ? `${ballContributionLabel}해 주세요. 참가비 5,000원을 할인받으며 공 미지참 시 운영자 확인 후 5,000원을 추가 입금해요. 신청 접수 순으로 경기당 1명만 확보해요.`
        : "공 준비 참가자 1명이 새 테니스공 1캔(최소 2구)을 가져와 함께 사용해요. 공 준비 할인은 별도 선택한 한 명에게만 적용해요. 준비자가 정해지지 않거나 취소하면 운영자가 참가자와 준비 방법을 조율해요." }] : []),
      { title: "진행 조건", summary: `${requirement} · ${time(judgement)} 입금 확인 기준`, body: `${requirement}. ${time(judgement)}까지 입금 확인이 끝난 참가자로 판정해요. 운영자는 참가 인원에 포함하지 않아요.` },
      { title: "입금과 확정", summary: `${slot?.approvalMode === "AUTO" ? "신청 후 바로 입금 안내를 받아요." : "운영자가 신청을 수락하면 입금 안내를 받아요."} 기한 내 이체하고 운영자가 확인하면 참가 확정돼요.`, body: `${slot?.approvalMode === "AUTO" ? "조건과 자리가 맞으면 자동 승인해요." : "운영자 승인 후 입금 기한을 안내해요."} 승인 후 기본 ${depositWindowMinutes / 60}시간, 판정 전에는 늦어도 ${time(prePaymentCutoff)}까지 이체해 주세요. 운영자 확인 기한은 이체 기한에서 ${confirmationWindowMinutes}분 뒤예요. 정확한 기한은 승인 후 다시 안내해요. 입금 알림만으로 참가가 확정되지는 않아요.` },
      { title: "추가 모집 기한", body: `진행 판정을 통과한 경기만 ${time(getApplicationDeadline(match.startsAt))}까지 추가 신청·승인을 받아요. 추가 모집의 이체 기한은 ${time(getPaymentDueAt(judgement, match.startsAt))}, 운영자 확인은 ${time(getLateConfirmationDeadline(match.startsAt))}까지예요.` },
      { title: "본인 사유의 취소", summary: "확정 전 전액 반환. 확정 후 이틀 전까지 100%, 하루 전 50%, 당일 0% (한국 날짜 기준).", body: "확정 전 철회·거절·만료 건의 실제 입금액은 전액 반환해요. 확정 후 본인 사유로 취소하면 한국 날짜 기준 이틀 전까지 참가비 전액, 하루 전 50%, 당일 0%예요. 취소는 시작 전까지 가능하며 초과 입금은 별도로 반환해요." },
      { title: "경기 취소와 반환", summary: "진행 조건 미달·제공 불가 취소 시 남은 참가자 전액 반환. 이전 본인 사유 취소는 당시 기준을 유지해요.", body: `진행 조건 미달이나 운영자의 제공 불가로 경기 전체가 취소되면 남은 참가자의 실제 입금액은 전액 반환 대상이에요.${currentPolicy ? " 판정 후 구성 부족은 운영자가 보충 여부를 확인하고 제공 불가하면 취소해요." : ""} 먼저 본인 사유로 취소한 신청은 당시 기준을 유지해요. 입금·환불은 운영자가 통장에서 대조하고 직접 이체해요. 앱은 자동 송금하지 않아요.` },
      { title: "이용 중 일부 제공 불가", body: "우천·시설 문제로 일부 이용하지 못한 경우, 문제 발생 당시 확정 참가자는 운영자와 반환 금액을 직접 협의해 주세요. 운영자가 합의 금액·사유를 기록하고 직접 반환해요. 앱은 시간 비례 금액을 자동 계산하지 않으며, 기존 전액 반환 조건과 이전 본인 사유 취소 기준은 유지해요." },
      { title: "이용 안내", body: describeCourtServiceScope(slot?.ballDiscountEnabled && serviceScope ? { ...serviceScope, balls: false } : serviceScope) },
    ],
  };
  const fingerprint = createHash("sha256").update(JSON.stringify({ version: courtApplicationNoticeVersion, terms })).digest("hex");
  return { version: courtApplicationNoticeVersion, fingerprint, terms };
}

export function readCourtApplicationNotice(snapshot: unknown) {
  const parsed = courtApplicationNoticeSchema.safeParse(snapshot);
  return parsed.success ? parsed.data : null;
}

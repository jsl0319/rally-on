import type { CourtMatchParticipation } from "@/server/domain/court-match-view";
import { formatStatusChangedAt } from "./partner-session";

export function CourtCompositionNotice({ match, operator = false }: { match: Pick<CourtMatchParticipation, "composition" | "judgementAt" | "applicationDeadline" | "lateConfirmationDeadline">; operator?: boolean }) {
  const c = match.composition;
  if (!c.enabled || c.phase === "CANCELLED") return null;
  const needsAction = c.phase === "ACTION_REQUIRED";
  return <div className={`mt-4 rounded-2xl p-4 text-sm leading-6 ${needsAction ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-600"}`} role={needsAction ? "status" : undefined}>
    <p className="font-bold">{needsAction ? "운영자 조치 필요" : c.phase === "PASSED" ? "진행 판정 통과" : "진행 조건"}</p>
    <p className="mt-1">{c.requirementLabel}</p>
    <p className="mt-1 tabular-nums">현재 확정 {c.counts.total}명 · 남 {c.counts.male}명 · 여 {c.counts.female}명</p>
    {c.phase === "BEFORE_JUDGEMENT" ? <p className="mt-2 text-xs">{formatStatusChangedAt(match.judgementAt)}까지 구성을 채우지 못하면 취소돼요. 입금 확인이 끝난 참가자만 포함해요.</p> : null}
    {needsAction ? <><p className="mt-2">{operator ? "참가 취소로 경기 구성이 부족해요. 보충 가능 여부를 확인해 주세요." : "운영자가 경기 구성을 다시 확인하고 있어요. 제공 불가로 취소하면 남은 참가자의 실제 입금액을 전액 반환해요."}</p><p className="mt-2 text-xs">새 신청 {formatStatusChangedAt(match.applicationDeadline)}까지 · 기존 승인자의 입금 확인 {formatStatusChangedAt(match.lateConfirmationDeadline)}까지</p></> : null}
    {c.phase === "PASSED" ? <p className="mt-2 text-xs">현재 진행 조건을 충족했어요. 신청 마감까지 빈 자리를 모집할 수 있어요.</p> : null}
    {c.phase === "STARTED" ? <p className="mt-2 text-xs">시작 시각이 지났어요. 현장 제공 문제가 있으면 운영 문의로 확인해 주세요.</p> : null}
  </div>;
}

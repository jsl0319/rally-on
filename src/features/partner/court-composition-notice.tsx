import type { CourtMatchParticipation } from "@/server/domain/court-match-view";
import { formatStatusChangedAt } from "./partner-session";

export function CourtCompositionNotice({ match, operator = false }: { match: Pick<CourtMatchParticipation, "composition" | "judgementAt" | "applicationDeadline" | "lateConfirmationDeadline">; operator?: boolean }) {
  const c = match.composition;
  if (c.phase === "REVIEW_REQUIRED") return <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900" role="status"><p className="font-bold">실제 진행 여부 확인 필요</p><p className="mt-2">시작 전 진행 판정이 완료되지 않았습니다.<br />자동 취소하거나 진행 확정으로 표시하지 않습니다.</p><p className="mt-2">{operator ? "참가자와 실제 제공 여부를 확인하고 아래에 결과를 기록해 주세요." : "이 화면만으로 이동·참가 여부를 판단하지 말고 운영자에게 확인하시기 바랍니다."}</p></div>;
  if (!c.enabled || c.phase === "CANCELLED") return null;
  const needsAction = c.phase === "ACTION_REQUIRED";
  if (!operator) {
    if (c.phase === "ACTION_REQUIRED") return <div role="status" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900"><p className="font-semibold">경기 진행 여부를 확인 중입니다</p><p className="mt-1">참가 취소로 인원이 부족해졌습니다.<br />진행 불가로 취소되면 남은 참가자의 입금액을 전액 반환합니다.</p></div>;
    if (c.phase === "BEFORE_JUDGEMENT") return <div className="mb-1 rounded-xl bg-[var(--tm-bg-page)] p-4 text-[13px] leading-[22px]"><p className="font-semibold text-[var(--tm-text-primary)]">경기 진행 기준</p><p className="mt-1 font-medium text-[var(--tm-action-primary)]">{formatStatusChangedAt(match.judgementAt)}까지 {c.requirementLabel}</p><p className="mt-2 text-[var(--tm-text-secondary)]">운영자를 제외한 입금 확인 인원 기준입니다.<br />기준에 미달하면 경기가 취소됩니다.</p></div>;
    return <p className="mb-4 text-sm font-semibold text-[var(--tm-action-primary)]">{c.phase === "PASSED" ? "진행 인원이 충족되었습니다" : "경기가 시작되었습니다"}</p>;
  }

  return <div className={`mt-4 rounded-2xl p-4 text-sm leading-6 ${needsAction ? "bg-amber-50 text-amber-900" : "bg-[var(--tm-bg-subtle-muted)] text-[var(--tm-text-muted)]"}`} role={needsAction ? "status" : undefined}>
    <p className="font-bold">{needsAction ? "운영자 조치 필요" : c.phase === "PASSED" ? "진행 판정 통과" : "진행 조건"}</p>
    <p className="mt-1">{c.requirementLabel}</p>
    <p className="mt-1 tabular-nums">현재 확정 {c.counts.total}명 · 남 {c.counts.male}명 · 여 {c.counts.female}명</p>
    {c.phase === "BEFORE_JUDGEMENT" ? <p className="mt-2 text-xs">{formatStatusChangedAt(match.judgementAt)}까지 구성을 채우지 못하면 취소돼요. 입금 확인이 끝난 참가자만 포함해요.</p> : null}
    {needsAction ? <><p className="mt-2">{operator ? "참가 취소로 경기 구성이 부족해요. 보충 가능 여부를 확인해 주세요." : "운영자가 경기 구성을 다시 확인하고 있어요. 제공 불가로 취소하면 남은 참가자의 실제 입금액을 전액 반환해요."}</p><p className="mt-2 text-xs">새 신청 {formatStatusChangedAt(match.applicationDeadline)}까지 · 기존 승인자의 입금 확인 {formatStatusChangedAt(match.lateConfirmationDeadline)}까지</p></> : null}
    {c.phase === "PASSED" ? <p className="mt-2 text-xs">현재 진행 조건을 충족했어요. 신청 마감까지 빈 자리를 모집할 수 있어요.</p> : null}
    {c.phase === "STARTED" ? <p className="mt-2 text-xs">시작 시각이 지났어요. 현장 제공 문제가 있으면 운영 문의로 확인해 주세요.</p> : null}
  </div>;
}

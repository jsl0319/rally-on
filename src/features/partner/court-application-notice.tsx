import type { CourtApplicationNotice } from "@/server/domain/court-application-notice";
import { matchSchedule } from "@/features/matches/match-presentation";
import { formatStatusChangedAt } from "./partner-session";
import { CaretDown } from "@phosphor-icons/react/dist/ssr";

export function CourtApplicationNoticeContent({ notice, compact = false, hideProgress = false, hideUsageNote = false }: { notice: CourtApplicationNotice; compact?: boolean; hideProgress?: boolean; hideUsageNote?: boolean }) {
  const { terms } = notice;
  const sections = terms.sections.filter((section) => !(hideProgress && section.title === "진행 조건"));
  return <div className="text-[13px] leading-[22px] text-[var(--tm-text-secondary)]">
    {!compact ? <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-2xl bg-[var(--tm-bg-subtle-muted)] p-4">
      <dt>게임 유형</dt><dd className="text-right font-semibold text-[var(--tm-text-primary)]">{terms.gameType}</dd>
      <dt>모집 정원</dt><dd className="text-right font-semibold text-[var(--tm-text-primary)]">최대 {terms.maximum}명{terms.maleCapacity !== null && terms.femaleCapacity !== null ? <span className="block text-xs font-normal text-[var(--tm-text-secondary)]">남 {terms.maleCapacity}명 · 여 {terms.femaleCapacity}명</span> : null}</dd>
      <dt>참가비</dt><dd className="text-right font-semibold text-[var(--tm-text-primary)]">1인 {terms.feeKrw.toLocaleString("ko-KR")}원</dd>
    </dl> : null}
    <div className="divide-y divide-[var(--tm-border-subtle)]">
      {sections.map((section) => <details key={section.title} open={compact && section.title === "본인 사유의 취소" ? true : undefined} className="group rally-disclosure">
        <summary className="flex min-h-14 cursor-pointer list-none items-start justify-between gap-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tm-action-primary)]">
          <span className="min-w-0"><span className="block text-sm font-semibold text-[var(--tm-text-primary)]">{section.title}</span>
            {section.summary ? <span className="mt-1 block break-words group-open:hidden">{section.summary}</span> : null}
          </span>
          <CaretDown aria-hidden size={16} className="rally-disclosure-chevron mt-1 shrink-0 transition-transform motion-reduce:transition-none" />
        </summary>
        <div className="space-y-2.5 pb-4">
          {section.body.split("\n").filter(Boolean).map((paragraph, index) => <p className="break-words" key={index}>{paragraph}</p>)}
          {section.refundRates ? <div className="pt-1">
            <p className="mb-2 text-xs font-medium text-[var(--tm-text-primary)]">참가 확정 후 · 경기일 기준 환불률</p>
            <dl className="grid grid-cols-3 divide-x divide-[var(--tm-border-default)] rounded-xl bg-[var(--tm-bg-page)] py-3 text-center">
              {section.refundRates.map(rate => <div key={rate.label} className="px-1"><dt className="text-xs">{rate.label}</dt><dd className="mt-1 text-lg font-bold tabular-nums text-[var(--tm-text-primary)]">{rate.percent}<span className="text-sm">%</span></dd></div>)}
            </dl>
          </div> : null}
        </div>
      </details>)}
    </div>
    {terms.usageNote && !hideUsageNote ? <div className="mt-4"><p className="font-semibold text-[var(--tm-text-primary)]">코트 이용 안내</p><p className="mt-1 whitespace-pre-wrap break-words">{terms.usageNote}</p></div> : null}
  </div>;
}

export function CourtApplicationNoticeRecord({ notice, acceptedAt }: { notice: CourtApplicationNotice | null; acceptedAt: string | null }) {
  if (!notice || !acceptedAt) return null;
  const schedule = matchSchedule(notice.terms.startsAt, notice.terms.endsAt);
  return <details className="mt-4 rounded-2xl border border-[var(--tm-border-default)] p-4 text-sm">
    <summary className="min-h-11 cursor-pointer py-2.5 font-semibold">신청 당시 확인한 안내</summary>
    <p className="mt-2 text-xs text-[var(--tm-text-secondary)]">확인 시각 · {formatStatusChangedAt(acceptedAt)}</p>
    <p className="mt-4 font-semibold">{notice.terms.courtName} · {notice.terms.courtNumber}</p>
    <p className="my-2 text-[var(--tm-text-secondary)]">{schedule.day} {schedule.time}<br />{notice.terms.address}</p>
    <CourtApplicationNoticeContent notice={notice} />
  </details>;
}

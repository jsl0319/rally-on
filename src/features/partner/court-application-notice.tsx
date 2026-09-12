import type { CourtApplicationNotice } from "@/server/domain/court-application-notice";
import { matchSchedule } from "@/features/matches/match-presentation";
import { formatStatusChangedAt } from "./partner-session";

export function CourtApplicationNoticeContent({ notice }: { notice: CourtApplicationNotice }) {
  const { terms } = notice;
  return <div className="space-y-4 text-sm leading-6 text-slate-600">
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-2xl bg-slate-50 p-4">
      <dt>게임 유형</dt><dd className="text-right font-semibold text-slate-900">{terms.gameType}</dd>
      <dt>모집 정원</dt><dd className="text-right font-semibold text-slate-900">최대 {terms.maximum}명{terms.maleCapacity !== null && terms.femaleCapacity !== null ? <span className="block text-xs font-normal text-slate-500">남 {terms.maleCapacity}명 · 여 {terms.femaleCapacity}명</span> : null}</dd>
      <dt>참가비</dt><dd className="text-right font-semibold text-slate-900">1인 {terms.feeKrw.toLocaleString("ko-KR")}원</dd>
    </dl>
    {terms.sections.filter((s) => s.summary).map((s) => <div key={s.title}><p className="font-semibold text-slate-900">{s.title}</p><p className="mt-1 break-words">{s.summary}</p></div>)}
    <details className="rounded-xl border border-slate-200 px-3">
      <summary className="min-h-11 cursor-pointer py-2.5 font-semibold text-slate-900">전체 신청·입금·환불 안내</summary>
      {terms.sections.map((s) => <div className="mb-3" key={s.title}><p className="font-semibold">{s.title}</p><p className="mt-1 break-words">{s.body}</p></div>)}
    </details>
    {terms.usageNote ? <div><p className="font-semibold text-slate-900">코트 이용 안내</p><p className="mt-1 whitespace-pre-wrap break-words">{terms.usageNote}</p></div> : null}
  </div>;
}

export function CourtApplicationNoticeRecord({ notice, acceptedAt }: { notice: CourtApplicationNotice | null; acceptedAt: string | null }) {
  if (!notice || !acceptedAt) return null;
  const schedule = matchSchedule(notice.terms.startsAt, notice.terms.endsAt);
  return <details className="mt-4 rounded-2xl border border-slate-200 p-4 text-sm">
    <summary className="min-h-11 cursor-pointer py-2.5 font-semibold">신청 당시 확인한 안내</summary>
    <p className="mt-2 text-xs text-slate-500">확인 시각 · {formatStatusChangedAt(acceptedAt)}</p>
    <p className="mt-4 font-semibold">{notice.terms.courtName} · {notice.terms.courtNumber}</p>
    <p className="my-2 text-slate-500">{schedule.day} {schedule.time}<br />{notice.terms.address}</p>
    <CourtApplicationNoticeContent notice={notice} />
  </details>;
}

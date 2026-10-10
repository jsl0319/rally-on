import { formatStatusChangedAt } from "./partner-session";

type Record = { id: string; amountKrw: number; previousAmountKrw: number; incidentAt: string; note: string; createdAt: string };

export function CourtRefundAgreementHistory({ records }: { records: Record[] }) {
  if (!records.length) return null;
  return <details className="mt-4 rounded-xl border border-[var(--tm-border-default)] p-3" open>
    <summary className="min-h-11 cursor-pointer py-2 font-semibold">합의 반환 기록</summary>
    <p className="text-xs leading-5 text-[var(--tm-text-secondary)]">운영자가 기록한 참가비 반환 총액이에요. 초과 입금 반환은 별도이며, 실제 송금 결과는 아래에서 확인해 주세요.</p>
    {records.map((r) => <div key={r.id} className="mt-3 border-t border-[var(--tm-border-subtle)] pt-3">
      <p className="font-semibold tabular-nums">{r.amountKrw.toLocaleString("ko-KR")}원 <span className="text-xs font-normal text-[var(--tm-text-secondary)]">(이전 {r.previousAmountKrw.toLocaleString("ko-KR")}원)</span></p>
      <p className="mt-1 text-xs text-[var(--tm-text-secondary)]">발생 · {formatStatusChangedAt(r.incidentAt)}</p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{r.note}</p>
      <p className="mt-1 text-xs text-[var(--tm-text-secondary)]">기록 · {formatStatusChangedAt(r.createdAt)}</p>
    </div>)}
  </details>;
}

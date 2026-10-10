import { formatStatusChangedAt } from "./partner-session";

export function CourtFreshness({ checkedAt, error, reload }: { checkedAt: string | null; error: string; reload: () => void }) {
  return <div className="px-5 pb-4 text-xs leading-5 text-[var(--tm-text-secondary)]">
    {error ? <p className="rounded-xl bg-amber-50 p-3 text-amber-900" role="alert">최신 상태를 확인하지 못했어요. 아래는 이전 정보이므로 진행·취소 여부를 다시 확인해 주세요. {error}</p> : checkedAt ? <p>마지막 확인 · {formatStatusChangedAt(checkedAt)}</p> : null}
    <button type="button" className="min-h-11 font-semibold text-[var(--tm-action-primary)]" onClick={reload}>최신 상태 확인</button>
  </div>;
}

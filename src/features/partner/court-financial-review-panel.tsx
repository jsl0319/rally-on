"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CourtFinancialReviewView } from "@/server/domain/court-financial-review-service";
import { financialDataScopes } from "./financial-review-labels";
import { apiMessage, formatStatusChangedAt } from "./partner-session";

type Scope = keyof typeof financialDataScopes;
const field = "mt-1 w-full rounded-xl border border-[var(--tm-border-default)] bg-white p-3 text-base";
const actions = { RECONCILE: "은행 대조 완료", HOLD: "보존 사유 등록", RELEASE_HOLD: "보존 사유 해제" };

export function CourtFinancialReviewPanel({ applicationId, endpoint }: { applicationId: string; endpoint: string }) {
  const [open, setOpen] = useState(false);
  return <details className="mt-3 border-t border-[var(--tm-border-subtle)]" onToggle={(e) => setOpen(e.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer py-3 font-semibold text-[var(--tm-action-primary)]">최종 대조·보존 기록</summary>
    {open ? <ReviewForm url={`${endpoint}/${applicationId}/financial-review`} /> : null}
  </details>;
}

function ReviewForm({ url }: { url: string }) {
  const [data, setData] = useState<CourtFinancialReviewView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checked, setChecked] = useState(false);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [dueAt, setDueAt] = useState("");
  const pending = useRef(false);
  const requests = useRef(new Map<string, string>());
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(url, { cache: "no-store", signal });
    const result = await response.json();
    if (!response.ok) throw new Error(apiMessage(result, "기록을 불러오지 못했어요."));
    return result as CourtFinancialReviewView;
  }, [url]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).then((result) => { if (!controller.signal.aborted) setData(result); }).catch((e: unknown) => {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "연결을 확인해 주세요.");
    });
    return () => controller.abort();
  }, [load]);
  async function reload() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { setData(await load()); setChecked(false); } catch (e) { setError(e instanceof Error ? e.message : "연결을 확인해 주세요."); }
    finally { pending.current = false; setBusy(false); }
  }
  async function save(body: Record<string, unknown>) {
    if (!data || pending.current) return;
    const payload = { ...body, expectedFingerprint: data.expectedFingerprint };
    const key = JSON.stringify(payload);
    const clientRequestId = requests.current.get(key) ?? crypto.randomUUID();
    requests.current.set(key, clientRequestId);
    pending.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, clientRequestId }) });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(result, "저장하지 못했어요."));
      setData(await load()); setChecked(false); requests.current.delete(key); setNotice("기록을 저장했어요.");
    } catch (e) { setError(e instanceof Error ? e.message : "연결을 확인해 주세요. 다시 조회해 처리 상태를 확인할 수 있어요."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="space-y-3 pb-3">
    <p className="text-xs leading-5 text-[var(--tm-text-secondary)]">은행 대조와 보존 사유를 기록해요. 이 화면에서는 개인정보를 삭제하지 않아요.</p>
    {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
    {notice ? <p role="status" className="text-sm text-[var(--tm-action-primary)]">{notice}</p> : null}
    <Button size="medium" variant="secondary" disabled={busy} onClick={() => void reload()}>최신 기록 조회</Button>
    {!data && !error ? <p role="status">기록을 불러오고 있어요.</p> : null}
    {data ? <>
      <div className="rounded-xl bg-[var(--tm-bg-subtle-muted)] p-3">
        <p className="font-semibold">{data.reconciliation ? data.reconciliation.current ? "은행 대조 완료" : "재대조 필요" : "은행 대조 미완료"}</p>
        {data.reconciliation ? <p className="mt-1 text-xs text-[var(--tm-text-secondary)]">최근 대조 · {formatStatusChangedAt(data.reconciliation.createdAt)}</p> : null}
        {data.blockers.length ? <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-[var(--tm-text-muted)]">{data.blockers.map((item) => <li key={item}>{item}</li>)}</ul> : null}
        <label className="my-3 flex min-h-11 items-start gap-2 text-sm"><input className="mt-1" type="checkbox" disabled={busy || !data.canReconcile || Boolean(data.reconciliation?.current)} checked={checked} onChange={(e) => setChecked(e.target.checked)} />누적 입금·반환 내역을 은행 기록과 최종 대조했어요.</label>
        <Button size="medium" fullWidth disabled={busy || !checked || !data.canReconcile || Boolean(data.reconciliation?.current)} onClick={() => void save({ action: "RECONCILE", bankChecked: true })}>대조 완료 기록</Button>
      </div>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">보존 사유 추가</summary>
        <form onSubmit={(e) => { e.preventDefault(); void save({ action: "HOLD", scopes, reason, caseReference: reference, reviewDueAt: new Date(`${dueAt}+09:00`).toISOString() }); }}>
          <fieldset disabled={busy} className="space-y-3">
            <legend className="mb-2 font-semibold">보존할 정보</legend>
            {(Object.keys(financialDataScopes) as Scope[]).map((scope) => <label key={scope} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={scopes.includes(scope)} onChange={(e) => setScopes((previous) => e.target.checked ? [...previous, scope] : previous.filter((s) => s !== scope))} />{financialDataScopes[scope]}</label>)}
            <p className="text-xs leading-5 text-[var(--tm-text-secondary)]">사유에는 계좌번호·이름을 적지 말고 필요한 업무 근거만 남겨 주세요.</p>
            <label className="block">보존 사유<textarea className={`rally-input ${field}`} required minLength={10} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
            <label className="block">문의 번호·업무 참조<input className={`rally-input ${field}`} required minLength={2} maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} /></label>
            <label className="block">재검토일 (한국 시간)<input className={`rally-input ${field}`} type="datetime-local" required value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></label>
            <p className="text-xs text-[var(--tm-text-secondary)]">재검토일이 지나도 보존은 자동 해제되지 않아요.</p>
            <Button size="medium" fullWidth type="submit" disabled={!scopes.length}>보존 사유 저장</Button>
          </fieldset>
        </form>
      </details>
      {data.holds.length ? data.holds.map((hold) => <HoldRecord key={hold.id} hold={hold} busy={busy} save={save} />) : <p className="text-xs text-[var(--tm-text-secondary)]">등록된 보존 사유가 없어요. 파기 가능 여부는 별도로 검토해야 해요.</p>}
      {data.history.length ? <details><summary className="min-h-11 cursor-pointer py-3">처리 이력 {data.history.length}건</summary><ul className="space-y-2 text-xs text-[var(--tm-text-secondary)]">{data.history.map((r) => <li className="break-words" key={r.id}>{actions[r.action]} · {formatStatusChangedAt(r.createdAt)}{r.reason ? <p className="whitespace-pre-wrap">{r.reason}</p> : null}</li>)}</ul></details> : null}
    </> : null}
  </div>;
}

function HoldRecord({ hold, busy, save }: { hold: CourtFinancialReviewView["holds"][number]; busy: boolean; save: (body: Record<string, unknown>) => Promise<void> }) {
  const [reason, setReason] = useState("");
  return <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
    <p className="font-semibold">{hold.overdue ? "재검토 기한 경과 · 보존 중" : "보존 중"}</p>
    <p>{hold.scopes.map((scope) => financialDataScopes[scope]).join(" · ")}</p>
    <p className="whitespace-pre-wrap break-words">{hold.reason}</p>
    <p className="break-words text-xs">업무 참조 · {hold.caseReference}</p>
    <p className="text-xs">재검토 · {formatStatusChangedAt(hold.reviewDueAt)}</p>
    <details><summary className="min-h-11 cursor-pointer py-3">보존 사유 해제</summary><form onSubmit={(e) => { e.preventDefault(); void save({ action: "RELEASE_HOLD", holdId: hold.id, reason }); }}><fieldset disabled={busy} className="space-y-3">
      <label className="block">해제 근거<textarea className={`rally-input ${field}`} required minLength={10} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      <Button type="submit" variant="secondary" size="medium" fullWidth>보존 사유 해제 기록</Button>
    </fieldset></form></details>
  </div>;
}

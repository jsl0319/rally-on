"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { OperatorCourtMatch } from "@/server/domain/court-match-view";
import { apiMessage, formatStatusChangedAt } from "./partner-session";

type Application = OperatorCourtMatch["applications"][number];
const field = "mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-base";
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const localInput = (value: string) => new Date(new Date(value).getTime() + 9 * 60 * 60_000).toISOString().slice(0, 19);
const statusLabels = { PROCESSING: "송금 처리 중", PAID: "송금 완료 기록", FAILED: "미송금 확인", REVIEW: "송금 여부 확인 필요" };

export function OperatorMoneyPanel({ application: a, refresh }: { application: Application; refresh: () => Promise<void> }) {
  const [amount, setAmount] = useState(String(a.money.receivedKrw));
  const [receivedAt, setReceivedAt] = useState(a.lastReceivedAt ? localInput(a.lastReceivedAt) : "");
  const [feeAt, setFeeAt] = useState(a.feeReceivedAt ? localInput(a.feeReceivedAt) : "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requests = useRef(new Map<string, string>());
  const mutate = async (action: string, body: Record<string, unknown>) => {
    if (busy) return false;
    const key = JSON.stringify({ action, body });
    const clientRequestId = requests.current.get(key) ?? crypto.randomUUID();
    requests.current.set(key, clientRequestId);
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/v1/court-match-applications/${a.id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, clientRequestId }) });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(data, "처리하지 못했어요."));
      await refresh(); requests.current.delete(key); return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "통신 오류가 발생했어요. 새로고침으로 처리 상태를 확인해 주세요."); return false; }
    finally { setBusy(false); }
  };
  return <div className="mt-4 border-t border-slate-100 pt-4 text-sm">
    <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 tabular-nums">
      <p>실제 수령 <strong className="block mt-1">{won(a.money.receivedKrw)}</strong></p>
      <p>남은 반환 <strong className="block mt-1 text-blue-700">{won(a.money.outstandingKrw)}</strong></p>
      {a.money.paidKrw > 0 ? <p className="col-span-2 text-xs text-slate-500">반환 완료 기록 {won(a.money.paidKrw)}</p> : null}
    </div>
    {a.money.needsReview ? <p className="mt-2 text-rose-700">반환 의무와 송금 기록을 다시 대조해 주세요.</p> : null}
    <details className="mt-3">
      <summary className="min-h-11 cursor-pointer py-3 font-semibold text-blue-700">입금 대조·정정</summary>
      <form onSubmit={(e) => { e.preventDefault(); void mutate("receipt", { amountKrw: Number(amount), receivedAt: receivedAt ? new Date(`${receivedAt}+09:00`).toISOString() : null, feeReceivedAt: feeAt ? new Date(`${feeAt}+09:00`).toISOString() : null, note, expectedVersion: a.receiptVersion }); }}>
        <fieldset className="space-y-3" disabled={busy || a.refundLocked}>
          <p className="text-xs leading-5 text-slate-500">이 신청에서 받은 누적 금액을 기록해 주세요. 정정 이력은 남고, 종료된 자리는 복구되지 않아요.</p>
          <label className="block">누적 수령 금액<input className={field} type="number" min={0} max={100000000} required value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label className="block">은행 수령 시각 (한국 시간)<input className={field} type="datetime-local" step="1" required={Number(amount) > 0} value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} /></label>
          <label className="block">참가비를 모두 받은 시각 (선택)<input className={field} type="datetime-local" step="1" value={feeAt} onChange={(e) => setFeeAt(e.target.value)} /><span className="mt-1 block text-xs text-slate-500">여러 번 받았다면 참가비가 충족된 시각을 적어 주세요. 비우면 위 수령 시각을 사용해요.</span></label>
          <label className="block">대조·정정 사유<textarea className={field} required minLength={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 통장 내역 대조, 중복 입금 확인" /></label>
          <Button type="submit" fullWidth size="medium">수령 기록 저장</Button>
        </fieldset>
      </form>
      {a.receiptRecords.map((r) => <p className="mt-3 break-words text-xs leading-5 text-slate-500" key={r.id}>{formatStatusChangedAt(r.createdAt)} · {won(r.previousAmountKrw)} → {won(r.amountKrw)}<br />{r.note}</p>)}
    </details>
    {a.awaitingRefund && !a.refundLocked ? <div className="mt-3 rounded-xl bg-amber-50 p-3">
      {a.refundAccount ? <><p>{a.refundAccount.bank} · {a.refundAccount.accountHolder}</p><p className="my-2 break-all font-semibold">{a.refundAccount.accountNumber}</p><Button fullWidth size="medium" disabled={busy || a.money.needsReview} onClick={() => void mutate("refund/start", { amountKrw: a.money.availableKrw, accountVersion: a.refundAccountVersion })}>환불 처리 시작 · {won(a.money.availableKrw)}</Button><p className="mt-2 text-xs leading-5">시작 후 표시되는 고정 계좌로 송금해 주세요. 시작 버튼은 돈을 보내지 않아요.</p></> : <p>참가자의 환불 계좌 입력을 기다리고 있어요.</p>}
    </div> : null}
    {a.refundAttempts.map((r) => <RefundResult key={r.id} attempt={r} busy={busy} mutate={mutate} />)}
    {error ? <p className="mt-3 text-rose-700" role="alert">{error}</p> : null}
  </div>;
}

function RefundResult({ attempt: r, busy, mutate }: { attempt: Application["refundAttempts"][number]; busy: boolean; mutate: (action: string, body: Record<string, unknown>) => Promise<boolean> }) {
  const [note, setNote] = useState("");
  const [at, setAt] = useState("");
  const [outcome, setOutcome] = useState("PAID");
  const active = r.status === "PROCESSING" || r.status === "REVIEW";
  return <details className="mt-3 rounded-xl border border-slate-200 p-3" open={active || undefined}>
    <summary className="min-h-11 cursor-pointer py-2 font-semibold">{statusLabels[r.status]} · {won(r.amountKrw)}</summary>
    <p className="mt-2 break-all">고정 계좌 · {r.bank} {r.accountNumber} ({r.accountHolder})</p>
    <p className="mt-1 text-xs text-slate-500">처리 시작 · {formatStatusChangedAt(r.createdAt)}</p>
    {(active || r.status === "PAID") ? <form className="mt-3" onSubmit={(e) => { e.preventDefault(); void mutate("refund", { attemptId: r.id, expectedVersion: r.version, status: r.status === "PAID" ? "REVIEW" : outcome, transferredAt: active && outcome === "PAID" && at ? new Date(`${at}+09:00`).toISOString() : null, note }); }}><fieldset className="space-y-3" disabled={busy}>
      {active ? <><label className="block">은행 대조 결과<select className={field} value={outcome} onChange={(e) => setOutcome(e.target.value)}><option value="PAID">송금 완료 확인</option><option value="FAILED">송금되지 않음 확인</option></select></label>{outcome === "PAID" ? <label className="block">실제 송금 시각 (한국 시간)<input className={field} type="datetime-local" step="1" required value={at} onChange={(e) => setAt(e.target.value)} /></label> : <p className="text-xs text-rose-700">은행에서 송금되지 않은 것을 확인한 경우에만 선택해 주세요. 결과를 모르면 처리 중으로 유지해 주세요.</p>}</> : <p className="text-xs text-slate-500">잘못된 완료 표시는 확인 필요로 변경할 수 있어요. 은행 대조가 끝날 때까지 추가 송금이 차단돼요.</p>}
      <label className="block">처리 근거·메모<textarea className={field} required minLength={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <Button type="submit" size="medium" fullWidth variant="secondary">{active ? "송금 결과 저장" : "완료 기록 확인 요청"}</Button>
    </fieldset></form> : null}
    {r.events.map((e) => <p key={e.id} className="mt-3 whitespace-pre-wrap break-words text-xs text-slate-500">{formatStatusChangedAt(e.createdAt)} · {statusLabels[e.status]}<br />{e.note}</p>)}
  </details>;
}

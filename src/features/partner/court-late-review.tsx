"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { OperatorCourtMatch } from "@/server/domain/court-match-view";
import { apiMessage } from "./partner-session";

export function CourtLateReview({ match, refresh }: { match: OperatorCourtMatch; refresh: () => Promise<void> }) {
  const [outcome, setOutcome] = useState("PROVIDED");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef({ key: "", id: "" });
  if (!match.canResolveLateReview) return null;
  const submit = async () => {
    if (busy) return;
    const body = { outcome, note: note.trim(), expectedVersion: match.version };
    const key = JSON.stringify(body);
    if (request.current.key !== key) request.current = { key, id: crypto.randomUUID() };
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/v1/operator/court-matches/${match.id}/late-review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, clientRequestId: request.current.id }),
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(result, "결과를 기록하지 못했어요."));
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "결과를 기록하지 못했어요."); }
    finally { setBusy(false); }
  };
  return <form className="mt-4 rounded-2xl border border-amber-200 p-4 text-sm" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
    <fieldset disabled={busy} className="space-y-3">
      <legend className="font-bold">실제 제공 결과 기록</legend>
      <label className="block" htmlFor="late-review-outcome">확인 결과</label><select id="late-review-outcome" className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 p-3" value={outcome} onChange={(e) => setOutcome(e.target.value)}><option value="PROVIDED">제공 완료 (일정 종료 후)</option><option value="NOT_PROVIDED">전혀 제공하지 못함 · 취소 및 전액 반환</option></select>
      <p className="leading-6 text-slate-600">참가자와 실제 이용 여부를 확인해 주세요. 일부만 제공했다면 제공 완료 후 합의 반환 금액을 별도로 기록해 주세요. 이전 개인 취소의 환불 기준은 유지돼요.</p>
      <label className="block">확인 근거<textarea className="mt-2 min-h-28 w-full rounded-xl border border-slate-200 p-3" required minLength={10} maxLength={450} autoComplete="off" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <Button type="submit" fullWidth disabled={busy || note.trim().length < 10}>확인 결과 저장</Button>
      {error ? <p role="alert" className="text-rose-700">{error}</p> : null}
    </fieldset>
  </form>;
}

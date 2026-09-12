"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { OperatorCourtMatch } from "@/server/domain/court-match-view";
import { apiMessage } from "./partner-session";

export function CourtCompositionCancel({ match, refresh }: { match: OperatorCourtMatch; refresh: () => Promise<void> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef<{ note: string; expectedVersion: number; clientRequestId: string } | null>(null);
  if (!match.canCancelForComposition) return null;
  const submit = async () => {
    if (busy) return;
    setBusy(true); setError("");
    const trimmed = note.trim();
    if (!attempt.current || attempt.current.note !== trimmed || attempt.current.expectedVersion !== match.version) attempt.current = { note: trimmed, expectedVersion: match.version, clientRequestId: crypto.randomUUID() };
    try {
      const response = await fetch(`/api/v1/operator/court-matches/${match.id}/composition-cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(attempt.current) });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409) await refresh();
        throw new Error(apiMessage(body, "취소하지 못했어요. 상태를 다시 확인해 주세요."));
      }
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "취소하지 못했어요."); } finally { setBusy(false); }
  };
  return <details className="mt-4 rounded-2xl border border-amber-200 p-4 text-sm">
    <summary className="cursor-pointer font-semibold">경기 제공 불가 취소</summary>
    <p className="mt-3 leading-6 text-slate-600">보충할 수 없는지 확인한 뒤 취소해 주세요. 남아 있는 신청은 취소되고 실제 입금액 전액이 반환 대상이 돼요. 이전 자발적 취소는 기존 기준을 유지해요.</p>
    <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label className="mt-4 block font-semibold" htmlFor="composition-cancel-note">제공 불가 확인 근거</label>
      <textarea id="composition-cancel-note" className="mt-2 min-h-28 w-full rounded-xl border border-slate-200 p-3 leading-6" value={note} onChange={(e) => setNote(e.target.value)} minLength={10} maxLength={450} required disabled={busy} autoComplete="off" placeholder="예: 추가 참가자에게 확인했으나 보충 인원을 확보하지 못했어요." />
      {error ? <p className="mt-2 text-rose-700" role="alert">{error}</p> : null}
      <Button className="mt-3" fullWidth type="submit" disabled={busy || note.trim().length < 10}>{busy ? "처리 중…" : "제공 불가로 취소 · 전액 반환"}</Button>
    </form>
  </details>;
}

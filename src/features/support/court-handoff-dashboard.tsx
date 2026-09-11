"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { CourtHandoffQueue } from "@/server/domain/court-transaction-handoff";
import type { OperatorCourtMatch } from "@/server/domain/court-match-view";
import { OperatorMoneyPanel } from "@/features/partner/operator-money-panel";
import { apiMessage, formatStatusChangedAt } from "@/features/partner/partner-session";
const endpoint = "/api/internal/court-handoffs";
export function CourtHandoffDashboard() {
  const [data, setData] = useState<CourtHandoffQueue>({ items: [], nextCursor: null });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const load = useCallback(async (cursor?: string) => {
    setBusy(true); setError("");
    try { const response = await fetch(`${endpoint}${cursor ? `?cursor=${cursor}` : ""}`, { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(apiMessage(body, "인계 목록을 불러오지 못했어요.")); setData((old) => ({ ...body, items: cursor ? [...old.items, ...body.items] : body.items })); }
    catch (e) { setError(e instanceof Error ? e.message : "목록 확인에 실패했어요."); } finally { setBusy(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  return <main className="min-h-svh bg-slate-50 px-5 py-8 text-slate-800"><div className="mx-auto max-w-[640px]"><Link className="text-sm text-blue-700" href="/internal/support-inquiries">← 문의 처리</Link><h1 className="mt-5 text-2xl font-bold">코트 거래 인계</h1><p className="mt-3 text-sm leading-6 text-slate-600">비활성 운영자의 기존 거래를 처리해요. 원래 운영자는 바뀌지 않으며 실제 기록자와 인계 근거를 남겨요.</p><Button className="mt-4" variant="secondary" disabled={busy} onClick={() => void load()}>새로고침</Button>
    {busy ? <p role="status" className="mt-4">인계 목록 확인 중…</p> : null}{error ? <p role="alert" className="mt-4 text-rose-700">{error}</p> : null}{!busy && !error && !data.items.length ? <p className="mt-6">인계할 거래가 없어요.</p> : null}
    <div className="mt-6 space-y-5">{data.items.map((item) => <HandoffCard key={item.id} item={item} refresh={() => load()} />)}</div>{data.nextCursor ? <Button className="mt-5" disabled={busy} onClick={() => void load(data.nextCursor!)}>더 보기</Button> : null}
  </div></main>;
}
function HandoffCard({ item, refresh }: { item: CourtHandoffQueue["items"][number]; refresh: () => Promise<void> }) {
  const [detail, setDetail] = useState<OperatorCourtMatch | null>(null);
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const requests = useRef(new Map<string,string>());
  const loadDetail = async () => {
    const response = await fetch(`${endpoint}/${item.id}`, { cache: "no-store" }); const body = await response.json();
    if (!response.ok) throw new Error(apiMessage(body, "거래 내용을 확인하지 못했어요.")); setDetail(body);
  };
  const action = async (cancel: boolean) => {
    if (busy) return; setBusy(true); setError("");
    const key = JSON.stringify({ cancel, note, version: item.version });
    const id = requests.current.get(key) ?? crypto.randomUUID(); requests.current.set(key,id);
    try {
      const response = await fetch(`${endpoint}/${item.id}${cancel ? "/cancel" : ""}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: item.version, clientRequestId: id, note }) }); const body = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "인계하지 못했어요.")); await refresh(); setDetail(null); setNote(""); requests.current.delete(key);
    } catch (e) { setError(e instanceof Error ? e.message : "처리하지 못했어요."); } finally { setBusy(false); }
  };
  return <article className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold">{item.title}</h2><p className="mt-1 text-sm text-slate-500">{formatStatusChangedAt(item.startsAt)}</p><p className="mt-3 text-sm">{item.assignedToMe ? "내가 인계받은 거래" : item.canClaim ? "인계 담당자 필요" : "다른 담당자 처리 중"}</p>
    {item.canClaim || (item.assignedToMe && ["OPEN", "CLOSED"].includes(item.status)) ? <form className="mt-4" onSubmit={(e) => { e.preventDefault(); void action(item.assignedToMe); }}><label className="text-sm font-semibold">{item.assignedToMe ? "경기 제공 불가 확인 근거" : "인계 사유·확인 근거"}<textarea className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 p-3 text-base font-normal" required minLength={10} maxLength={450} value={note} onChange={(e) => setNote(e.target.value)} placeholder="연락·업무 확인 내용과 확인 시각" /></label><p className="mt-2 text-xs leading-5 text-slate-500">{item.assignedToMe ? "남아 있는 신청을 운영 사유로 취소하고 실제 수령액 전액을 반환 대상으로 기록해요. 자동 송금은 실행하지 않아요." : "계좌는 참가자 본인이 입력해요. 은행 대조·인계 확인 없이 송금 결과를 추정해 기록하지 마세요."}</p><Button className="mt-3" disabled={busy} size="medium" fullWidth type="submit">{item.assignedToMe ? "경기 취소 · 남은 참가자 전액 반환" : "이 거래 인계받기"}</Button></form> : null}
    {item.assignedToMe ? <Button className="mt-4" variant="secondary" disabled={busy} onClick={() => { setBusy(true); setError(""); void loadDetail().catch((e) => setError(e.message)).finally(() => setBusy(false)); }}>입금·환불 내역 열기</Button> : null}
    {detail && item.assignedToMe ? <div className="mt-5 space-y-5">{detail.applications.map((a) => <section key={a.id} className="rounded-xl border border-slate-200 p-3"><h3 className="text-sm font-bold">{a.nickname} · {a.depositCode ?? "입금 코드 없음"}</h3><OperatorMoneyPanel application={a} endpoint="/api/internal/court-handoff-applications" refresh={loadDetail} /></section>)}</div> : null}
    <details className="mt-4 text-xs text-slate-500"><summary className="min-h-11 cursor-pointer py-3">인계 이력</summary><p className="break-all">원래 운영자 ID · {item.originalOperatorId}</p>{item.events.map((e,i) => <p className="mt-3 whitespace-pre-wrap break-words" key={i}>{formatStatusChangedAt(e.createdAt)} · {e.note}<br />실제 기록자 {e.actorUserId}{e.previousAssigneeUserId ? ` · 이전 담당자 ${e.previousAssigneeUserId}` : ""}</p>)}</details>
    {error ? <p className="mt-3 text-sm text-rose-700" role="alert">{error}</p> : null}
  </article>;
}

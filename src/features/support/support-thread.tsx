"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SupportAudience, SupportInquiryView } from "@/server/domain/support-service";
import { apiMessage, formatStatusChangedAt } from "@/features/partner/partner-session";

export function SupportThread({ inquiry: i, audience, refresh }: { inquiry: SupportInquiryView; audience: SupportAudience; refresh: () => Promise<void> }) {
  const [body, setBody] = useState("");
  const [action, setAction] = useState(audience === "operator" ? "OPERATOR_REPLY" : "REPLY");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{ key: string; id: string } | null>(null);
  const endpoint = audience === "reviewer" ? "/api/internal/support-inquiries" : audience === "operator" ? "/api/v1/operator/support-inquiries" : "/api/v1/support-inquiries";
  const send = async (chosen: string, text: string) => {
    if (busy) return;
    const key = JSON.stringify({ chosen, text, version: i.version });
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    setBusy(true); setError("");
    try {
      const response = await fetch(`${endpoint}/${i.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: chosen, body: text, expectedVersion: i.version, clientRequestId: pending.current.id }) });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(data, "답변을 저장하지 못했어요."));
      await refresh(); setBody(""); pending.current = null;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "저장하지 못했어요."); }
    finally { setBusy(false); }
  };
  const canReply = audience === "member" || (audience === "reviewer" && i.assignedToMe) || (audience === "operator" && i.status === "WAITING_OPERATOR");
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
    <div className="flex flex-wrap justify-between gap-2"><span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-700">{i.statusLabel}</span><time className="text-xs text-slate-500">{formatStatusChangedAt(i.createdAt)}</time></div>
    {i.match ? <p className="mt-3 font-semibold">{i.match.title} · {formatStatusChangedAt(i.match.startsAt)}</p> : null}
    {i.applicationId && i.match && audience !== "member" ? <p className="mt-2 text-xs text-slate-500"><span className="break-words">{i.applicantLabel}</span>{audience === "operator" ? <Link className="mt-2 block text-blue-600 underline" href={`/partner/court-matches/${i.match.id}#application-${i.applicationId}`}>해당 매칭 입금·환불 대조 →</Link> : null}</p> : null}
    {i.message ? <p className="mt-4 whitespace-pre-wrap break-words leading-6">{i.message}</p> : null}
    <div className="mt-4 space-y-3">{i.messages.map((m) => <div key={m.id} className={`rounded-xl p-3 ${m.visibility === "OPERATOR" ? "bg-amber-50" : "bg-slate-50"}`}><p className="text-xs font-semibold text-slate-500">{m.authorLabel} · {formatStatusChangedAt(m.createdAt)}{m.visibility === "OPERATOR" ? " · 운영자 대조" : ""}</p><p className="mt-2 whitespace-pre-wrap break-words leading-6">{m.body}</p></div>)}</div>
    {audience === "reviewer" && !i.assignedToMe ? <Button className="mt-4" disabled={busy || i.assigned} size="medium" onClick={() => void send("CLAIM", "담당자가 문의 검토를 시작했어요.")}>{i.assigned ? "다른 담당자 검토 중" : "문의 담당하기"}</Button> : null}
    {canReply ? <form className="mt-4" onSubmit={(e) => { e.preventDefault(); void send(action, body); }}><fieldset disabled={busy}>
      {audience === "reviewer" ? <label className="block font-semibold">처리 유형<select className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-base" value={action} onChange={(e) => setAction(e.target.value)}><option value="REPLY">회원에게 답변</option>{i.match?.slotId ? <option value="REQUEST_OPERATOR">운영자에게 대조 요청</option> : null}<option value="RESOLVE">해결 완료 · 회원에게 결과 안내</option></select></label> : null}
      {action === "REQUEST_OPERATOR" ? <p className="mt-2 text-xs leading-5 text-amber-800">이 내용만 운영자에게 전달돼요. 확인에 필요한 정보만 적어 주세요.</p> : null}
      <label className="mt-3 block font-semibold">{audience === "member" ? "추가 문의" : "답변 내용"}<textarea className="mt-2 min-h-28 w-full rounded-xl border border-slate-200 p-3 text-base font-normal" required minLength={2} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} /></label>
      <Button className="mt-3" type="submit" size="medium" fullWidth>{audience === "member" ? "추가 문의 보내기" : "답변·처리 저장"}</Button>
    </fieldset></form> : null}
    {error ? <p className="mt-3 text-rose-700" role="alert">{error}</p> : null}
  </article>;
}

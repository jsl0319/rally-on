"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BackButton } from "@/components/navigation/back-button";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { Button } from "@/components/ui/button";
import { courtContactInputSchema, formatCourtContactPhone, type CourtContact } from "@/matches/court-contact";
import { apiMessage } from "./partner-session";

export type ContactCourt = { id: string; name: string; operatorContact: CourtContact | null; contactVersion: number };
const fieldClass = "mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base disabled:opacity-50";

export function OperatorContact({ courtId, onCourtChange, onDone, onBusyChange }: {
  courtId?: string;
  onCourtChange?: (court: ContactCourt) => void;
  onDone?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [court, setCourt] = useState<ContactCourt | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [phone, setPhone] = useState("");
  const [hours, setHours] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setLoadError(""); setError(""); setSaved("");
    try {
      const response = await fetch("/api/v1/operator/courts", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "연락처 정보를 불러오지 못했어요."));
      const items = body.items as ContactCourt[];
      const first = (courtId ? items.find((item) => item.id === courtId) : items[0]) ?? null;
      if (courtId && !first) throw new Error("코트장을 찾을 수 없어요.");
      setCourt(first); setPhone(first?.operatorContact ? formatCourtContactPhone(first.operatorContact.phone) : "");
      setHours(first?.operatorContact?.hours ?? ""); setAgreed(false); setConfirmStop(false);
      if (first) onCourtChange?.(first);
    } catch (caught) { setLoadError(caught instanceof Error ? caught.message : "연락처 정보를 불러오지 못했어요."); }
    finally { setLoading(false); }
  }, [courtId, onCourtChange]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const save = async (stop = false) => {
    if (!court || busy) return;
    setError(""); setSaved("");
    const parsed = courtContactInputSchema.safeParse({ phone, hours, publicationAgreed: agreed, expectedVersion: court.contactVersion });
    if (!stop && !parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true);
    onBusyChange?.(true);
    try {
      const response = await fetch(`/api/v1/operator/courts/${court.id}/contact`, {
        method: stop ? "DELETE" : "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stop ? { expectedVersion: court.contactVersion } : parsed.data),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "연락처를 저장하지 못했어요."));
      const next = body as ContactCourt;
      setCourt(next); setPhone(next.operatorContact ? formatCourtContactPhone(next.operatorContact.phone) : "");
      setHours(next.operatorContact?.hours ?? ""); setAgreed(false); setConfirmStop(false);
      setSaved(stop ? "전화번호 공개를 중단했어요. 기존 신청자는 Rally On 문의를 이용할 수 있어요." : "운영자 연락처를 저장했어요.");
      onCourtChange?.(next);
      onDone?.();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "연락처를 저장하지 못했어요."); }
    finally { setBusy(false); onBusyChange?.(false); }
  };
  const edit = () => { setSaved(""); setError(""); setAgreed(false); };

  const content = <>
    {courtId ? <h2 className="text-lg font-bold">문의 연락처</h2> : <><BackButton className="inline-flex size-11 items-center justify-center rounded-full" fallbackPath="/partner" /><h1 className="mt-5 text-2xl font-bold">운영자 연락처</h1></>}
    {loading ? <CourtRallyLoader label="연락처를 확인하고 있어요." /> : loadError ? <div className="mt-6"><p role="alert">{loadError}</p><Button className="mt-4" onClick={() => void load()}>다시 불러오기</Button></div> : !court ? <div className="mt-6"><p>코트 기본정보를 먼저 준비해 주세요. 등록한 이름과 주소는 그대로 사용해요.</p><Button as={Link} className="mt-4" href="/partner/slots/new">코트 기본정보 설정하기</Button></div> : <>
      <p className="mt-3 text-sm leading-6 text-slate-600">{court.name}의 신청자가 입금·시설·현장 이용을 문의할 번호예요. 실제 응대할 수 있는 업무용 번호를 등록해 주세요.</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">한 번 저장하면 이 코트의 모든 매칭에서 함께 사용해요.</p>
      <form className={courtId ? "mt-6" : "mt-6 rounded-3xl bg-white p-5"} onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label className="block text-sm font-semibold" htmlFor="operator-phone">운영자 전화번호</label>
        <input id="operator-phone" className={fieldClass} type="tel" inputMode="tel" autoComplete="off" maxLength={24} placeholder="예) 02-1234-5678" value={phone} disabled={busy} onChange={(e) => { setPhone(e.target.value); edit(); }} />
        <label className="mt-5 block text-sm font-semibold" htmlFor="operator-contact-hours">연락 가능 시간</label>
        <input id="operator-contact-hours" className={fieldClass} autoComplete="off" maxLength={80} placeholder="예) 매일 09:00~18:00, 경기 당일 시작 전까지" value={hours} disabled={busy} onChange={(e) => { setHours(e.target.value); edit(); }} />
        <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">신청 접수 후 경기 종료 24시간까지 공개해요. 철회·거절·취소되면 미처리 입금·환불이 있는 동안만 공개하며, 종료 24시간이 지나도 해당 거래가 해결될 때까지 유지해요. 번호를 바꾸면 기존 신청자에게도 새 번호가 보여요.</p>
        <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-6"><input className="mt-1 size-5 shrink-0 accent-blue-600" type="checkbox" checked={agreed} disabled={busy} onChange={(e) => setAgreed(e.target.checked)} /><span>이 번호로 문의를 받을 수 있으며, 위 범위의 신청자에게 전화번호와 연락 가능 시간을 공개하는 데 동의해요.</span></label>
        {error ? <div className="mt-4"><p className="text-sm text-rose-700" role="alert">{error}</p><button className="mt-2 min-h-11 text-sm text-blue-700 underline" type="button" disabled={busy} onClick={() => void load()}>최신 정보 다시 불러오기</button></div> : null}
        <Button className="mt-5" fullWidth disabled={busy} loading={busy} type="submit">연락처 저장하기</Button>
      </form>
      {saved ? <p className="mt-4 text-sm leading-6 text-blue-700" role="status">{saved}</p> : null}
      {court.operatorContact ? <div className="mt-5 rounded-2xl border border-slate-200 p-4">
        {confirmStop ? <><p className="text-sm leading-6">신청자에게 전화번호가 더 이상 보이지 않고 새 매칭도 공개할 수 없어요. 기존 경기와 신청은 유지돼요.</p><div className="mt-3 flex gap-3"><Button variant="neutral" disabled={busy} onClick={() => setConfirmStop(false)}>유지하기</Button><Button variant="secondary" disabled={busy} onClick={() => void save(true)}>공개 중단하기</Button></div></> : <button type="button" className="min-h-11 text-sm text-slate-600 underline" disabled={busy} onClick={() => setConfirmStop(true)}>전화번호 공개 중단</button>}
      </div> : null}
    </>}
  </>;
  return courtId ? <div className="pb-6 text-slate-800">{content}</div> : <main className="min-h-svh bg-slate-50 px-5 pb-12 pt-6 text-slate-800"><div className="mx-auto max-w-[560px]">{content}</div></main>;
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarBlank, MapPin } from "@phosphor-icons/react";
import { Modal, ModalContainer, ModalNavigation, ModalClose, ModalContent, ModalContentItem, ActionArea, ActionAreaButton } from "@wanteddev/wds";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { BackButton } from "@/components/navigation/back-button";
import { Button } from "@/components/ui/button";
import { CourtMedia } from "@/features/matches/court-media";
import { MatchBadge, matchSchedule } from "@/features/matches/match-presentation";
import { CourtDirectionsButton } from "@/features/matches/court-directions-button";
import type { CourtMatchParticipation } from "@/server/domain/court-match-view";
import { apiMessage, formatStatusChangedAt, type PublicCourtSlot } from "./partner-session";
import { CourtMatchPayment } from "./court-match-payment";

type Detail = PublicCourtSlot & { participation: CourtMatchParticipation | null };

export function PartnerSessionDetail({ slotId }: { slotId: string }) {
  const [slot, setSlot] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [applyError, setApplyError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(`/api/v1/partner-session-slots/${encodeURIComponent(slotId)}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(apiMessage(body, "코트 매칭을 불러오지 못했어요."));
    setSlot(body); setError("");
  }, [slotId]);
  const reload = useCallback(() => { void load().catch((caught) => setError(caught instanceof Error ? caught.message : "불러오지 못했어요.")); }, [load]);
  useEffect(() => { const timer = window.setTimeout(reload, 0); return () => window.clearTimeout(timer); }, [reload]);

  const apply = async () => {
    if (!slot?.participation || busy) return;
    setBusy(true); setApplyError("");
    try {
      const response = await fetch(`/api/v1/court-matches/${slot.participation.id}/applications`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
      const body = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "신청을 보내지 못했어요."));
      await load(); setOpen(false); setMessage("");
    } catch (caught) { setApplyError(caught instanceof Error ? caught.message : "신청을 보내지 못했어요."); } finally { setBusy(false); }
  };

  if (!slot) return <main className="grid min-h-svh place-items-center bg-slate-50 px-5 text-center">{error ? <div><p>{error}</p><Button className="mt-4" onClick={reload}>다시 불러오기</Button><Link href="/partner-sessions" className="ml-3 text-sm underline">목록 보기</Link></div> : <CourtRallyLoader label="코트 매칭을 준비하고 있어요." />}</main>;
  const participation = slot.participation;
  const date = matchSchedule(slot.startsAt, slot.endsAt);
  return <main className="min-h-svh bg-slate-50 pb-28 text-[var(--tm-text-primary)]"><article className="mx-auto max-w-[560px] bg-white">
    <div className="relative"><CourtMedia alt={`${slot.court.name} 코트 사진`} className="aspect-[7/4] w-full !rounded-none" fallbackLabel="코트 사진 준비 중" image={slot.court.image} priority /><div className="absolute left-5 top-5 grid size-11 place-items-center rounded-full bg-white/95 shadow-sm"><BackButton fallbackPath="/partner-sessions" /></div></div>
    <header className="px-5 py-6"><div className="flex flex-wrap gap-2"><MatchBadge tone={participation?.status === "OPEN" ? "blue" : "neutral"}>{slot.session?.statusLabel ?? slot.statusLabel}</MatchBadge>{slot.gameType ? <MatchBadge>{slot.gameType.label}</MatchBadge> : null}<MatchBadge tone="green">{slot.approvalMode === "AUTO" ? "선착순 자동 승인" : "운영자 승인"}</MatchBadge></div><h1 className="mt-4 break-words text-[26px] font-bold leading-snug tracking-tight">{slot.court.name}</h1><p className="mt-2 flex items-start gap-1.5 text-sm leading-6 text-slate-500"><MapPin className="mt-0.5 shrink-0" size={18} aria-hidden />{slot.court.address}</p></header>
    <Section title="일정과 모집"><p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold tabular-nums"><CalendarBlank size={20} className="text-slate-400" aria-hidden /><span>{date.day}</span><span>{date.time}</span></p><dl className="mt-5 space-y-4 text-sm"><Row label="코트 번호">{slot.court.courtNumber}</Row><Row label="모집 인원">최소 {slot.minParticipantCount}명 · 최대 {slot.maxParticipantCount}명</Row><Row label="남은 자리">{participation?.remainingGenderSpots ? `남 ${participation.remainingGenderSpots.male}명 · 여 ${participation.remainingGenderSpots.female}명` : `${participation?.remainingSpots ?? slot.session?.remainingSpots ?? 0}명`}</Row><Row label="참가 확정">{participation?.confirmedCount ?? 0}명</Row><Row label="게스트 참가비">{slot.guestFeeKrw.toLocaleString("ko-KR")}원</Row></dl></Section>
    {participation ? <Section title={participation.application ? "내 참가 신청" : "참가 안내"}>
      {participation.cancellationReason ? <p className="mb-4 rounded-2xl bg-rose-50 p-4 text-sm leading-6 text-rose-700">{participation.cancellationReason}</p> : null}
      {participation.application ? <CourtMatchPayment participation={participation} onRefresh={load} /> : <div className="space-y-2 text-sm leading-6 text-slate-600"><p>{slot.approvalMode === "AUTO" ? "신청하면 조건과 남은 자리를 확인해 자동 승인해요." : "운영자가 프로필과 신청 내용을 확인한 뒤 승인해요."}</p><p>승인 후 안내된 계좌로 이체하고, 운영자가 입금을 확인하면 참가가 확정돼요.</p></div>}
      <p className="mt-5 text-xs leading-6 text-slate-500">{formatStatusChangedAt(participation.judgementAt)} 기준으로 입금 확인 인원이 {slot.minParticipantCount}명 미만이면 자동 취소돼요. 신청은 {formatStatusChangedAt(participation.applicationDeadline)}까지 가능해요.</p>
      {participation.chatHref ? <Button as={Link} className="mt-4" fullWidth href={participation.chatHref} variant="secondary">채팅방 열기</Button> : null}
    </Section> : null}
    <Section title="위치와 현장 안내"><p className="text-sm leading-6 text-slate-600">{slot.court.address}</p>{slot.session ? <CourtDirectionsButton matchId={slot.session.matchId} name={slot.court.name} address={slot.court.address} /> : null}{slot.usageNote ? <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">{slot.usageNote}</p> : null}<Link className="mt-5 inline-flex text-sm font-semibold text-blue-600" href={participation ? `/support/inquiry?matchId=${encodeURIComponent(participation.id)}` : "/support/inquiry"}>이용·입금 문의 →</Link></Section>
  </article>
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-100 bg-white/95 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-4 backdrop-blur"><div className="mx-auto flex max-w-[520px] items-center gap-5"><div className="shrink-0"><p className="text-xs text-slate-500">1인 참가비</p><p className="mt-1 text-lg font-bold tabular-nums">{slot.guestFeeKrw.toLocaleString("ko-KR")}원</p></div><div className="min-w-0 flex-1">{participation?.isOperator && !participation.legacy ? <Button as={Link} fullWidth href={`/partner/court-matches/${participation.id}`}>참가자 관리</Button> : participation?.canApply ? <Button fullWidth onClick={() => { setApplyError(""); setOpen(true); }}>같이 치기</Button> : <p className="text-right text-sm font-semibold leading-6 text-slate-500">{participation?.application?.statusLabel ?? participation?.blockedReason ?? "신청할 수 없는 일정이에요."}</p>}</div></div></div>
    {open ? <Modal open onOpenChange={(next) => { if (!next && !busy) setOpen(false); }}><ModalContainer variant="bottom" size="large"><ModalNavigation trailingContent={<ModalClose disabled={busy} aria-label="신청 창 닫기" />}>같이 치기</ModalNavigation><ModalContent><ModalContentItem><p className="text-lg font-bold">{slot.court.name}</p><p className="mt-2 text-sm text-slate-500">{date.day} {date.time}</p><p className="mt-3 text-sm font-semibold">1인 {slot.guestFeeKrw.toLocaleString("ko-KR")}원 · 계좌이체</p></ModalContentItem><ModalContentItem>{slot.approvalMode === "OPERATOR" ? <><label className="text-sm font-semibold" htmlFor="court-application-message">운영자에게 보낼 자기소개 <span className="font-normal text-slate-400">선택</span></label><textarea id="court-application-message" className="mt-3 min-h-32 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6" maxLength={200} autoComplete="off" value={message} disabled={busy} onChange={(e) => setMessage(e.target.value)} placeholder="테니스 경험이나 원하는 플레이를 적어 주세요." /><p className="mt-1 text-right text-xs text-slate-400">{message.length}/200</p></> : <p className="text-sm leading-6 text-slate-600">자동 승인되면 입금 계좌와 기한을 안내해요. 운영자의 입금 확인 후 참가가 확정돼요.</p>}{applyError ? <p role="alert" className="mt-3 text-sm text-rose-600">{applyError}</p> : null}<Button className="mt-3" variant="neutral" onClick={() => { reload(); setOpen(false); }} disabled={busy}>신청 상태 새로 확인</Button></ModalContentItem></ModalContent><ActionArea variant="neutral"><ActionAreaButton buttonColor="assistive" variant="alternative" disabled={busy} onClick={() => setOpen(false)}>취소</ActionAreaButton><ActionAreaButton variant="main" loading={busy} disabled={busy} onClick={() => void apply()}>신청 보내기</ActionAreaButton></ActionArea></ModalContainer></Modal> : null}
  </main>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="border-t-[8px] border-slate-50 px-5 py-6"><h2 className="text-lg font-bold">{title}</h2><div className="mt-4">{children}</div></section>; }
function Row({ label, children }: { label: string; children: React.ReactNode }) { return <div className="flex justify-between gap-4"><dt className="shrink-0 text-slate-500">{label}</dt><dd className="text-right font-semibold">{children}</dd></div>; }

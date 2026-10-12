"use client";

import Link from "next/link";
import { useCourtDetail } from "./use-court-detail";
import { CourtFreshness } from "./court-freshness";
import { useEffect, useState } from "react";
import { CalendarBlank, MapPin, Users, Phone, ChatCircle } from "@phosphor-icons/react";
import { Modal, ModalContainer, ModalNavigation, ModalClose, ActionArea, ActionAreaButton } from "@wanteddev/wds";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { BackButton } from "@/components/navigation/back-button";
import { Button } from "@/components/ui/button";
import { CourtMedia } from "@/features/matches/court-media";
import { displayPartnerCourtImage, MatchBadge, PlayPurposeBadge, matchSchedule } from "@/features/matches/match-presentation";
import { CourtDirectionsButton } from "@/features/matches/court-directions-button";
import type { CourtMatchParticipation } from "@/server/domain/court-match-view";
import { apiMessage, type PublicCourtSlot } from "./partner-session";
import { CourtMatchPayment } from "./court-match-payment";
import { CourtApplicationNoticeContent } from "./court-application-notice";
import { CourtCompositionNotice } from "./court-composition-notice";
import { formatCourtContactPhone } from "@/matches/court-contact";
import { ballMinimumCount } from "@/matches/court-fee";

type Detail = PublicCourtSlot & { participation: CourtMatchParticipation | null };

export function PartnerSessionDetail({ slotId }: { slotId: string }) {
  const { data: slot, error, checkedAt, load, reload } = useCourtDetail<Detail>(
    `/api/v1/partner-session-slots/${encodeURIComponent(slotId)}`, (s) => [s.startsAt, s.endsAt, s.participation?.judgementAt, s.participation?.applicationDeadline, s.participation?.lateConfirmationDeadline, s.participation?.application?.paymentDueAt, s.participation?.application?.confirmationDueAt]);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [bringBalls, setBringBalls] = useState(false);
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const applicationId = slot?.participation?.application?.id;
  useEffect(() => {
    if (!applicationId || !window.location.hash.startsWith("#application-")) return;
    const target = document.getElementById(window.location.hash.slice(1));
    if (target instanceof HTMLDetailsElement) target.open = true;
    target?.scrollIntoView({ block: "start" });
  }, [applicationId]);
  const apply = async () => {
    if (!slot?.participation || busy || !noticeAccepted) return;
    setBusy(true); setApplyError("");
    try {
      const response = await fetch(`/api/v1/court-matches/${slot.participation.id}/applications`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, bringBalls, noticeAccepted: true, noticeFingerprint: (bringBalls ? slot.participation.ballContribution?.notice : slot.participation.applicationNotice)?.fingerprint }) });
      const body = await response.json();
      if (!response.ok) {
        if (["APPLICATION_NOTICE_CHANGED", "BALL_SLOT_TAKEN"].includes(body?.error?.code)) { setNoticeAccepted(false); await load(); }
        throw new Error(apiMessage(body, "신청을 보내지 못했어요."));
      }
      await load(); setOpen(false); setMessage("");
    } catch (caught) { setApplyError(caught instanceof Error ? caught.message : "신청을 보내지 못했어요."); } finally { setBusy(false); }
  };

  if (!slot) return <main className="grid min-h-app place-items-center bg-[var(--tm-bg-subtle-muted)] px-5 text-center">{error ? <div><p>{error}</p><Button className="mt-4" onClick={reload}>다시 불러오기</Button><Link href="/partner-sessions" className="ml-3 text-sm underline">목록 보기</Link></div> : <CourtRallyLoader label="코트 매칭을 준비하고 있어요." />}</main>;
  const image = displayPartnerCourtImage(slot.court);
  const participation = slot.participation;
  const applied = Boolean(participation?.application);
  const date = matchSchedule(slot.startsAt, slot.endsAt);
  const remaining = participation?.remainingGenderSpots
    ? `남 ${participation.remainingGenderSpots.male}명 · 여 ${participation.remainingGenderSpots.female}명`
    : `${participation?.remainingSpots ?? slot.session?.remainingSpots ?? 0}명`;
  const needsAttention = participation && ["ACTION_REQUIRED", "REVIEW_REQUIRED"].includes(participation.composition.phase);
  const benefitAvailable = Boolean(participation?.canApply && participation.ballContribution?.available);
  const chosenNotice = participation ? (bringBalls && participation.ballContribution ? participation.ballContribution.notice : participation.applicationNotice) : null;
  const fee = participation?.canApply ? slot.guestFeeKrw : participation?.application?.payableFeeKrw ?? slot.guestFeeKrw;
  const pendingRefunds = participation?.previousApplications?.some(a => a.awaitingRefund);
  const locationAndContact = <>
    <section id="court-directions" className="mt-5 scroll-mt-20 border-t border-[var(--tm-border-subtle)] py-5"><h2 className="mb-3 text-[17px] font-bold">찾아오는 길</h2>
      <p className="font-semibold text-sm">{slot.court.name} · {slot.court.courtNumber}</p>
      <p className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-5 text-[var(--tm-text-secondary)]"><MapPin size={16} className="mt-0.5 shrink-0" aria-hidden />{slot.court.address}</p>
      {slot.session ? <CourtDirectionsButton matchId={slot.session.matchId} name={slot.court.name} address={slot.court.address} /> : null}
    </section>
    {applied && participation ? <section className="border-t border-[var(--tm-border-subtle)] py-5"><h2 className="mb-3 text-[17px] font-bold">연락하기</h2>
      <div className="grid gap-2">
        {participation.chatHref ? <Button as={Link} fullWidth href={participation.chatHref} variant="secondary"><ChatCircle size={19} aria-hidden />참가자 채팅방</Button> : null}
        {participation.operatorContact ? <>
          <Button as="a" fullWidth href={participation.operatorContact.telHref} variant="secondary"><Phone size={18} aria-hidden />운영자에게 전화</Button>
          <p className="text-center text-xs leading-5 text-[var(--tm-text-secondary)]">{formatCourtContactPhone(participation.operatorContact.phone)} · {participation.operatorContact.hours}</p>
        </> : <p className="text-sm text-[var(--tm-text-secondary)]">현재 운영자 전화 문의를 이용할 수 없어요.</p>}
      </div>
      <Link className="mt-3 inline-flex min-h-11 items-center text-xs font-medium text-[var(--tm-text-secondary)] underline underline-offset-4" href={`/support/inquiry?matchId=${encodeURIComponent(participation.id)}${participation.application ? `&applicationId=${participation.application.id}` : ""}`}>연락이 어렵거나 입금·환불에 문제가 있나요?</Link>
    </section> : null}
  </>;
  return <main className="min-h-app bg-[var(--tm-bg-page)] pb-28 text-[var(--tm-text-primary)]">
    <article className="mx-auto max-w-[560px] bg-white">
      <div className="rally-sticky-header grid h-14 grid-cols-[44px_1fr_44px] items-center px-3">
        <BackButton fallbackPath="/partner-sessions" />
        <p className="text-center text-sm font-semibold">코트 매칭</p>
      </div>
      <CourtMedia alt={image.sourceLabel === "견본 이미지" ? "실제 장소와 다른 테니스장 견본 사진" : `${slot.court.name} 코트 사진`} className={`${applied ? "h-28" : "aspect-[2.2/1]"} w-full !rounded-none`} fallbackLabel="코트 사진 준비 중" image={image} priority />
      <header className="px-5 pb-5 pt-5">
        <div className="flex items-center gap-2 text-xs">
          <MatchBadge tone={participation?.status === "OPEN" ? "green" : "neutral"}>{slot.session?.statusLabel ?? slot.statusLabel}</MatchBadge>
          {slot.gameType ? <span className="font-medium text-[var(--tm-text-secondary)]">{slot.gameType.label}</span> : null}
        </div>
        <h1 className="mt-2 break-words text-[26px] font-bold leading-[34px] tracking-tight">{slot.court.name}</h1>
        <p className="mt-1 text-[13px] text-[var(--tm-text-secondary)]">{slot.court.region.name} · {slot.court.courtNumber}</p>
        <div className="mt-5 border-y border-[var(--tm-border-subtle)] py-4">
          <div className="flex gap-3">
            <CalendarBlank size={21} className="mt-0.5 shrink-0 text-[var(--tm-text-secondary)]" aria-hidden />
            <div><p className="text-sm font-semibold tabular-nums">{date.day}</p><p className="mt-1 text-[17px] font-semibold tabular-nums tracking-tight">{date.time}</p></div>
          </div>
          {!applied ? <div className="mt-3 flex items-start gap-3">
            <Users size={21} className="shrink-0 text-[var(--tm-text-secondary)]" aria-hidden />
            <p className="text-[13px] leading-5"><span className="font-semibold">{remaining} 남음</span><span className="ml-2 whitespace-nowrap text-xs text-[var(--tm-text-secondary)]">정원 {slot.maxParticipantCount}명</span></p>
          </div> : null}
        </div>
        {!applied ? <div aria-label="참가비" className="pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm text-[var(--tm-text-secondary)]">{participation?.application && !participation.canApply ? "내 참가비" : "1인 참가비"}</p>
            <p className="text-[26px] font-bold leading-8 tabular-nums tracking-tight">{fee.toLocaleString("ko-KR")}<span className="ml-0.5 text-base font-semibold">원</span></p>
          </div>
          {participation?.ballContribution && !participation.application ? <div className="mt-3 border-t border-dashed border-[var(--tm-border-default)] pt-3">
            {benefitAvailable ? <>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">공 준비로 참가하면</span>
                <strong className="tabular-nums text-[var(--tm-action-primary)]">{participation.ballContribution.feeKrw.toLocaleString("ko-KR")}원</strong>
              </div>
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-xs leading-5">
                <span className="text-[var(--tm-text-secondary)]">새 공 1캔 · 최소 {ballMinimumCount}구 · 선착순 1명</span>
                <span className="font-semibold text-[var(--tm-action-primary)]">5,000원 할인</span>
              </div>
            </> : <p className="text-xs leading-5 text-[var(--tm-text-secondary)]">{participation.ballContribution.available ? "공 준비 할인 신청이 마감됐어요." : "공 준비 참가자가 정해졌어요."}</p>}
          </div> : null}
        </div> : null}
      </header>
    {error ? <CourtFreshness checkedAt={checkedAt} error={error} reload={reload} /> : null}
    {participation && needsAttention ? <div className="px-5 pb-4"><CourtCompositionNotice match={participation} /></div> : null}
    {participation?.cancellationReason ? <div role="status" className="mx-5 mb-5 rounded-xl bg-rose-50 p-4 text-sm leading-6 text-rose-700">{participation.cancellationReason}</div> : null}
    {participation?.application ? <section id="my-application" aria-label="내 참가 신청" className="scroll-mt-20 px-5 pb-5">
      <div id={`application-${participation.application.id}`} className="scroll-mt-20">
        <CourtMatchPayment key={participation.application.id} participation={participation} onRefresh={load}>
          {!needsAttention && participation.composition.enabled ? <div className="mt-4 border-t border-[var(--tm-border-subtle)] pt-4"><CourtCompositionNotice match={participation} /></div> : null}
          {pendingRefunds ? <a href="#previous-applications" className="mt-3 block rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">이전 신청의 환불이 남아 있어요 →</a> : null}
          {locationAndContact}
        </CourtMatchPayment>
      </div>
    </section> : null}
    {!applied ? <div className="px-5">{locationAndContact}</div> : null}
    {participation && !participation.application ? <Section title="참가 전 알아두세요">
      {!needsAttention ? <CourtCompositionNotice match={participation} /> : null}
      <CourtApplicationNoticeContent notice={participation.applicationNotice} compact hideProgress={participation.composition.enabled || participation.composition.phase === "REVIEW_REQUIRED"} hideUsageNote />
    </Section> : null}
    {slot.usageNote || slot.session?.playPurposes.length ? <Section title="매칭 소개">
      {slot.session?.playPurposes.length ? <div className="mb-3 flex flex-wrap gap-1.5">{slot.session.playPurposes.map(purpose => <PlayPurposeBadge key={purpose.code} purpose={purpose} />)}</div> : null}
      {slot.usageNote ? <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[var(--tm-text-muted)]">{slot.usageNote}</p> : null}
    </Section> : null}
    {participation?.previousApplications?.length ? <section id="previous-applications" className="mx-5 scroll-mt-20 border-t border-[var(--tm-border-subtle)] py-5">
      <h2 className="text-[17px] font-bold">이전 신청 내역</h2>
      <p className="mt-2 text-xs leading-5 text-[var(--tm-text-secondary)]">이전 입금과 환불은 새 신청과 별도로 처리해요.</p>
      {participation.previousApplications.map(previous => <details key={previous.id} id={`application-${previous.id}`} open={previous.awaitingRefund || undefined} className="mt-3 scroll-mt-20 rounded-xl border border-[var(--tm-border-default)] px-4">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{previous.statusLabel} · {previous.feeKrw.toLocaleString("ko-KR")}원{previous.depositCode ? ` · ${previous.depositCode}` : ""}</summary>
        <div className="pb-4"><CourtMatchPayment participation={{ ...participation, application: previous, cancellation: null, settlementAccount: null }} onRefresh={load} historical /></div>
      </details>)}
    </section> : null}
    {!error ? <CourtFreshness checkedAt={checkedAt} error="" reload={reload} compact /> : null}
  </article>
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--tm-border-subtle)] bg-white px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
      <div className="mx-auto flex max-w-[520px] items-center gap-5">
        {!applied || participation?.canApply ? <div className="shrink-0"><p className="text-[11px] text-[var(--tm-text-secondary)]">{participation?.application && !participation.canApply ? "내 참가비" : "1인 참가비"}</p><p className="mt-0.5 text-xl font-bold tracking-tight tabular-nums">{fee.toLocaleString("ko-KR")}원</p></div> : null}
        <div className="min-w-0 flex-1">{participation?.isOperator && !participation.legacy ? <Button as={Link} fullWidth href={`/partner/court-matches/${participation.id}`}>참가자 관리</Button> : participation?.canApply ? <Button fullWidth onClick={() => { setApplyError(""); setBringBalls(false); setNoticeAccepted(false); setOpen(true); }}>{applied ? "다시 신청하기" : "같이 치기"}</Button> : participation?.application ? <Button as="a" fullWidth href={participation.application.status === "CONFIRMED" ? "#court-directions" : "#my-application"}>{participation.application.awaitingRefund ? "환불 안내 확인" : participation.application.status === "ACCEPTED" ? "입금 안내 확인" : participation.application.status === "CONFIRMED" ? "찾아오는 길" : "내 신청 확인"}</Button> : <p className="text-right text-sm font-semibold leading-6 text-[var(--tm-text-secondary)]">{participation?.application?.statusLabel ?? participation?.blockedReason ?? "신청할 수 없는 일정이에요."}</p>}</div>
      </div>
    </div>
    {open ? <Modal open onOpenChange={(next) => { if (!next && !busy) setOpen(false); }}><ModalContainer variant="bottom" size="large" sx={{ width: "100%", maxWidth: 560, maxHeight: "calc(100dvh - var(--rally-safe-top) - 12px)", padding: 0, borderRadius: "24px 24px 0 0", overflow: "hidden" }}><ModalNavigation trailingContent={<ModalClose disabled={busy} aria-label="신청 창 닫기" />}>같이 치기</ModalNavigation><div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-4"><p className="text-lg font-bold">{slot.court.name}</p><p className="mt-2 text-sm text-[var(--tm-text-secondary)]">{date.day} {date.time}</p><p className="mb-4 mt-2 text-sm text-[var(--tm-text-secondary)]">{slot.court.address} · {slot.court.courtNumber}</p>{participation?.ballContribution ? <fieldset className="mb-5 space-y-2" disabled={busy}>
      <legend className="mb-2 font-semibold">참가 방식</legend>
      {[false, true].map((balls) => <label key={String(balls)} className={`flex min-h-14 items-center gap-3 rounded-xl border p-3 text-sm ${bringBalls === balls ? "border-[var(--tm-action-primary)] bg-[var(--tm-bg-page)]" : "border-[var(--tm-border-default)]"}`}>
        <input className="size-4 shrink-0 accent-[var(--tm-action-primary)]" type="radio" name="ball-contribution" checked={bringBalls === balls} disabled={balls && !participation.ballContribution?.available} onChange={() => { setBringBalls(balls); setNoticeAccepted(false); }} />
        <span className="flex-1">{balls ? "공 준비 참가" : "기본 참가"}{balls ? <span className="block text-xs text-[var(--tm-text-secondary)]">{participation.ballContribution?.available ? "선착순 1명 · 새 공 1캔, 최소 2구" : "다른 참가자가 확보했어요"}</span> : null}</span>
        <strong className="whitespace-nowrap">{(balls ? participation.ballContribution!.feeKrw : participation.guestFeeKrw).toLocaleString("ko-KR")}원</strong>
      </label>)}
      <p className="text-xs leading-5 text-[var(--tm-text-secondary)]">공 준비자는 함께 사용할 새 공을 가져와 주세요. 미지참 시 5,000원을 추가 입금해요.</p>
    </fieldset> : <p className="mb-4 text-lg font-bold">1인 {slot.guestFeeKrw.toLocaleString("ko-KR")}원</p>}{chosenNotice ? <CourtApplicationNoticeContent notice={chosenNotice} compact /> : null}<div className="mt-4">{slot.approvalMode === "OPERATOR" ? <><label className="text-sm font-semibold" htmlFor="court-application-message">운영자에게 보낼 자기소개 <span className="font-normal text-[var(--tm-text-secondary)]">선택</span></label><textarea id="court-application-message" className="rally-input mt-3 min-h-32 w-full rounded-2xl border border-[var(--tm-border-default)] bg-[var(--tm-bg-subtle-muted)] p-4 text-sm leading-6" maxLength={200} autoComplete="off" value={message} disabled={busy} onChange={(e) => setMessage(e.target.value)} placeholder="테니스 경험이나 원하는 플레이를 적어 주세요." /><p className="mt-1 text-right text-xs text-[var(--tm-text-secondary)]">{message.length}/200</p></> : null}<label className="mt-5 flex min-h-11 cursor-pointer items-start gap-3 border-t border-[var(--tm-border-subtle)] py-4 text-sm font-medium leading-6"><input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--tm-action-primary)]" checked={noticeAccepted} onChange={(e) => setNoticeAccepted(e.target.checked)} disabled={busy} />신청 조건과 취소·환불 안내를 확인했어요.</label>{applyError ? <p role="alert" className="mt-3 text-sm text-rose-600">{applyError}</p> : null}{applyError ? <Button className="mt-3" variant="neutral" onClick={() => { reload(); setOpen(false); }} disabled={busy}>신청 상태 새로 확인</Button> : null}</div></div><ActionArea variant="neutral"><ActionAreaButton sx={{ borderRadius: 14, minHeight: 48 }} buttonColor="assistive" variant="alternative" disabled={busy} onClick={() => setOpen(false)}>취소</ActionAreaButton><ActionAreaButton sx={{ borderRadius: 14, minHeight: 48 }} variant="main" loading={busy} disabled={busy || !noticeAccepted || (bringBalls && !participation?.ballContribution?.available)} onClick={() => void apply()}>신청 보내기</ActionAreaButton></ActionArea></ModalContainer></Modal> : null}
  </main>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="mx-5 border-t border-[var(--tm-border-subtle)] py-5"><h2 className="text-[17px] font-bold tracking-tight">{title}</h2><div className="mt-3">{children}</div></section>; }

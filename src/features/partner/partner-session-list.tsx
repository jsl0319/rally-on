"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { BottomNavigation } from "@/components/navigation/bottom-navigation";
import { Button } from "@/components/ui/button";
import { CourtMedia } from "@/features/matches/court-media";

import { apiMessage, formatDuration, formatPartnerSchedule, formatSessionCapacity, formatStatusChangedAt, type PublicCourtSlot } from "./partner-session";

type SlotListResponse = { items: PublicCourtSlot[] };

export function PartnerSessionList() {
  const [slots, setSlots] = useState<PublicCourtSlot[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetch("/api/v1/partner-session-slots", { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "코트 매칭 시간을 불러오지 못했어요."));
      setSlots((body as SlotListResponse).items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "코트 매칭 시간을 불러오지 못했어요.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return <main className="flex min-h-svh flex-col bg-[var(--tm-bg-page)] pb-28 text-[var(--tm-text-primary)]">
    <header className="border-b border-[var(--tm-border-default)] bg-[var(--tm-bg-page)]">
      <div className="mx-auto max-w-[560px] px-5 pb-5 pt-8">
        <p className="text-sm font-semibold text-[var(--tm-action-primary)]">코트 매칭</p>
        <h1 className="mt-2 text-2xl font-bold leading-snug">코트 걱정 없이<br />함께 테니스해요</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">운영자가 준비해 공개한 시간이에요. 직접 코트를 예약하는 메뉴는 아니에요.</p>
      </div>
    </header>
    <section className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-5 pt-6">
      <div className="flex items-end justify-between gap-3"><div><h2 className="text-xl font-bold">다가오는 코트 매칭</h2><p className="mt-1 text-sm text-[var(--tm-text-secondary)]">참가 신청은 코트 매칭을 연 모집자에게 보내요.</p></div></div>
      {!slots && !error ? <div className="grid flex-1 place-items-center"><CourtRallyLoader className="max-w-[560px]" label="코트 매칭 시간을 준비하고 있어요." /></div> : null}
      {error ? <div className="mt-5 rounded-3xl bg-[var(--tm-status-error-bg)] p-5"><p className="font-semibold text-[var(--tm-status-error-text)]">불러오지 못했어요</p><p className="mt-2 text-sm leading-6 text-[var(--tm-status-error-text)]">{error}</p><Button onClick={() => void load()} size="medium" variant="secondary">다시 불러오기</Button></div> : null}
      {!error && slots?.length === 0 ? <EmptyState /> : null}
      {!error && slots && slots.length > 0 ? <div className="mt-5 grid gap-4">{slots.map((slot) => <PublicSlotCard key={slot.id} slot={slot} />)}</div> : null}
    </section>
    <BottomNavigation />
  </main>;
}

function PublicSlotCard({ slot }: { slot: PublicCourtSlot }) {
  const session = slot.session;
  const isCancelledSession = session?.status === "CANCELLED";
  const recruiting = slot.availableAction === "VIEW_SESSION" && session && !isCancelledSession ? session : null;
  const heading = recruiting
    ? recruiting.title
    : slot.availableAction === "OPEN_SESSION"
      ? "코트 매칭을 열 수 있어요"
      : isCancelledSession
        ? "코트 매칭이 취소됐어요"
        : "새 코트 매칭 연결이 중지됐어요";

  return <article className="overflow-hidden rounded-3xl border border-[var(--tm-border-default)] bg-white shadow-sm">
    <Link className="block p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tm-action-primary)]" href={`/partner-sessions/${slot.id}`}>
      <CourtMedia alt={`${slot.court.name} 코트 이미지`} className="aspect-[7/3] w-full" fallbackLabel="Rally On 기본 코트 이미지" image={slot.court.image} />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-[var(--tm-text-secondary)]">{session ? session.statusLabel : slot.statusLabel}</span>
        {recruiting?.beginnerWelcome ? <span className="rounded-full bg-[var(--tm-bg-highlight)] px-2.5 py-1 text-xs font-semibold text-[var(--tm-tennis-ball-muted)]">초보자 환영</span> : null}
      </div>
      <h3 className="mt-3 text-lg font-bold">{heading}</h3>
      {recruiting ? <p className="mt-1 text-sm text-[var(--tm-text-secondary)]">{recruiting.hostNickname}님이 같이 칠 메이트를 찾고 있어요.</p> : null}
      <p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">🗓 {formatPartnerSchedule(slot.startsAt, slot.endsAt)} · {formatDuration(slot.durationMinutes)}<br />📍 {slot.court.name} · {slot.court.courtNumber}<br />💳 {recruiting
        ? `1인 약 ${(recruiting.estimatedFeePerPersonKrw ?? 0).toLocaleString("ko-KR")}원 · 예상 ${recruiting.recruitCount + 1}명 기준`
        : `전체 ${slot.totalCourtFeeKrw.toLocaleString("ko-KR")}원 · 현장 최대 ${slot.maxParticipantCount}명`}</p>
      {recruiting ? <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-[var(--tm-bg-subtle)] px-2.5 py-1 text-xs font-bold text-[var(--tm-action-primary)]">{formatSessionCapacity(recruiting)}</span>
        {recruiting.playPurposes.map((purpose) => <span className="rounded-lg bg-[var(--tm-bg-highlight)] px-2.5 py-1 text-xs font-semibold text-[var(--tm-text-secondary)]" key={purpose.code}>{purpose.label}</span>)}
      </div> : null}
      {slot.usageNote ? <p className="mt-3 rounded-2xl bg-[var(--tm-bg-subtle)] px-3 py-2 text-sm leading-5 text-[var(--tm-text-secondary)]">{slot.usageNote}</p> : null}
      {slot.availableAction === "READ_ONLY" ? <p className="mt-3 text-xs text-[var(--tm-text-secondary)]">상태 갱신 · {formatStatusChangedAt(slot.statusChangedAt)}</p> : <p className="mt-4 text-sm font-semibold text-[var(--tm-action-primary)]">자세히 보기 →</p>}
    </Link>
    {slot.availableAction === "OPEN_SESSION" ? <div className="border-t border-[var(--tm-border-subtle)] p-3"><Button as={Link} fullWidth href={`/partner-sessions/open?slotId=${encodeURIComponent(slot.id)}`}>이 시간으로 코트 매칭 열기</Button></div> : null}
    {slot.availableAction === "VIEW_SESSION" && session ? <div className="border-t border-[var(--tm-border-subtle)] p-3"><Link className="flex min-h-12 items-center justify-center rounded-2xl bg-[var(--tm-bg-subtle)] px-4 text-sm font-semibold text-[var(--tm-action-primary)]" href={`/matches/${session.matchId}`}>{isCancelledSession ? "코트 매칭 취소 안내 보기" : "코트 매칭 자세히 보기"}</Link></div> : null}
  </article>;
}

function EmptyState() {
  return <div className="mt-5 rounded-3xl bg-[var(--tm-bg-subtle)] p-6"><p className="font-bold">지금 참여할 수 있는 코트 매칭이 없어요.</p><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">다른 지역이나 날짜의 매칭도 살펴보세요.</p><Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-[var(--tm-action-primary)] underline" href="/">일반 매칭 둘러보기</Link></div>;
}

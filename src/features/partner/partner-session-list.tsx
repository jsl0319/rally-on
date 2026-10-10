"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarBlank, MapPin, Users } from "@phosphor-icons/react";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { BottomNavigation } from "@/components/navigation/bottom-navigation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { CourtMedia } from "@/features/matches/court-media";
import { MatchBadge, matchSchedule } from "@/features/matches/match-presentation";
import { apiMessage, type PublicCourtSlot } from "./partner-session";

export function PartnerSessionList() {
  const [slots, setSlots] = useState<PublicCourtSlot[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetch("/api/v1/partner-session-slots", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "코트 매칭을 불러오지 못했어요."));
      setSlots(body.items);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "코트 매칭을 불러오지 못했어요."); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  return <main className="min-h-app bg-[var(--tm-bg-page)] pb-28 text-[var(--tm-text-primary)]">
    <div className="mx-auto max-w-[560px] px-5 pt-8">
      <PageHeader title="코트 매칭" description="운영자가 준비한 코트에서 함께 테니스해요." actions={<Link className="rally-text-action rounded-full border border-[var(--tm-border-default)] bg-white px-3" href="/activity/sent">내 신청 내역 →</Link>} />
      {error ? <div role="alert" className="mt-5 rounded-2xl bg-white p-5"><p className="text-sm text-red-600">{error}</p><Button className="mt-3" variant="secondary" onClick={() => void load()}>다시 불러오기</Button></div> : null}
      {!slots && !error ? <CourtRallyLoader className="mt-10" label="코트 매칭을 준비하고 있어요." /> : null}
      {slots?.length === 0 ? <div className="rally-card mt-6 p-6"><p className="font-bold">공개된 코트 매칭이 없어요.</p><p className="mt-2 text-sm text-[var(--tm-text-secondary)]">새 일정이 열리면 여기서 확인할 수 있어요.</p><Link className="rally-text-action mt-4" href="/">일반 매칭 둘러보기 →</Link></div> : null}
      <div className="mt-6 grid gap-4">{slots?.map((slot) => <PublicSlotCard key={slot.id} slot={slot} />)}</div>
    </div><BottomNavigation />
  </main>;
}

export function PublicSlotCard({ slot }: { slot: PublicCourtSlot }) {
  const date = matchSchedule(slot.startsAt, slot.endsAt);
  const available = slot.availableAction === "APPLY" && (slot.session?.remainingSpots ?? 0) > 0;
  return <Link href={`/partner-sessions/${slot.id}`} className="rally-card block p-4 transition-colors hover:border-[var(--tm-border-strong)]">
    <p className="mb-3 flex items-start gap-1.5 text-xs font-semibold leading-5 text-[var(--tm-action-primary)]"><CalendarBlank size={14} className="mt-0.5 shrink-0" aria-hidden /><span className="flex flex-wrap gap-x-2 tabular-nums"><span>{date.day}</span><span>{date.time}</span></span></p>
    <div className="flex gap-3.5"><div className="min-w-0 flex-1">
      <h2 className="line-clamp-2 text-[17px] font-bold leading-6 tracking-tight">{slot.court.name}</h2>
      <p className="mt-1.5 flex items-start gap-1 text-xs leading-5 text-[var(--tm-text-secondary)]"><MapPin size={13} className="mt-0.5 shrink-0" aria-hidden /><span>{slot.court.region.name} · {slot.court.courtNumber}</span></p>
      <div className="mt-3 flex flex-wrap gap-1"><MatchBadge tone={available ? "green" : "neutral"}>{slot.session?.statusLabel ?? slot.statusLabel}</MatchBadge>{slot.gameType ? <MatchBadge>{slot.gameType.label}</MatchBadge> : null}</div>
    </div><CourtMedia alt={`${slot.court.name} 코트 사진`} className="h-[90px] w-[86px] shrink-0" fallbackLabel="사진 준비 중" image={slot.court.image} /></div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--tm-border-subtle)] pt-3"><span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${available ? "text-[var(--tm-action-primary)]" : "text-[var(--tm-text-secondary)]"}`}><Users size={15} weight="bold" aria-hidden />{available ? `${slot.session!.remainingSpots}명 더 함께해요` : slot.session?.statusLabel ?? slot.statusLabel}</span><span className="text-[15px] font-bold tabular-nums"><span className="mr-1 text-[11px] font-normal text-[var(--tm-text-secondary)]">1인</span>{slot.guestFeeKrw.toLocaleString("ko-KR")}원</span></div>
    <p className="mt-2 text-xs leading-5 text-[var(--tm-text-secondary)]">{slot.approvalMode === "AUTO" ? "자동 승인" : "운영자 승인"} · 입금 확인 후 참가 확정</p>
  </Link>;
}

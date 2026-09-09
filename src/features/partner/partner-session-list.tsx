"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarBlank, MapPin, Users } from "@phosphor-icons/react";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { BottomNavigation } from "@/components/navigation/bottom-navigation";
import { Button } from "@/components/ui/button";
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
  return <main className="min-h-svh bg-slate-50 pb-28 text-[var(--tm-text-primary)]">
    <div className="mx-auto max-w-[560px] px-5 pt-8">
      <header><h1 className="text-2xl font-bold tracking-tight">코트 매칭</h1><p className="mt-2 text-sm leading-6 text-slate-500">운영자가 준비한 코트에서 함께 테니스해요.</p></header>
      <div className="mt-5 flex justify-end"><Link className="text-sm font-semibold text-blue-600" href="/activity/sent">내 신청 내역 →</Link></div>
      {error ? <div role="alert" className="mt-5 rounded-2xl bg-white p-5"><p className="text-sm text-red-600">{error}</p><Button className="mt-3" variant="secondary" onClick={() => void load()}>다시 불러오기</Button></div> : null}
      {!slots && !error ? <CourtRallyLoader className="mt-10" label="코트 매칭을 준비하고 있어요." /> : null}
      {slots?.length === 0 ? <div className="mt-6 rounded-3xl bg-white p-6"><p className="font-bold">공개된 코트 매칭이 없어요.</p><p className="mt-2 text-sm text-slate-500">새 일정이 열리면 여기서 확인할 수 있어요.</p><Link className="mt-4 inline-block text-sm font-semibold text-blue-600" href="/">일반 매칭 둘러보기 →</Link></div> : null}
      <div className="mt-4 grid gap-4">{slots?.map((slot) => <PublicSlotCard key={slot.id} slot={slot} />)}</div>
    </div><BottomNavigation />
  </main>;
}

function PublicSlotCard({ slot }: { slot: PublicCourtSlot }) {
  const date = matchSchedule(slot.startsAt, slot.endsAt);
  const available = slot.availableAction === "APPLY" && (slot.session?.remainingSpots ?? 0) > 0;
  return <Link href={`/partner-sessions/${slot.id}`} className="block overflow-hidden rounded-3xl bg-white shadow-sm outline-offset-4 focus-visible:outline-2 focus-visible:outline-blue-600">
    <div className="flex gap-3 p-3"><CourtMedia alt={`${slot.court.name} 코트 사진`} className="w-[94px] shrink-0 self-stretch sm:w-[120px]" fallbackLabel="코트 사진 준비 중" image={slot.court.image} /><div className="min-w-0 flex-1 py-1">
      <div className="flex flex-wrap gap-1.5"><MatchBadge tone={available ? "blue" : "neutral"}>{slot.session?.statusLabel ?? slot.statusLabel}</MatchBadge>{slot.gameType ? <MatchBadge>{slot.gameType.label}</MatchBadge> : null}</div>
      <h2 className="mt-2 break-words text-base font-bold leading-6 tracking-tight">{slot.court.name}</h2><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin size={14} aria-hidden />{slot.court.region.name} · {slot.court.courtNumber}</p>
      <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-slate-600"><CalendarBlank size={15} className="mt-0.5 shrink-0" aria-hidden /><span className="flex flex-wrap gap-x-1.5 tabular-nums"><span>{date.day}</span><span>{date.time}</span></span></p>
    </div></div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3"><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700"><Users size={16} aria-hidden />{available ? `남은 자리 ${slot.session!.remainingSpots}명` : "상태 확인"}<span className="font-normal text-slate-400">· {slot.approvalMode === "AUTO" ? "자동 승인" : "운영자 승인"}</span></span><span className="text-sm font-bold tabular-nums">1인 {slot.guestFeeKrw.toLocaleString("ko-KR")}원</span></div>
  </Link>;
}

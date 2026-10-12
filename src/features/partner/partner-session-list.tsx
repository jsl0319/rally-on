"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarBlank, MapPin, Users } from "@phosphor-icons/react";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { BottomNavigation } from "@/components/navigation/bottom-navigation";
import { Button } from "@/components/ui/button";
import { StickyPageHeader } from "@/components/navigation/sticky-page-header";
import { PullToRefresh } from "@/components/feedback/pull-to-refresh";
import { matchCardSchedule } from "@/matches/schedule";
import { CourtMedia } from "@/features/matches/court-media";
import { displayPartnerCourtImage, MatchBadge } from "@/features/matches/match-presentation";
import { DiscoveryFilters } from "@/features/matches/match-discovery-filters";
import { defaultCourtFilters, courtSortOptions } from "@/matches/court-discovery";
import { apiMessage, type PublicCourtSlot } from "./partner-session";

export function PartnerSessionList() {
  const [slots, setSlots] = useState<PublicCourtSlot[] | null>(null);
  const [filters, setFilters] = useState(defaultCourtFilters);
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const id = ++sequence.current;
    setLoading(true);
    try {
      setError("");
      const params = new URLSearchParams({ sort: filters.sort });
      if (filters.date) params.set("date", filters.date);
      if (filters.gameType) params.set("gameType", filters.gameType);
      const response = await fetch(`/api/v1/partner-session-slots?${params}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "코트 매칭을 불러오지 못했어요."));
      if (id === sequence.current) setSlots(body.items);
    } catch (caught) { if (id === sequence.current) setError(caught instanceof Error ? caught.message : "코트 매칭을 불러오지 못했어요."); }
    finally { if (id === sequence.current) setLoading(false); }
  }, [filters]);
  const invalidate = useCallback(() => { ++sequence.current; }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => { window.clearTimeout(timer); invalidate(); }; }, [load, invalidate]);
  return <PullToRefresh onRefresh={load}><main className="min-h-app bg-[var(--tm-bg-page)] pb-28 text-[var(--tm-text-primary)]">
    <StickyPageHeader title="코트 매칭" actions={<Link className="rally-text-action rounded-full border border-[var(--tm-border-default)] bg-white px-3" href="/activity/sent">내 신청 내역 →</Link>} />
    <div className="mx-auto max-w-[560px] px-5">
      <p className="mt-1 text-sm text-[var(--tm-text-secondary)]">운영자가 준비한 코트에서 함께 테니스해요.</p>
      <div className="mt-2"><DiscoveryFilters value={filters} onChange={setFilters} sortOptions={courtSortOptions} /></div>
      {error ? <div role="alert" className="mt-5 rounded-2xl bg-white p-5"><p className="text-sm text-red-600">{error}</p><Button className="mt-3" variant="secondary" onClick={() => void load()}>다시 불러오기</Button></div> : null}
      {loading && !error ? <CourtRallyLoader className="mt-10" label="코트 매칭을 준비하고 있어요." /> : null}
      {!loading && !error && slots?.length === 0 ? <div className="rally-card mt-6 p-6"><p className="font-bold">{filters.date || filters.gameType ? "조건에 맞는 코트 매칭이 없어요." : "공개된 코트 매칭이 없어요."}</p><p className="mt-2 text-sm text-[var(--tm-text-secondary)]">새 일정이 열리면 여기서 확인할 수 있어요.</p>{filters.date || filters.gameType ? <Button className="mt-3" variant="secondary" onClick={() => setFilters(current => ({ ...current, date: null, gameType: null }))}>필터 초기화</Button> : null}<Link className="rally-text-action mt-4" href="/">일반 매칭 둘러보기 →</Link></div> : null}
      <div className="mt-2 grid gap-2">{!loading && !error && slots?.map((slot) => <PublicSlotCard key={slot.id} slot={slot} />)}</div>
    </div><BottomNavigation />
  </main></PullToRefresh>;
}

export function PublicSlotCard({ slot }: { slot: PublicCourtSlot }) {
  const image = displayPartnerCourtImage(slot.court);
  const date = matchCardSchedule(slot.startsAt, slot.endsAt);
  const available = slot.availableAction === "APPLY" && (slot.session?.remainingSpots ?? 0) > 0;
  return <Link href={`/partner-sessions/${slot.id}`} className="rally-card rally-discovery-card transition-colors hover:border-[var(--tm-border-strong)]">
    <div className="min-w-0 px-3 py-2">
      <h2 className="line-clamp-2 text-[16px] font-bold leading-5 tracking-tight">{slot.court.name}</h2>
      <p className="mt-1 flex items-start gap-1 text-xs font-semibold leading-[18px] text-[var(--tm-action-primary)]"><CalendarBlank size={13} className="mt-0.5 shrink-0" aria-hidden /><span className="tabular-nums">{date}</span></p>
      <p className="flex items-center gap-1 text-xs leading-4 text-[var(--tm-text-secondary)]"><MapPin size={13} className="shrink-0" aria-hidden /><span className="truncate">{slot.court.region.name} · {slot.court.courtNumber}</span></p>
      <div className="rally-card-badges mt-1 flex flex-wrap gap-1">{slot.gameType ? <MatchBadge>{slot.gameType.label}</MatchBadge> : null}<MatchBadge tone={available ? "green" : "neutral"}>{slot.session?.statusLabel ?? slot.statusLabel}</MatchBadge></div>
    </div>
    <CourtMedia alt={image.sourceLabel === "견본 이미지" ? "실제 장소와 다른 테니스장 견본 사진" : `${slot.court.name} 코트 사진`} className="rally-card-photo" sizes="(max-width: 560px) 26vw, 128px" fallbackLabel="사진 준비 중" image={image} />
    <div className="rally-card-footer px-3 py-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1"><span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${available ? "text-[var(--tm-action-primary)]" : "text-[var(--tm-text-secondary)]"}`}><Users size={13} weight="bold" aria-hidden />{available ? `${slot.session!.remainingSpots}명 남음` : slot.session?.statusLabel ?? slot.statusLabel}</span><span className="text-sm font-bold tabular-nums"><span className="mr-1 text-[10px] font-normal text-[var(--tm-text-secondary)]">1인</span>{slot.guestFeeKrw.toLocaleString("ko-KR")}원</span></div>
      {slot.ballDiscountEnabled ? <p className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-[11px] leading-5">
        {available && slot.ballContribution?.available !== false ? <><span className="text-[var(--tm-text-secondary)]">공 준비 · 선착순 1명</span><strong className="font-semibold text-[var(--tm-action-primary)]">5,000원 할인</strong></> : <span className="text-[var(--tm-text-secondary)]">{available ? "공 준비 모집 완료" : "공 준비 할인 마감"}</span>}
      </p> : null}
    </div>
  </Link>;
}

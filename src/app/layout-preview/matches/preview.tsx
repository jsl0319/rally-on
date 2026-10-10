"use client";

import Link from "next/link";
import { useState } from "react";
import { BottomNavigation } from "@/components/navigation/bottom-navigation";
import { MatchCard, type MatchCardData } from "@/features/matches/m3-match-card";
import { DEFAULT_MATCH_FILTERS, MatchDiscoveryFilters, MatchDiscoveryHeader } from "@/features/matches/match-discovery-filters";

const examples: MatchCardData[] = [
  { id: "preview-1", title: "서울숲 테니스장", gameType: { code: "MIXED_DOUBLES", label: "혼복" }, statusLabel: "모집 중", startsAt: "2026-10-11T10:00:00+09:00", endsAt: "2026-10-11T12:00:00+09:00", court: { source: "EXTERNAL_RESERVED", sourceLabel: "견본 이미지", name: "서울숲 테니스장", address: "서울 성동구 뚝섬로 273", image: { url: "/images/court-samples/indoor.jpg", sourceLabel: "견본 이미지", fallback: "TENNIS_COURT_ILLUSTRATION" } }, playPurposes: [{ code: "RALLY_PRACTICE", label: "랠리" }, { code: "GAME_INTRO", label: "게임 입문" }], beginnerWelcome: true, remainingSpots: 2, estimatedFeePerPersonKrw: 15000, recommendationReasons: [], isHost: false },
  { id: "preview-2", title: "이지테니스 둔촌점", gameType: { code: "MENS_DOUBLES", label: "남복" }, statusLabel: "모집 중", startsAt: "2026-10-12T18:00:00+09:00", endsAt: "2026-10-12T20:00:00+09:00", court: { source: "EXTERNAL_RESERVED", sourceLabel: "견본 이미지", name: "이지테니스 둔촌점", address: "경기 하남시 감북동 368-40", image: { url: "/images/court-samples/indoor.jpg", sourceLabel: "견본 이미지", fallback: "TENNIS_COURT_ILLUSTRATION" } }, playPurposes: [{ code: "GAME", label: "게임" }], beginnerWelcome: false, remainingSpots: 1, estimatedFeePerPersonKrw: 20000, recommendationReasons: [], isHost: false },
];

/** Visual fixture only. Production filters use the authenticated list API. */
export function MatchFiltersPreview() {
  const [filters, setFilters] = useState(DEFAULT_MATCH_FILTERS);
  const visible = examples.filter(match => (!filters.gameType || match.gameType?.code === filters.gameType) && (!filters.date || match.startsAt.startsWith(filters.date)));
  if (filters.sort === "newest") visible.reverse();
  return <main className="min-h-app bg-[var(--tm-bg-page)] pb-32">
    <MatchDiscoveryHeader />
    <section className="mx-auto max-w-[560px] px-5 pt-3">
      <Link href="/partner-sessions" className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-[var(--tm-bg-subtle)] px-4 py-3 text-sm text-[var(--tm-action-primary)]"><span>코트 예약이 어렵다면 <strong>코트 매칭</strong></span><span aria-hidden>↗</span></Link>
      <div className="mt-4"><MatchDiscoveryFilters value={filters} onChange={setFilters} /></div>
      <p className="my-3 text-[11px] text-[var(--tm-text-secondary)]">디자인 확인용 예시 · 실제 신청·저장 없음</p>
      <div className="grid gap-4" onClickCapture={event => { if ((event.target as HTMLElement).closest("a")) event.preventDefault(); }}>
        {visible.map(match => <MatchCard key={match.id} match={match} />)}
        {!visible.length ? <div className="rally-card p-5"><p className="text-sm">조건에 맞는 예시 매칭이 없어요.</p><button type="button" className="rally-text-action mt-2" onClick={() => setFilters(current => ({ ...current, date: null, gameType: null }))}>필터 초기화</button></div> : null}
      </div>
    </section>
    <BottomNavigation />
  </main>;
}

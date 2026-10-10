"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { BottomNavigation } from "@/components/navigation/bottom-navigation";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { Button } from "@/components/ui/button";
import { getSafeReturnTo } from "@/navigation/return-to";
import { EntrySelection } from "@/features/profile/entry-selection";
import { M2OnboardingFlow } from "@/features/profile/m2-onboarding-flow";

import { DEFAULT_MATCH_FILTERS, MatchDiscoveryFilters, MatchDiscoveryHeader, type MatchFilters } from "./match-discovery-filters";

import { MatchCard, type MatchCardData } from "./m3-match-card";

type MeResponse = {
  nickname: string;
  onboardingCompleted: boolean;
  tennisProfile: null | { rallyLevel: string };
};

type MatchListResponse = { items: MatchCardData[] };
type Screen = "loading" | "entry" | "onboarding" | "home" | "error";
type ListStatus = "loading" | "ready" | "error";
function getErrorMessage(body: unknown) {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error = body.error;
    if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") return error.message;
  }
  return "매칭을 불러오지 못했어요. 다시 시도해 주세요.";
}

async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(getErrorMessage(body));
  return body as T;
}

export function RallyOnHome({ returnTo = "/" }: { returnTo?: string }) {
  const safeReturnTo = getSafeReturnTo(returnTo);
  const [screen, setScreen] = useState<Screen>("loading");
  const [error, setError] = useState("");

  const [matches, setMatches] = useState<MatchCardData[]>([]);
  const [listStatus, setListStatus] = useState<ListStatus>("loading");
  const [listError, setListError] = useState("");
  const [filters, setFilters] = useState<MatchFilters>(DEFAULT_MATCH_FILTERS);
  const { gameType, date, sort } = filters;
  const latestListRequest = useRef(0);

  const loadMe = useCallback(async () => {
    try {
      const meResponse = await fetch("/api/v1/me", { cache: "no-store" });
      if (meResponse.status === 401) {
        setScreen("entry");
        return;
      }
      const meBody: unknown = await meResponse.json();
      if (!meResponse.ok) throw new Error(getErrorMessage(meBody));
      const current = meBody as MeResponse;
      if (!current.onboardingCompleted) {
        setScreen("onboarding");
        return;
      }
      setScreen("home");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "서비스를 불러오지 못했어요.");
      setScreen("error");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadMe(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMe]);

  const loadMatches = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++latestListRequest.current;
    setListStatus("loading");
    try {
      const params = new URLSearchParams({ limit: "30", sort });
      if (gameType) params.set("gameType", gameType);
      if (date) params.set("date", date);
      const response = await requestJson<MatchListResponse>(`/api/v1/matches?${params.toString()}`, signal);
      if (signal?.aborted || requestId !== latestListRequest.current) return;
      setMatches(response.items);
      setListStatus("ready");
    } catch (caught) {
      if (signal?.aborted || requestId !== latestListRequest.current) return;
      setListError(caught instanceof Error ? caught.message : "매칭을 불러오지 못했어요.");
      setListStatus("error");
    }
  }, [gameType, sort, date]);

  useEffect(() => {
    if (screen !== "home") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void loadMatches(controller.signal); }, 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [screen, loadMatches]);

  if (screen === "loading") return <HomeLoading />;
  if (screen === "entry") return <EntrySelection returnTo={safeReturnTo} />;
  // 온보딩을 마치면 M2는 returnTo로 router.replace를 한다. 그런데 이 화면의 주소가
  // 이미 "/"라 같은 주소로의 replace는 아무 일도 하지 않고, 완성 화면에 그대로 머문다.
  // 돌아갈 곳이 홈일 때는 이 화면이 직접 상태를 홈으로 바꾼다.
  if (screen === "onboarding") return <M2OnboardingFlow onCompleted={safeReturnTo === "/" ? () => { setScreen("loading"); void loadMe(); } : undefined} returnTo={safeReturnTo} />;
  if (screen === "error") return <HomeStateFrame><div><p className="text-lg font-bold">불러오지 못했어요</p><p className="mt-2 text-sm text-[var(--tm-text-secondary)]">{error}</p><Button className="mt-6" onClick={() => void loadMe()}>다시 불러오기</Button></div></HomeStateFrame>;

  const hasFilter = gameType !== null || date !== null;

  return (
    <main className="min-h-app bg-[var(--tm-bg-page)] pb-[calc(160px+env(safe-area-inset-bottom))] text-[var(--tm-text-primary)]">
      <MatchDiscoveryHeader />
      <section className="mx-auto max-w-[560px] px-5 pt-3">
        <Link className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-[var(--tm-bg-subtle)] px-4 py-3 text-sm text-[var(--tm-action-primary)]" href="/partner-sessions"><span>코트 예약이 어렵다면 <strong>코트 매칭</strong></span><span aria-hidden>↗</span></Link>
        <div className="mt-4"><MatchDiscoveryFilters value={filters} onChange={setFilters} /></div>

        {listStatus === "loading" ? (
          <CourtRallyLoader className="mt-4" label="매칭을 불러오고 있어요." />
        ) : listStatus === "error" ? (
          <div className="mt-4 rounded-[20px] bg-[var(--tm-bg-subtle)] p-6"><p className="font-bold">매칭을 불러오지 못했어요.</p><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">{listError}</p><Button className="mt-4" onClick={() => void loadMatches()} variant="neutral">다시 시도</Button></div>
        ) : matches.length > 0 ? (
          <div className="mt-4 grid gap-4">{matches.map((match) => <MatchCard key={match.id} match={match} />)}</div>
        ) : hasFilter ? (
          <EmptyFilteredState onReset={() => setFilters(current => ({ ...current, gameType: null, date: null }))} />
        ) : (
          <EmptyMatchState />
        )}
      </section>

      <Link aria-label="매칭 만들기" className="fixed bottom-[calc(88px+env(safe-area-inset-bottom))] right-[max(20px,calc((100vw-520px)/2))] z-30 inline-flex min-h-[52px] items-center gap-2 rounded-full bg-[var(--tm-action-primary)] px-5 text-sm font-semibold text-white shadow-[0_6px_20px_#174c3c26] transition-transform active:scale-95" href="/matches/new">
        <span aria-hidden="true" className="text-lg leading-none text-[var(--tm-tennis-ball)]">+</span>
        매칭 만들기
      </Link>
      <BottomNavigation />

    </main>
  );
}

function EmptyFilteredState({ onReset }: { onReset: () => void }) {
  return <div className="mt-4 rounded-[20px] bg-[var(--tm-bg-subtle)] p-5"><p className="font-bold">조건에 맞는 매칭이 아직 없어요.</p><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">필터를 초기화하면 더 많은 매칭을 볼 수 있어요.</p><button className="mt-4 text-sm font-semibold text-[var(--tm-action-primary)] underline" onClick={onReset} type="button">필터 초기화</button></div>;
}

/**
 * 볼 게 없을 때가 초기 사용자가 가장 자주 만나는 화면이다.
 *
 * "새로운 매칭이 등록되면 여기에서 확인할 수 있어요"는 사용자가 다시 들어와야만
 * 성립하는 약속이라, 지금 할 수 있는 일을 주지 못한다. 대신 코트 매칭에 실제로
 * 몇 개가 열려 있는지 세어서 보여 주고 그쪽으로 보낸다. 거기도 비어 있으면
 * 매칭 만들기를 주 행동으로 올린다.
 */
function EmptyMatchState() {
  const [openCourtMatches, setOpenCourtMatches] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch("/api/v1/partner-session-slots/available", { cache: "no-store" });
          if (!response.ok) return;
          const body = await response.json() as { items?: unknown[] };
          if (!cancelled) setOpenCourtMatches(Array.isArray(body.items) ? body.items.length : 0);
        } catch {
          // 현황을 못 세면 아래 기본 안내로 둔다. 빈 화면을 막을 이유는 없다.
        }
      })();
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);

  if (openCourtMatches !== null && openCourtMatches > 0) {
    return <div className="mt-4 rounded-[20px] bg-[var(--tm-bg-subtle)] p-6">
      <p className="font-bold">직접 예약한 코트로 열린 매칭은 아직 없어요.</p>
      <p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">대신 코트 매칭에 <strong className="font-semibold text-[var(--tm-text-primary)]">{openCourtMatches}개</strong>가 열려 있어요. 코트는 운영자가 준비해 두어서 장소 걱정 없이 참가할 수 있어요.</p>
      <Button as={Link} className="mt-4" fullWidth href="/partner-sessions" size="medium">코트 매칭 보기</Button>
      <Link className="mt-3 inline-block text-sm font-semibold text-[var(--tm-action-primary)] underline" href="/matches/new">직접 매칭 만들기</Link>
    </div>;
  }

  return <div className="mt-4 rounded-[20px] bg-[var(--tm-bg-subtle)] p-6">
    <p className="font-bold">아직 열린 매칭이 없어요.</p>
    <p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">예약한 코트에서 함께 칠 메이트를 모집해 보세요. 코트가 필요하면 코트 매칭을 이용해 주세요.</p>
    <Button as={Link} className="mt-4" fullWidth href="/matches/new" size="medium">매칭 만들기</Button>
  </div>;
}

function HomeLoading() {
  return <HomeStateFrame><CourtRallyLoader className="max-w-[560px]" label="매칭을 준비하고 있어요." /></HomeStateFrame>;
}

function HomeStateFrame({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-app flex-col bg-[var(--tm-bg-page)] pb-32 text-[var(--tm-text-primary)]">
    <header className="bg-[var(--tm-bg-page)]">
      <div className="mx-auto max-w-[560px] px-5 py-4"><h1 className="rally-page-title">매칭</h1></div>
    </header>
    <section className="mx-auto flex w-full max-w-[560px] flex-1 items-center justify-center px-5 text-center">{children}</section>
    <BottomNavigation />
  </main>;
}

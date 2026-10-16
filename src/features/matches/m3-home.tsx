"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PullToRefresh } from "@/components/feedback/pull-to-refresh";
import { BottomNavigation } from "@/components/navigation/bottom-navigation";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { Button } from "@/components/ui/button";
import { getSafeReturnTo } from "@/navigation/return-to";
import { EntrySelection } from "@/features/profile/entry-selection";
import { M2OnboardingFlow } from "@/features/profile/m2-onboarding-flow";

import { MatchDiscoveryFilters, MatchDiscoveryHeader } from "./match-discovery-filters";
import { useDiscoveryParams } from "@/navigation/use-discovery-params";

import { MatchCreateButton } from "./match-create-button";
import { MatchCard, type MatchCardData } from "./m3-match-card";

type MatchListResponse = { items: MatchCardData[] };
type Screen = "entry" | "onboarding" | "home";
type ListStatus = "loading" | "ready" | "error";
const matchSorts = ["recommended", "soonest", "newest"] as const;
function getApiError(body: unknown) {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error = body.error;
    if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
      return { message: error.message, code: "code" in error && typeof error.code === "string" ? error.code : undefined };
    }
  }
  return { message: "매칭을 불러오지 못했어요. 다시 시도해 주세요.", code: undefined };
}

class MatchListError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}

async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = getApiError(body);
    throw new MatchListError(error.message, response.status, error.code);
  }
  return body as T;
}

export function RallyOnHome({ initialScreen, returnTo = "/" }: { initialScreen: Screen; returnTo?: string }) {
  const router = useRouter();
  const safeReturnTo = getSafeReturnTo(returnTo);
  // The server already checked the account. The list API rechecks current access.
  const [screen, setScreen] = useState<Screen>(initialScreen);

  const [matches, setMatches] = useState<MatchCardData[]>([]);
  const [listStatus, setListStatus] = useState<ListStatus>("loading");
  const [listError, setListError] = useState("");
  const [filters, setFilters] = useDiscoveryParams(matchSorts, "recommended");
  const { gameType, date, sort, availableOnly } = filters;
  const latestListRequest = useRef(0);

  const loadMatches = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++latestListRequest.current;
    setListError("");
    try {
      const params = new URLSearchParams({ limit: "30", sort });
      if (gameType) params.set("gameType", gameType);
      if (date) params.set("date", date);
      if (availableOnly) params.set("availableOnly", "true");
      const response = await requestJson<MatchListResponse>(`/api/v1/matches?${params.toString()}`, signal);
      if (signal?.aborted || requestId !== latestListRequest.current) return;
      setMatches(response.items);
      setListStatus("ready");
    } catch (caught) {
      if (signal?.aborted || requestId !== latestListRequest.current) return;
      if (caught instanceof MatchListError) {
        if (caught.status === 401) { setMatches([]); setScreen("entry"); return; }
        if (caught.code === "ONBOARDING_REQUIRED") { setMatches([]); setScreen("onboarding"); return; }
        if (caught.status === 403 && caught.code === "FORBIDDEN") { setMatches([]); router.replace("/account/transactions"); return; }
      }
      setListError(caught instanceof Error ? caught.message : "매칭을 불러오지 못했어요.");
      setListStatus("error");
    }
  }, [gameType, sort, date, availableOnly, router]);

  useEffect(() => {
    if (screen !== "home") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => { setListStatus("loading"); void loadMatches(controller.signal); }, 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [screen, loadMatches]);

  if (screen === "entry") return <EntrySelection returnTo={safeReturnTo} />;
  // 온보딩을 마치면 M2는 returnTo로 router.replace를 한다. 그런데 이 화면의 주소가
  // 이미 "/"라 같은 주소로의 replace는 아무 일도 하지 않고, 완성 화면에 그대로 머문다.
  // 돌아갈 곳이 홈일 때는 이 화면이 직접 상태를 홈으로 바꾼다.
  if (screen === "onboarding") return <M2OnboardingFlow onCompleted={safeReturnTo === "/" ? () => setScreen("home") : undefined} returnTo={safeReturnTo} />;

  const hasFilter = gameType !== null || date !== null || availableOnly;

  return (
    <PullToRefresh onRefresh={() => loadMatches()}><main className="min-h-app bg-[var(--tm-bg-page)] pb-[calc(160px+env(safe-area-inset-bottom))] text-[var(--tm-text-primary)]">
      <MatchDiscoveryHeader />
      <section className="mx-auto max-w-[560px] px-5 pt-1">
        <Link className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-[var(--tm-bg-subtle)] px-3 py-2 text-[13px] text-[var(--tm-action-primary)]" href="/partner-sessions"><span>코트 예약이 어렵다면 <strong>코트 매칭</strong></span><span aria-hidden>↗</span></Link>
        <div className="mt-1"><MatchDiscoveryFilters value={filters} onChange={setFilters} /></div>

        {listStatus === "loading" ? (
          <CourtRallyLoader className="mt-4" label="매칭을 불러오고 있어요." />
        ) : listStatus === "error" ? (
          <div className="mt-4 rounded-[20px] bg-[var(--tm-bg-subtle)] p-6"><p className="font-bold">매칭을 불러오지 못했어요.</p><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">{listError}</p><Button className="mt-4" onClick={() => void loadMatches()} variant="neutral">다시 시도</Button></div>
        ) : matches.length > 0 ? (
          <div className="mt-1 grid gap-2">{matches.map((match) => <MatchCard key={match.id} match={match} />)}</div>
        ) : hasFilter ? (
          <EmptyFilteredState onReset={() => setFilters(current => ({ ...current, gameType: null, date: null, availableOnly: false }))} />
        ) : (
          <EmptyMatchState />
        )}
      </section>

      <MatchCreateButton />
      <BottomNavigation />

    </main></PullToRefresh>
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

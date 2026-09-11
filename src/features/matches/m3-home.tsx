"use client";

import { CalendarBlank, CaretDown, CheckCircle, Funnel } from "@phosphor-icons/react";
import { DateCalendar, Modal, ModalClose, ModalContainer, ModalContent, ModalContentItem, ModalNavigation } from "@wanteddev/wds";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";

import { BottomNavigation } from "@/components/navigation/bottom-navigation";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { Button } from "@/components/ui/button";
import { getSafeReturnTo } from "@/navigation/return-to";
import { EntrySelection } from "@/features/profile/entry-selection";
import { M2OnboardingFlow } from "@/features/profile/m2-onboarding-flow";

import { activeGameTypes, gameTypeLabels, type ActiveGameType } from "@/matches/game-type";

import { MatchCard, type MatchCardData } from "./m3-match-card";

type MeResponse = {
  nickname: string;
  onboardingCompleted: boolean;
  tennisProfile: null | { rallyLevel: string };
};

type MatchListResponse = { items: MatchCardData[] };
type Screen = "loading" | "entry" | "onboarding" | "home" | "error";
type ListStatus = "loading" | "ready" | "error";
type MatchSort = "recommended" | "soonest" | "newest";
const GAME_TYPE_OPTIONS = activeGameTypes.map((value) => ({ value, label: gameTypeLabels[value] }));

const SORT_OPTIONS: { value: MatchSort; label: string }[] = [
  { value: "recommended", label: "추천순" },
  { value: "soonest", label: "매칭 임박순" },
  { value: "newest", label: "매칭 생성순" },
];

function gameTypeLabel(value: ActiveGameType | null) {
  return GAME_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? "게임 유형";
}

function sortLabel(value: MatchSort) {
  return SORT_OPTIONS.find((option) => option.value === value)?.label ?? "정렬";
}

function dateLabel(value: string | null) {
  if (!value) return "날짜";
  const [, month, day] = value.split("-").map(Number);
  return `${month}월 ${day}일`;
}

function getTodayKstDate() {
  const values = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => values.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function toCalendarDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function fromCalendarDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function getErrorMessage(body: unknown) {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error = body.error;
    if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") return error.message;
  }
  return "매칭을 불러오지 못했어요. 다시 시도해 주세요.";
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(getErrorMessage(body));
  return body as T;
}

export function RallyOnHome({ returnTo = "/" }: { returnTo?: string }) {
  const safeReturnTo = getSafeReturnTo(returnTo);
  const [screen, setScreen] = useState<Screen>("loading");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState("");

  const [matches, setMatches] = useState<MatchCardData[]>([]);
  const [listStatus, setListStatus] = useState<ListStatus>("loading");
  const [listError, setListError] = useState("");
  const [gameType, setGameType] = useState<ActiveGameType | null>(null);
  const [sort, setSort] = useState<MatchSort>("recommended");
  const [date, setDate] = useState<string | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isDateOpen, setIsDateOpen] = useState(false);

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
      setMe(current);
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

  const loadMatches = useCallback(async () => {
    setListStatus("loading");
    try {
      const params = new URLSearchParams({ limit: "30", sort });
      if (gameType) params.set("gameType", gameType);
      if (date) params.set("date", date);
      const response = await requestJson<MatchListResponse>(`/api/v1/matches?${params.toString()}`);
      setMatches(response.items);
      setListStatus("ready");
    } catch (caught) {
      setListError(caught instanceof Error ? caught.message : "매칭을 불러오지 못했어요.");
      setListStatus("error");
    }
  }, [gameType, sort, date]);

  useEffect(() => {
    if (screen !== "home") return;
    const timer = window.setTimeout(() => { void loadMatches(); }, 0);
    return () => window.clearTimeout(timer);
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
    <main className="min-h-svh bg-[var(--tm-bg-page)] pb-28 text-[var(--tm-text-primary)]">
      <header className="sticky top-0 z-20 border-b border-[var(--tm-border-default)] bg-[var(--tm-bg-page)] backdrop-blur">
        <div className="mx-auto max-w-[560px] px-5 pb-4 pt-8">
          <p className="text-sm font-semibold text-[var(--tm-action-primary)]">Rally On</p>
          <h1 className="mt-3 text-2xl font-bold leading-snug">{me?.nickname}님, 오늘도<br />부담 없이 테니스해요.</h1>
        </div>
      </header>

      <section className="mx-auto max-w-[560px] px-5 pt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-bold">매칭 둘러보기</h2>
          {/* 만든 매칭이 지금 어떤 상태인지 보러 가는 길이 마이 안쪽에만 있었다. */}
          <Link className="shrink-0 text-sm font-semibold text-[var(--tm-action-primary)]" href="/activity/received">내가 만든 매칭 →</Link>
        </div>
        <p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">조건에 맞는 매칭을 찾아보세요.</p>
        <Link className="mt-4 flex min-h-12 items-center justify-between rounded-2xl border border-[var(--tm-border-default)] bg-white px-4 text-sm font-semibold text-[var(--tm-action-primary)]" href="/partner-sessions"><span>코트 걱정 없이 함께 테니스해요</span><span aria-hidden>→</span></Link>

        <div className="mt-5 flex items-center gap-2">
          <FilterChip active={date !== null} icon={<CalendarBlank aria-hidden size={15} weight="bold" />} label={dateLabel(date)} onClick={() => setIsDateOpen(true)} />
          <FilterChip active={gameType !== null} icon={<Funnel aria-hidden size={15} weight="bold" />} label={gameTypeLabel(gameType)} onClick={() => setIsFilterOpen(true)} />
          <FilterChip active={sort !== "recommended"} label={sortLabel(sort)} onClick={() => setIsSortOpen(true)} />
        </div>

        {listStatus === "loading" ? (
          <CourtRallyLoader className="mt-4" label="매칭을 불러오고 있어요." />
        ) : listStatus === "error" ? (
          <div className="mt-4 rounded-3xl bg-[var(--tm-bg-subtle)] p-6"><p className="font-bold">매칭을 불러오지 못했어요.</p><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">{listError}</p><Button className="mt-4" onClick={() => void loadMatches()} variant="neutral">다시 시도</Button></div>
        ) : matches.length > 0 ? (
          <div className="mt-4 grid gap-4">{matches.map((match) => <MatchCard key={match.id} match={match} />)}</div>
        ) : hasFilter ? (
          <EmptyFilteredState onReset={() => { setGameType(null); setDate(null); }} />
        ) : (
          <EmptyMatchState />
        )}
      </section>

      <Link aria-label="매칭 만들기" className="fixed bottom-24 right-5 z-30 inline-flex min-h-[52px] items-center gap-2 rounded-full bg-[var(--tm-action-primary)] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(49,94,158,0.26)] transition-transform active:scale-95" href="/matches/new">
        <span aria-hidden="true" className="text-lg leading-none text-[var(--tm-tennis-ball)]">+</span>
        매칭 만들기
      </Link>
      <BottomNavigation />

      <FilterSheet
        onClose={() => setIsFilterOpen(false)}
        onSelect={(value) => { setGameType(value); setIsFilterOpen(false); }}
        open={isFilterOpen}
        value={gameType}
      />
      <SortSheet
        onClose={() => setIsSortOpen(false)}
        onSelect={(value) => { setSort(value); setIsSortOpen(false); }}
        open={isSortOpen}
        value={sort}
      />
      <DateSheet
        onClose={() => setIsDateOpen(false)}
        onSelect={(value) => { setDate(value); setIsDateOpen(false); }}
        open={isDateOpen}
        value={date}
      />
    </main>
  );
}

function FilterSheet({ onClose, onSelect, open, value }: { onClose: () => void; onSelect: (value: ActiveGameType | null) => void; open: boolean; value: ActiveGameType | null }) {
  if (!open) return null;

  return (
    <Modal open onOpenChange={(next) => { if (!next) onClose(); }}>
      <ModalContainer size="large" variant="bottom">
        <ModalNavigation trailingContent={<ModalClose aria-label="게임 유형 필터 닫기" />}>게임 유형</ModalNavigation>
        <ModalContent>
          <ModalContentItem>
            <div className="grid gap-1">
              <SheetOptionRow label="전체" onClick={() => onSelect(null)} selected={value === null} />
              {GAME_TYPE_OPTIONS.map((option) => <SheetOptionRow key={option.value} label={option.label} onClick={() => onSelect(option.value)} selected={value === option.value} />)}
            </div>
          </ModalContentItem>
        </ModalContent>
      </ModalContainer>
    </Modal>
  );
}

function SortSheet({ onClose, onSelect, open, value }: { onClose: () => void; onSelect: (value: MatchSort) => void; open: boolean; value: MatchSort }) {
  if (!open) return null;

  return (
    <Modal open onOpenChange={(next) => { if (!next) onClose(); }}>
      <ModalContainer size="large" variant="bottom">
        <ModalNavigation trailingContent={<ModalClose aria-label="정렬 선택 닫기" />}>정렬</ModalNavigation>
        <ModalContent>
          <ModalContentItem>
            <div className="grid gap-1">
              {SORT_OPTIONS.map((option) => <SheetOptionRow key={option.value} label={option.label} onClick={() => onSelect(option.value)} selected={value === option.value} />)}
            </div>
          </ModalContentItem>
        </ModalContent>
      </ModalContainer>
    </Modal>
  );
}

function FilterChip({ active, icon, label, onClick }: { active: boolean; icon?: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      aria-pressed={active}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors ${active ? "border-[var(--tm-action-primary)] bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]" : "border-[var(--tm-border-default)] bg-white text-[var(--tm-text-primary)]"}`}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
      <CaretDown aria-hidden size={13} weight="bold" />
    </button>
  );
}

function DateSheet({ onClose, onSelect, open, value }: { onClose: () => void; onSelect: (value: string | null) => void; open: boolean; value: string | null }) {
  if (!open) return null;

  return (
    <Modal open onOpenChange={(next) => { if (!next) onClose(); }}>
      <ModalContainer size="large" variant="bottom">
        <ModalNavigation trailingContent={<ModalClose aria-label="날짜 필터 닫기" />}>날짜</ModalNavigation>
        <ModalContent>
          <ModalContentItem>
            <SheetOptionRow label="전체 날짜" onClick={() => onSelect(null)} selected={value === null} />
            <div className="mt-3 flex justify-center">
              <DateCalendar
                min={toCalendarDate(getTodayKstDate())}
                onChange={(next) => { if (next instanceof Date) onSelect(fromCalendarDate(next)); }}
                value={toCalendarDate(value)}
                views={["day"]}
              />
            </div>
          </ModalContentItem>
        </ModalContent>
      </ModalContainer>
    </Modal>
  );
}

function SheetOptionRow({ label, onClick, selected }: { label: string; onClick: () => void; selected: boolean }) {
  return (
    <button aria-pressed={selected} className={`flex min-h-13 w-full items-center justify-between rounded-xl px-3 text-left text-base transition-colors ${selected ? "bg-[var(--tm-bg-subtle)] font-bold text-[var(--tm-action-primary)]" : "text-[var(--tm-text-primary)]"}`} onClick={onClick} type="button">
      {label}
      {selected ? <CheckCircle aria-hidden size={20} weight="fill" /> : null}
    </button>
  );
}

function EmptyFilteredState({ onReset }: { onReset: () => void }) {
  return <div className="mt-4 rounded-3xl bg-[var(--tm-bg-subtle)] p-5"><p className="font-bold">조건에 맞는 매칭이 아직 없어요.</p><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">필터를 초기화하면 더 많은 매칭을 볼 수 있어요.</p><button className="mt-4 text-sm font-semibold text-[var(--tm-action-primary)] underline" onClick={onReset} type="button">필터 초기화</button></div>;
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
    return <div className="mt-4 rounded-3xl bg-[var(--tm-bg-subtle)] p-6">
      <p className="font-bold">직접 예약한 코트로 열린 매칭은 아직 없어요.</p>
      <p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">대신 코트 매칭에 <strong className="font-semibold text-[var(--tm-text-primary)]">{openCourtMatches}개</strong>가 열려 있어요. 코트는 운영자가 준비해 두어서 장소 걱정 없이 참가할 수 있어요.</p>
      <Button as={Link} className="mt-4" fullWidth href="/partner-sessions" size="medium">코트 매칭 보기</Button>
      <Link className="mt-3 inline-block text-sm font-semibold text-[var(--tm-action-primary)] underline" href="/matches/new">직접 매칭 만들기</Link>
    </div>;
  }

  return <div className="mt-4 rounded-3xl bg-[var(--tm-bg-subtle)] p-6">
    <p className="font-bold">아직 열린 매칭이 없어요.</p>
    <p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">첫 매칭을 열면 함께 칠 메이트가 신청할 수 있어요. 코트를 아직 예약하지 않았어도 일정과 지역만으로 시작할 수 있어요.</p>
    <Button as={Link} className="mt-4" fullWidth href="/matches/new" size="medium">매칭 만들기</Button>
  </div>;
}

function HomeLoading() {
  return <HomeStateFrame><CourtRallyLoader className="max-w-[560px]" label="매칭을 준비하고 있어요." /></HomeStateFrame>;
}

function HomeStateFrame({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-svh flex-col bg-[var(--tm-bg-page)] pb-32 text-[var(--tm-text-primary)]">
    <header className="border-b border-[var(--tm-border-default)] bg-[var(--tm-bg-page)]">
      <div className="mx-auto max-w-[560px] px-5 pb-5 pt-8"><p className="text-sm font-semibold text-[var(--tm-action-primary)]">Rally On</p><h1 className="mt-2 text-2xl font-bold">매칭</h1><p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">함께 칠 메이트를 찾고 있어요.</p></div>
    </header>
    <section className="mx-auto flex w-full max-w-[560px] flex-1 items-center justify-center px-5 text-center">{children}</section>
    <BottomNavigation />
  </main>;
}

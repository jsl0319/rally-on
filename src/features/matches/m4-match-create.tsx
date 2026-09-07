"use client";

import {
  ArrowLeft,
  ArrowRight,
  CalendarBlank,
  CheckCircle,
  CurrencyKrw,
  MagnifyingGlass,
  MapPin,
  Minus,
  PencilSimple,
  Plus,
  TennisBall,
  UsersThree,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { ActionArea, ActionAreaButton, FormControl, FormField, FormLabel, Modal, ModalClose, ModalContainer, ModalContent, ModalContentItem, ModalDescription, ModalNavigation, SearchField, TextArea, TextField, TextFieldContent } from "@wanteddev/wds";

import { MatchSchedulePicker } from "./match-schedule-picker";
import { formatMatchDate, isHalfHourTime } from "@/matches/schedule";

import { needsGenderQuota } from "@/matches/recruitment";

import { gameTypes, gameTypeLabels, type GameType } from "@/matches/game-type";

import { bankNames } from "@/matches/bank-list";

import { Button } from "@/components/ui/button";

type CourtPlaceSearchItem = { name: string; address: string; roadAddress: string | null };

type MatchCreateForm = {
  clientRequestId: string;
  date: string;
  startTime: string;
  endTime: string;
  courtName: string;
  address: string;
  courtNumber: string;
  gameType: GameType | "";
  settlementBank: string;
  settlementAccountNumber: string;
  settlementAccountHolder: string;
  maleRecruitCount: number;
  femaleRecruitCount: number;
  splitRecruitment: boolean;
  recruitCount: number;
  playPurposes: string[];
  partnerPreference: string;
  totalCourtFeeKrw: string;
  introduction: string;
};

type FormSetter = <Key extends keyof MatchCreateForm>(key: Key, value: MatchCreateForm[Key]) => void;

const purposes = [
  ["CASUAL_HIT", "편하게 공 주고받기", "부담 없이 가볍게 쳐요"],
  ["RALLY_PRACTICE", "랠리", "공을 이어 가는 연습을 해요"],
  ["STROKE_PRACTICE", "스트로크 연습", "특정 샷을 함께 연습해요"],
  ["GAME_INTRO", "게임 입문", "게임을 처음 경험해 봐요"],
  ["GAME", "게임", "가볍게 게임을 즐겨요"],
] as const;

const preferences = [
  ["COMPLETE_BEGINNER_WELCOME", "완전 초보도 좋아요", "처음 오시는 분도 편하게 신청해요"],
  ["SIMILAR_LEVEL", "비슷한 수준이면 좋아요", "비슷한 속도로 연습하고 싶어요"],
  ["GAME_CAPABLE", "게임 가능한 분을 찾아요", "기본 게임 진행이 가능한 분과 쳐요"],
] as const;

function apiMessage(body: unknown) {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return body.error.message;
  }

  return "등록하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

function getTodayDate() {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => values.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatSchedule(date: string, startTime: string, endTime: string) {
  if (!date || !startTime || !endTime) return "일시를 선택해 주세요";
  return `${formatMatchDate(date)} · ${startTime}~${endTime}`;
}

function getLabel<Value extends string>(items: readonly (readonly [Value, string, string])[], value: string) {
  return items.find(([item]) => item === value)?.[1] ?? value;
}

const MAX_COURT_FEE_KRW = 1_000_000;

function isCourtPlaceSearchItem(value: unknown): value is CourtPlaceSearchItem {
  return typeof value === "object" && value !== null &&
    "name" in value && typeof value.name === "string" &&
    "address" in value && typeof value.address === "string" &&
    "roadAddress" in value && (typeof value.roadAddress === "string" || value.roadAddress === null);
}

export function M4MatchCreate() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [courtSearchQuery, setCourtSearchQuery] = useState("");
  const [courtSearchResults, setCourtSearchResults] = useState<CourtPlaceSearchItem[]>([]);
  const [courtSearchError, setCourtSearchError] = useState("");
  const [courtSearchLoading, setCourtSearchLoading] = useState(false);
  const [isCourtSearchOpen, setIsCourtSearchOpen] = useState(false);
  const [isManualCourtEntry, setIsManualCourtEntry] = useState(false);
  const [form, setForm] = useState<MatchCreateForm>(() => ({
    clientRequestId: crypto.randomUUID(),
    date: "",
    startTime: "",
    endTime: "",
    courtName: "",
    address: "",
    courtNumber: "",
    gameType: "",
    settlementBank: "",
    settlementAccountNumber: "",
    settlementAccountHolder: "",
    maleRecruitCount: 1,
    femaleRecruitCount: 0,
    splitRecruitment: false,
    recruitCount: 1,
    playPurposes: ["RALLY_PRACTICE"],
    partnerPreference: "COMPLETE_BEGINNER_WELCOME",
    totalCourtFeeKrw: "",
    introduction: "",
  }));

  useEffect(() => {
    const query = courtSearchQuery.trim();
    if (query.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        setCourtSearchLoading(true);
        setCourtSearchError("");
        try {
          const response = await fetch(`/api/v1/court-place-search?q=${encodeURIComponent(query)}`, { cache: "no-store", signal: controller.signal });
          const body: unknown = await response.json();
          if (!response.ok) throw new Error(apiMessage(body));
          if (typeof body !== "object" || body === null || !("items" in body) || !Array.isArray(body.items)) {
            throw new Error("코트 검색 결과를 다시 불러와 주세요.");
          }
          if (controller.signal.aborted) return;
          setCourtSearchResults(body.items.filter(isCourtPlaceSearchItem));
        } catch (caught) {
          if (controller.signal.aborted) return;
          setCourtSearchResults([]);
          setCourtSearchError(caught instanceof Error ? caught.message : "코트를 검색하지 못했어요. 직접 입력해 주세요.");
        } finally {
          if (!controller.signal.aborted) setCourtSearchLoading(false);
        }
      })();
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [courtSearchQuery]);

  const set: FormSetter = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const expectedPeople = form.recruitCount + 1;
  // "게스트 참가비용"은 총 코트비를 나누는 값이 아니라 게스트 한 명이 내는 금액 그 자체다.
  const totalCourtFee = Number(form.totalCourtFeeKrw);
  const fee = form.totalCourtFeeKrw === "" || !Number.isFinite(totalCourtFee) ? 0 : totalCourtFee;

  const togglePurpose = (purpose: string) => {
    setForm((current) => {
      if (current.playPurposes.includes(purpose)) {
        return { ...current, playPurposes: current.playPurposes.filter((item) => item !== purpose) };
      }
      if (current.playPurposes.length === 2) return current;

      return { ...current, playPurposes: [...current.playPurposes, purpose] };
    });
  };

  const updateRecruitCount = (change: number) => {
    setForm((current) => ({ ...current, recruitCount: Math.max(1, current.recruitCount + change) }));
  };

  const selectCourtPlace = (place: CourtPlaceSearchItem) => {
    set("courtName", place.name);
    set("address", place.address);
    setCourtSearchQuery("");
    setCourtSearchResults([]);
    setCourtSearchError("");
    setIsCourtSearchOpen(false);
    setIsManualCourtEntry(false);
  };

  const updateCourtSearchQuery = (value: string) => {
    setCourtSearchQuery(value);
    setCourtSearchResults([]);
    setCourtSearchError("");
    setCourtSearchLoading(false);
  };

  const openCourtSearch = () => {
    updateCourtSearchQuery("");
    setIsManualCourtEntry(false);
    setIsCourtSearchOpen(true);
  };

  const openManualCourtEntry = () => {
    updateCourtSearchQuery("");
    setIsManualCourtEntry(true);
    setIsCourtSearchOpen(true);
  };

  const closeCourtSearch = () => {
    updateCourtSearchQuery("");
    setIsCourtSearchOpen(false);
    setIsManualCourtEntry(false);
  };

  const validateForm = () => {
    if (!form.date || !form.startTime || !form.endTime) return "날짜, 시작 시간, 종료 시간을 모두 선택해 주세요.";
    if (form.endTime <= form.startTime) return "종료 시간은 시작 시간보다 늦어야 해요.";
    if (!form.courtName.trim() || !form.address.trim()) return "예약한 코트의 이름과 주소를 입력해 주세요.";
    if (!isHalfHourTime(form.startTime) || !isHalfHourTime(form.endTime)) return "시간은 00분 또는 30분으로 선택해 주세요.";
    if (!form.gameType) return "게임 유형을 선택해 주세요.";
    if (form.splitRecruitment && form.maleRecruitCount + form.femaleRecruitCount !== form.recruitCount) return "남녀별 모집 인원의 합계를 확인해 주세요.";
    const accountFields = [form.settlementBank.trim(), form.settlementAccountNumber.trim(), form.settlementAccountHolder.trim()];
    if (accountFields.some(Boolean) && !accountFields.every(Boolean)) return "정산 정보를 입력하려면 은행, 계좌번호, 예금주를 모두 입력해 주세요.";
    if (form.settlementAccountNumber.trim() && !/^(?=.*[0-9])[0-9-]{5,40}$/.test(form.settlementAccountNumber.trim())) return "계좌번호는 숫자와 하이픈으로 5~40자 입력해 주세요.";
    if (form.playPurposes.length === 0 || form.recruitCount < 1) return "모집 인원과 원하는 플레이를 확인해 주세요.";
    if (form.totalCourtFeeKrw === "" || !Number.isInteger(totalCourtFee) || totalCourtFee < 0 || totalCourtFee > MAX_COURT_FEE_KRW) {
      return `게스트 참가비용을 0원 이상 ${MAX_COURT_FEE_KRW.toLocaleString("ko-KR")}원 이하의 정수로 입력해 주세요.`;
    }

    return null;
  };

  const submit = async () => {
    setSaving(true);
    setSubmitError("");
    try {
      const startsAt = new Date(`${form.date}T${form.startTime}`).toISOString();
      const endsAt = new Date(`${form.date}T${form.endTime}`).toISOString();
      const response = await fetch("/api/v1/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRequestId: form.clientRequestId,
          gameType: form.gameType,
          maleRecruitCount: form.splitRecruitment ? form.maleRecruitCount : null,
          femaleRecruitCount: form.splitRecruitment ? form.femaleRecruitCount : null,
          settlementAccount: form.settlementBank.trim() ? { bank: form.settlementBank.trim(), accountNumber: form.settlementAccountNumber.trim(), accountHolder: form.settlementAccountHolder.trim() } : null,
          startsAt,
          endsAt,
          courtSource: "EXTERNAL_RESERVED",
          externalCourt: {
            name: form.courtName,
            address: form.address,
            courtNumber: form.courtNumber || null,
          },
          recruitCount: form.recruitCount,
          playPurposes: form.playPurposes,
          partnerPreference: form.partnerPreference,
          totalCourtFeeKrw: totalCourtFee,
          introduction: form.introduction || null,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body));
      const matchId = typeof body === "object" && body !== null && "id" in body && typeof body.id === "string" ? body.id : null;
      if (!matchId) throw new Error("등록된 매칭 정보를 찾지 못했어요. 목록에서 다시 확인해 주세요.");

      router.push(`/matches/${matchId}`);
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : "등록하지 못했어요.");
    } finally {
      setSaving(false);
    }
  };

  // "미리보기" only checks the form and opens the preview sheet; the sheet's own
  // "매칭 공개하기" button is what actually calls `submit`.
  const openPreview = () => {
    const message = validateForm();
    if (message) {
      setError(message);
      return;
    }
    setError("");
    setSubmitError("");
    setIsPreviewOpen(true);
  };

  return (
    <main className="min-h-svh bg-[#F4F6FA] pb-36 text-[var(--tm-text-primary)]">
      <section className="mx-auto max-w-[560px]">
        <header className="sticky top-0 z-20 bg-[#F4F6FA]/95 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur">
          <div className="relative flex min-h-11 items-center">
            <button
              aria-label="이전 화면으로 돌아가기"
              className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--tm-text-primary)] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tm-action-primary)]"
              onClick={() => router.replace("/")}
              type="button"
            >
              <ArrowLeft aria-hidden size={25} weight="bold" />
            </button>
            <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-xl font-bold tracking-[-0.04em]">매칭 개설</h1>
          </div>
        </header>

        <div className="px-5 pt-6">
          <PageIntro description="일정, 코트, 모집 정보를 한 번에 입력하고 바로 공개할 수 있어요." eyebrow="테니스 메이트 모집" title="필요한 정보를 입력해 주세요" />

          <CourtScheduleSection
            courtSearchError={courtSearchError}
            courtSearchLoading={courtSearchLoading}
            courtSearchQuery={courtSearchQuery}
            courtSearchResults={courtSearchResults}
            form={form}
            isCourtSearchOpen={isCourtSearchOpen}
            isManualCourtEntry={isManualCourtEntry}
            onCourtAddressChange={(value) => set("address", value)}
            onCourtNameChange={(value) => set("courtName", value)}
            onCourtPlaceQueryChange={updateCourtSearchQuery}
            onCourtPlaceSelect={selectCourtPlace}
            onCourtSearchClose={closeCourtSearch}
            onCourtSearchOpen={openCourtSearch}
            onManualCourtEntryOpen={openManualCourtEntry}
            set={set}
          />
          <RecruitDetailsSection form={form} onRecruitChange={updateRecruitCount} onTogglePurpose={togglePurpose} set={set} />
          <CostAndNoticeSection form={form} set={set} />

          {error ? (
            <p className="mt-5 rounded-2xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm leading-6 text-[var(--tm-status-error-text)]" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <ActionFooter onPreview={openPreview} />
        <MatchPreviewSheet
          error={submitError}
          expectedPeople={expectedPeople}
          fee={fee}
          form={form}
          onClose={() => setIsPreviewOpen(false)}
          onSubmit={() => void submit()}
          open={isPreviewOpen}
          saving={saving}
        />
      </section>
    </main>
  );
}

function PageIntro({ description, eyebrow, title }: { description: string; eyebrow: string; title: ReactNode }) {
  return <header><p className="text-sm font-bold text-[var(--tm-action-primary)]">{eyebrow}</p><h1 className="mt-2 text-[28px] font-bold leading-[1.32] tracking-[-0.04em]">{title}</h1><p className="mt-3 max-w-[420px] text-sm leading-6 text-[var(--tm-text-secondary)]">{description}</p></header>;
}

function CourtScheduleSection({
  form,
  onCourtAddressChange,
  onCourtNameChange,
  onCourtSearchClose,
  onCourtSearchOpen,
  onCourtPlaceQueryChange,
  onCourtPlaceSelect,
  onManualCourtEntryOpen,
  courtSearchError,
  courtSearchLoading,
  courtSearchQuery,
  courtSearchResults,
  isCourtSearchOpen,
  isManualCourtEntry,
  set,
}: {
  form: MatchCreateForm;
  onCourtAddressChange: (value: string) => void;
  onCourtNameChange: (value: string) => void;
  onCourtSearchClose: () => void;
  onCourtSearchOpen: () => void;
  onCourtPlaceQueryChange: (value: string) => void;
  onCourtPlaceSelect: (place: CourtPlaceSearchItem) => void;
  onManualCourtEntryOpen: () => void;
  courtSearchError: string;
  courtSearchLoading: boolean;
  courtSearchQuery: string;
  courtSearchResults: CourtPlaceSearchItem[];
  isCourtSearchOpen: boolean;
  isManualCourtEntry: boolean;
  set: FormSetter;
}) {
  return (
    <div>
      <FormPanel description="언제, 어디서 함께 칠지 먼저 정해 주세요." title="매칭 기본 정보">
        <label>
          <FieldTitle required>테니스장</FieldTitle>
          <CourtPlaceTrigger address={form.address} courtName={form.courtName} onClick={onCourtSearchOpen} />
        </label>
        <FormField className="mt-6">
          <FormLabel required>매칭 날짜</FormLabel>
          <FormControl>
            <MatchSchedulePicker kind="date" label="매칭 날짜" minDate={getTodayDate()} onChange={(value) => set("date", value)} value={form.date} />
          </FormControl>
        </FormField>
        <div className="mt-6">
          <FieldTitle required>매칭 시간</FieldTitle>
          <div className="mt-2 grid gap-3">
            <div className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-sm font-semibold text-[var(--tm-text-primary)]">시작 시간</span>
              <div className="min-w-0 flex-1"><MatchSchedulePicker kind="time" label="시작 시간" onChange={(value) => set("startTime", value)} value={form.startTime} /></div>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-sm font-semibold text-[var(--tm-text-primary)]">종료 시간</span>
              <div className="min-w-0 flex-1"><MatchSchedulePicker kind="time" label="종료 시간" onChange={(value) => set("endTime", value)} value={form.endTime} /></div>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--tm-text-secondary)]">2시간을 넘는 일정도 등록할 수 있어요. 자정을 넘는 일정은 현재 등록할 수 없어요.</p>
        </div>
      </FormPanel>

      <CourtPlaceDialog
        error={courtSearchError}
        form={form}
        isLoading={courtSearchLoading}
        isManualEntry={isManualCourtEntry}
        isOpen={isCourtSearchOpen}
        onClose={onCourtSearchClose}
        onManualEntryOpen={onManualCourtEntryOpen}
        onNameChange={onCourtNameChange}
        onAddressChange={onCourtAddressChange}
        onQueryChange={onCourtPlaceQueryChange}
        onSelect={onCourtPlaceSelect}
        query={courtSearchQuery}
        results={courtSearchResults}
        set={set}
      />
    </div>
  );
}

function CourtPlaceTrigger({ address, courtName, onClick }: { address: string; courtName: string; onClick: () => void }) {
  const hasCourt = Boolean(courtName.trim() || address.trim());

  return (
    <button aria-label={hasCourt ? "테니스장 변경" : "테니스장 검색"} className="mt-2 flex min-h-[72px] w-full items-center gap-3 rounded-2xl border border-[var(--tm-border-default)] bg-white px-4 text-left transition hover:border-[var(--tm-action-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tm-action-primary)]" onClick={onClick} type="button">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]"><MagnifyingGlass aria-hidden size={22} weight="bold" /></span>
      <span className="min-w-0 flex-1">
        {hasCourt ? <><strong className="block truncate text-sm">{courtName || "테니스장 이름을 입력해 주세요"}</strong><span className="mt-1 block truncate text-xs text-[var(--tm-text-secondary)]">{address || "주소를 입력해 주세요"}</span></> : <span className="text-base text-[var(--tm-text-secondary)]">테니스장을 검색해 주세요</span>}
      </span>
      <span className="text-sm font-bold text-[var(--tm-action-primary)]">{hasCourt ? "변경" : "검색"}</span>
    </button>
  );
}

function CourtPlaceDialog({ error, form, isLoading, isManualEntry, isOpen, onAddressChange, onClose, onManualEntryOpen, onNameChange, onQueryChange, onSelect, query, results, set }: { error: string; form: MatchCreateForm; isLoading: boolean; isManualEntry: boolean; isOpen: boolean; onAddressChange: (value: string) => void; onClose: () => void; onManualEntryOpen: () => void; onNameChange: (value: string) => void; onQueryChange: (value: string) => void; onSelect: (place: CourtPlaceSearchItem) => void; query: string; results: CourtPlaceSearchItem[]; set: FormSetter }) {
  const isQueryReady = query.trim().length >= 2;
  const canFinishManualEntry = Boolean(form.courtName.trim() && form.address.trim());

  if (!isOpen) return null;

  return (
    <Modal open onOpenChange={(next) => { if (!next) onClose(); }}>
      <ModalContainer variant="bottom" size="large">
        <ModalNavigation trailingContent={<ModalClose aria-label="테니스장 검색 닫기" />}>
          {isManualEntry ? "테니스장 직접 입력" : "테니스장 검색"}
        </ModalNavigation>
        <ModalContent>
          <ModalContentItem>
            <ModalDescription>{isManualEntry ? "예약한 코트의 이름과 주소를 입력해 주세요." : "지역명 또는 테니스장 이름으로 검색해 주세요."}</ModalDescription>
          </ModalContentItem>

          {isManualEntry ? (
            <ModalContentItem>
              <FormField><FormLabel required>코트장 이름</FormLabel><FormControl><TextField autoFocus maxLength={100} onChange={(event) => onNameChange(event.target.value)} placeholder="예: 한강 테니스장" value={form.courtName} /></FormControl></FormField>
              <FormField className="mt-5"><FormLabel required>코트장 주소</FormLabel><FormControl><TextField maxLength={255} onChange={(event) => onAddressChange(event.target.value)} placeholder="참가자가 찾아올 수 있는 주소" value={form.address} /></FormControl></FormField>
              <FormField className="mt-5"><FormLabel>코트 번호 <span className="font-normal text-[var(--tm-text-secondary)]">(선택)</span></FormLabel><FormControl><TextField maxLength={50} onChange={(event) => set("courtNumber", event.target.value)} placeholder="예: 3번 코트" value={form.courtNumber} /></FormControl></FormField>
              <p className="mt-4 rounded-2xl bg-[var(--tm-bg-subtle)] px-4 py-3 text-xs leading-5 text-[var(--tm-text-secondary)]">예약번호와 연락처는 입력하지 마세요. 코트 번호만 간단히 알려 주세요.</p>
            </ModalContentItem>
          ) : (
            <ModalContentItem>
              <SearchField aria-label="테니스장 검색" autoFocus maxLength={80} onChange={(event) => onQueryChange(event.target.value)} onReset={() => onQueryChange("")} placeholder="테니스장 이름을 입력…" value={query} />
              <button className="mt-4 flex min-h-[54px] w-full items-center justify-between rounded-2xl border border-[var(--tm-border-default)] px-4 text-sm font-bold text-[var(--tm-text-primary)]" onClick={onManualEntryOpen} type="button"><span className="inline-flex items-center gap-3"><PencilSimple aria-hidden size={21} weight="bold" />테니스장 직접 입력</span><ArrowRight aria-hidden size={18} weight="bold" /></button>
              <div className="mt-4 h-[320px] overflow-y-auto">
                {isLoading ? <p className="text-center text-sm text-[var(--tm-text-secondary)]">테니스장을 찾고 있어요…</p> : null}
                {error ? <p className="rounded-2xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm leading-6 text-[var(--tm-status-error-text)]" role="alert">{error}</p> : null}
                {results.length ? <div aria-label="테니스장 검색 결과" className="grid gap-2">{results.map((place, index) => <button aria-label={`${place.name} 선택`} className="rounded-2xl border border-[var(--tm-border-default)] bg-white px-4 py-4 text-left transition hover:border-[var(--tm-action-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tm-action-primary)]" key={`${place.name}-${place.address}-${index}`} onClick={() => onSelect(place)} type="button"><strong className="block text-sm">{place.name}</strong><span className="mt-1 block text-xs leading-5 text-[var(--tm-text-secondary)]">{place.roadAddress ?? place.address}</span></button>)}</div> : null}
                {isQueryReady && !isLoading && !error && results.length === 0 ? <p className="rounded-2xl bg-[var(--tm-bg-subtle)] px-4 py-4 text-center text-sm leading-6 text-[var(--tm-text-secondary)]">찾는 테니스장이 없나요?<br />직접 입력으로 계속 진행할 수 있어요.</p> : null}
                {!isQueryReady ? <div className="px-4 pb-5 pt-18 text-center text-[var(--tm-text-secondary)]"><span className="mx-auto grid size-18 place-items-center rounded-full bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]"><MagnifyingGlass aria-hidden size={36} weight="light" /></span><p className="mt-5 text-base">테니스장을 검색해 주세요</p></div> : null}
              </div>
              <p className="mt-3 text-center text-[11px] leading-5 text-[var(--tm-text-secondary)]">장소 정보 제공: Kakao · 검색 결과는 예약 여부를 보증하지 않아요.</p>
            </ModalContentItem>
          )}
        </ModalContent>

        {isManualEntry ? (
          <ActionArea variant="strong">
            <ActionAreaButton disabled={!canFinishManualEntry} onClick={onClose} variant="main">입력 완료</ActionAreaButton>
          </ActionArea>
        ) : null}
      </ModalContainer>
    </Modal>
  );
}

function RecruitDetailsSection({ form, onRecruitChange, onTogglePurpose, set }: { form: MatchCreateForm; onRecruitChange: (change: number) => void; onTogglePurpose: (value: string) => void; set: FormSetter }) {
  const expectedPeople = form.recruitCount + 1;
  const selectGameType = (value: GameType) => {
    set("gameType", value);
    const split = needsGenderQuota(value);
    set("splitRecruitment", split);
    set("maleRecruitCount", value === "WOMENS_DOUBLES" ? 0 : form.recruitCount);
    set("femaleRecruitCount", value === "WOMENS_DOUBLES" ? form.recruitCount : 0);
  };
  const changeGenderCount = (gender: "maleRecruitCount" | "femaleRecruitCount", count: number) => {
    const next = Math.max(0, Math.min(10, count));
    set(gender, next);
    set("recruitCount", next + (gender === "maleRecruitCount" ? form.femaleRecruitCount : form.maleRecruitCount));
  };

  return (
    <div>
      <FormPanel description="어떤 스타일로, 몇 명과 함께할까요?" icon={<TennisBall aria-hidden size={23} weight="fill" />} title="게임 설정">
        <fieldset><legend className="mb-3 text-sm font-semibold">게임 유형 <span className="text-[var(--tm-status-error-text)]">*</span></legend>
          <div className="grid grid-cols-3 gap-2">{gameTypes.map((value) => <button aria-pressed={form.gameType === value} className={`min-h-12 rounded-xl border text-sm font-semibold ${form.gameType === value ? "border-[var(--tm-action-primary)] bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]" : "border-[var(--tm-border-default)]"}`} key={value} onClick={() => selectGameType(value)} type="button">{gameTypeLabels[value]}</button>)}</div>
          <p className="mt-3 text-xs leading-5 text-[var(--tm-text-secondary)]">혼복은 혼합 복식, 남복은 남자 복식, 여복은 여자 복식이에요. 프로필의 성별을 기준으로 신청하고, 남녀별 정원 안에서 수락해요.</p>
        </fieldset>

        <div className="mt-6 border-t border-[var(--tm-border-subtle)] pt-5">
          <p className="mb-3 text-sm font-semibold">모집 인원</p>
          {!needsGenderQuota(form.gameType) ? <div className="mb-4 flex gap-2">{[false, true].map((split) => <button aria-pressed={form.splitRecruitment === split} className="min-h-11 rounded-xl border border-[var(--tm-border-default)] px-3 text-sm aria-pressed:border-[var(--tm-action-primary)] aria-pressed:text-[var(--tm-action-primary)]" key={String(split)} onClick={() => { set("splitRecruitment", split); set("maleRecruitCount", form.recruitCount); set("femaleRecruitCount", 0); }} type="button">{split ? "남녀 구분" : "성별 무관"}</button>)}</div> : null}
          {form.splitRecruitment ? <div><div className="grid grid-cols-2 gap-3">{([["maleRecruitCount", "남자 모집 인원"], ["femaleRecruitCount", "여자 모집 인원"]] as const).map(([key, label]) => <label className="text-sm font-semibold" key={key}>{label}<select className="mt-2 min-h-12 w-full rounded-xl border border-[var(--tm-border-default)] bg-white px-3 disabled:bg-neutral-100" disabled={key === "maleRecruitCount" ? form.gameType === "WOMENS_DOUBLES" : form.gameType === "MENS_DOUBLES"} onChange={(event) => changeGenderCount(key, Number(event.target.value))} value={form[key]}>{Array.from({ length: 11 }, (_, count) => <option key={count} value={count}>{count}명</option>)}</select></label>)}</div><p className="mt-3 text-xs leading-5 text-[var(--tm-text-secondary)]">모집자를 제외한 남자 {form.maleRecruitCount}명 · 여자 {form.femaleRecruitCount}명, 나를 포함해 총 {expectedPeople}명이 함께해요.</p></div> : <>
          <div className="flex items-center justify-between rounded-2xl border border-[var(--tm-border-default)] bg-white p-3">
            <div>
              <p className="text-sm font-bold">추가 모집 인원</p>
              <p className="mt-1 text-xs text-[var(--tm-text-secondary)]">나를 포함해 총 {expectedPeople}명이 함께해요</p>
            </div>
            <div className="flex items-center gap-3">
              <button aria-label="모집 인원 줄이기" className="grid size-10 place-items-center rounded-xl border border-[var(--tm-border-default)] disabled:opacity-40" disabled={form.recruitCount <= 1} onClick={() => onRecruitChange(-1)} type="button"><Minus aria-hidden size={17} weight="bold" /></button>
              <output aria-label={`추가 모집 인원 ${form.recruitCount}명`} className="min-w-7 text-center text-lg font-bold">{form.recruitCount}</output>
              <button aria-label="모집 인원 늘리기" className="grid size-10 place-items-center rounded-xl bg-[var(--tm-action-primary)] text-white" onClick={() => onRecruitChange(1)} type="button"><Plus aria-hidden size={17} weight="bold" /></button>
            </div>
          </div>
          </>}
        </div>
      </FormPanel>

      <FormPanel description="최대 두 가지를 골라 주세요." icon={<TennisBall aria-hidden size={23} weight="fill" />} title="원하는 플레이">
        <div className="grid gap-3 sm:grid-cols-2">
          {purposes.map(([code, label, description]) => <ChoiceCard description={description} key={code} onClick={() => onTogglePurpose(code)} selected={form.playPurposes.includes(code)}>{label}</ChoiceCard>)}
        </div>
      </FormPanel>

      <FormPanel description="실력 수치 대신, 함께하고 싶은 분위기를 골라 주세요." icon={<UsersThree aria-hidden size={23} weight="fill" />} title="원하는 상대">
        <div className="grid gap-3">
          {preferences.map(([value, label, description]) => <ChoiceCard description={description} key={value} onClick={() => set("partnerPreference", value)} selected={form.partnerPreference === value}>{label}</ChoiceCard>)}
        </div>
      </FormPanel>
    </div>
  );
}

function CostAndNoticeSection({ form, set }: { form: MatchCreateForm; set: FormSetter }) {
  return (
    <div>
      <FormPanel description="게스트 한 명이 낼 참가비를 입력해 주세요." icon={<CurrencyKrw aria-hidden size={23} weight="bold" />} title="참가 비용">
        <FormField>
          <FormLabel required>게스트 참가비용</FormLabel>
          <FormControl>
            <TextField
              inputMode="numeric"
              onChange={(event) => {
                // 콤마 구분 표시를 위해 text 입력으로 받고, 저장은 숫자만 남긴 문자열로 한다
                // (표시는 항상 Number(...).toLocaleString()로 다시 포맷한다).
                const digits = event.target.value.replace(/[^0-9]/g, "");
                if (digits !== "" && (!Number.isFinite(Number(digits)) || Number(digits) > MAX_COURT_FEE_KRW)) return;
                set("totalCourtFeeKrw", digits);
              }}
              placeholder="예: 24,000"
              trailingContent={<TextFieldContent variant="text">원</TextFieldContent>}
              type="text"
              value={form.totalCourtFeeKrw === "" ? "" : Number(form.totalCourtFeeKrw).toLocaleString("ko-KR")}
            />
          </FormControl>
          <p className="mt-2 text-xs text-[var(--tm-text-secondary)]">최대 {MAX_COURT_FEE_KRW.toLocaleString("ko-KR")}원까지 입력할 수 있어요. 게스트 한 명당 내는 참가비예요.</p>
        </FormField>
        <p className="mt-3 rounded-2xl bg-[var(--tm-bg-subtle)] px-4 py-3 text-xs leading-5 text-[var(--tm-text-secondary)]">Rally On은 참가비를 결제하거나 정산하지 않아요. 참가비는 참가자와 직접 정산해요.</p>
      </FormPanel>

      <FormPanel description="모집자와 수락된 참가자에게만 보여요. 입력할 경우 세 항목을 모두 채워 주세요." title="정산 정보 (선택)">
        <div className="grid gap-4">
          <FormField>
            <FormLabel>은행</FormLabel>
            <FormControl>
              <select className="min-h-12 w-full rounded-xl border border-[var(--tm-border-default)] bg-white px-3 text-sm" onChange={(event) => set("settlementBank", event.target.value)} value={form.settlementBank}>
                <option value="">은행을 선택해 주세요</option>
                {bankNames.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </FormControl>
          </FormField>
          <FormField><FormLabel>계좌번호</FormLabel><FormControl><TextField autoComplete="off" inputMode="numeric" maxLength={40} onChange={(event) => set("settlementAccountNumber", event.target.value)} placeholder="숫자와 하이픈만 입력해 주세요" value={form.settlementAccountNumber} /></FormControl></FormField>
          <FormField><FormLabel>예금주</FormLabel><FormControl><TextField autoComplete="off" maxLength={50} onChange={(event) => set("settlementAccountHolder", event.target.value)} placeholder="예금주 이름" value={form.settlementAccountHolder} /></FormControl></FormField>
        </div>
        <p className="mt-3 text-xs leading-5 text-[var(--tm-text-secondary)]">참가자 간 송금을 위한 안내예요. Rally On은 계좌를 검증하거나 송금·입금 확인을 하지 않아요.</p>
      </FormPanel>

      <FormPanel description="처음 신청하는 분도 편하게 알 수 있도록 적어 주세요." title={<>매칭 소개글 <span className="text-base font-normal text-[var(--tm-text-secondary)]">(선택)</span></>}>
        <FormField>
          <FormLabel>매칭 소개글</FormLabel>
          <FormControl>
            <TextArea autoComplete="off" width="100%" minRows={6} maxLength={300} onChange={(event) => set("introduction", event.target.value)} placeholder="예: 천천히 랠리하면서 즐겁게 연습할 분을 찾아요. 처음 게임을 해봐도 괜찮아요!" value={form.introduction} />
          </FormControl>
          <p className="text-right text-xs text-[var(--tm-text-secondary)]">{form.introduction.length} / 300</p>
        </FormField>
        <p className="mt-4 rounded-2xl bg-[var(--tm-bg-subtle)] px-4 py-3 text-sm leading-6 text-[var(--tm-action-hover)]">수락된 참가자와 서비스 내 채팅에서 당일 준비를 조율해요.</p>
      </FormPanel>
    </div>
  );
}

function FormPanel({ children, description, icon, title }: { children: ReactNode; description: string; icon?: ReactNode; title: ReactNode }) {
  return <section className="mt-6 rounded-3xl bg-white p-5 shadow-[0_10px_30px_rgba(29,50,84,0.06)]"><div className="flex gap-3">{icon ? <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]">{icon}</span> : null}<div><h2 className="text-lg font-bold">{title}</h2><p className="mt-1 text-sm leading-6 text-[var(--tm-text-secondary)]">{description}</p></div></div><div className="mt-5">{children}</div></section>;
}

function FieldTitle({ children, required = false }: { children: ReactNode; required?: boolean }) {
  return <span className="flex items-center gap-2 text-sm font-bold"><span>{children}</span>{required ? <span className="rounded-full bg-[var(--tm-bg-subtle)] px-2 py-0.5 text-[10px] font-bold text-[var(--tm-action-primary)]">필수</span> : null}</span>;
}

function ChoiceCard({ children, description, onClick, selected }: { children: ReactNode; description: string; onClick: () => void; selected: boolean }) {
  return <button aria-pressed={selected} className={`relative min-h-[78px] rounded-2xl border p-4 pr-11 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tm-action-primary)] ${selected ? "border-[var(--tm-action-primary)] bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]" : "border-[var(--tm-border-default)] bg-white text-[var(--tm-text-primary)] hover:border-[var(--tm-action-primary)]"}`} onClick={onClick} type="button"><strong className="text-sm">{children}</strong><span className="mt-1 block text-xs font-normal leading-5 text-[var(--tm-text-secondary)]">{description}</span>{selected ? <CheckCircle aria-label="선택됨" className="absolute right-4 top-4" size={20} weight="fill" /> : null}</button>;
}

function ActionFooter({ onPreview }: { onPreview: () => void }) {
  // WDS's underlying `Button` bakes `height: fit-content` into its own generated style, so a
  // plain (non-`!important`) Tailwind height utility only ties on specificity with it and can
  // lose depending on style-injection order — which is why the earlier `min-h-[52px]` attempt
  // didn't visibly grow the button. `!` forces `!important`, which always wins regardless of
  // order, so the footer's CTA reliably renders at its intended height.
  return (
    <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--tm-border-subtle)] bg-white/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      <div className="mx-auto max-w-[560px]">
        <Button className="!h-14" fullWidth onClick={onPreview} size="large">
          미리보기
        </Button>
      </div>
    </footer>
  );
}

// Shows the match roughly as it'll appear once published, so the host can double-check
// everything before it goes live — publishing itself happens from this sheet's own CTA,
// not from the page's fixed footer.
function MatchPreviewSheet({
  error,
  expectedPeople,
  fee,
  form,
  onClose,
  onSubmit,
  open,
  saving,
}: {
  error: string;
  expectedPeople: number;
  fee: number;
  form: MatchCreateForm;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
  saving: boolean;
}) {
  const regionText = [form.courtName, form.address].filter(Boolean).join(" · ");

  if (!open) return null;

  return (
    <Modal open onOpenChange={(next) => { if (!next) onClose(); }}>
      <ModalContainer size="large" variant="bottom">
        <ModalNavigation trailingContent={<ModalClose aria-label="미리보기 닫기" />}>미리보기</ModalNavigation>
        <ModalContent>
          <ModalContentItem>
            <ModalDescription>공개하면 매칭 목록에 보여지고, 원할 때 참가 신청을 받을 수 있어요.</ModalDescription>
            <article className="mt-4 overflow-hidden rounded-3xl border border-[var(--tm-border-default)] bg-white shadow-[0_12px_30px_rgba(29,50,84,0.08)]">
              <div className="p-5">
                <p className="inline-flex rounded-full bg-[var(--tm-bg-subtle)] px-3 py-1.5 text-xs font-bold text-[var(--tm-action-primary)]">모집자가 코트를 예약했어요</p>
                <h2 className="mt-3 text-xl font-bold leading-7">{form.courtName}</h2>
                <p className="mt-2 text-sm">{form.gameType ? gameTypeLabels[form.gameType] : ""}{form.splitRecruitment ? ` · 남자 ${form.maleRecruitCount}명 / 여자 ${form.femaleRecruitCount}명 모집` : " · 성별 무관"}</p>
                <dl className="mt-5 grid gap-4">
                  <PreviewItem icon={<CalendarBlank aria-hidden size={19} weight="fill" />} label="일시" value={formatSchedule(form.date, form.startTime, form.endTime)} />
                  <PreviewItem icon={<MapPin aria-hidden size={19} weight="fill" />} label="코트" value={regionText || "코트 정보를 입력해 주세요"} />
                  <PreviewItem icon={<UsersThree aria-hidden size={19} weight="fill" />} label="모집" value={`추가 ${form.recruitCount}명 · 총 ${expectedPeople}명 예정`} />
                  <PreviewItem icon={<CurrencyKrw aria-hidden size={19} weight="bold" />} label="게스트 참가비용" value={`${fee.toLocaleString("ko-KR")}원`} />
                </dl>
                <div className="mt-5 border-t border-[var(--tm-border-subtle)] pt-4">
                  <p className="text-sm font-bold">함께하고 싶은 플레이</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">
                    {form.playPurposes.map((purpose) => getLabel(purposes, purpose)).join(" · ")}
                    <br />
                    {getLabel(preferences, form.partnerPreference)}
                  </p>
                  {form.partnerPreference === "COMPLETE_BEGINNER_WELCOME" ? <p className="mt-3 inline-flex rounded-full bg-[var(--tm-bg-subtle)] px-3 py-1.5 text-xs font-bold text-[var(--tm-action-primary)]">초보자 환영</p> : null}
                  {form.introduction ? <p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">{form.introduction}</p> : null}
                </div>
                {form.settlementBank.trim() ? <div className="mt-4 rounded-2xl bg-[var(--tm-bg-subtle)] p-4 text-sm"><p className="font-bold">정산 정보 · 수락된 참가자에게만 공개</p><p className="mt-2 break-all">{form.settlementBank} {form.settlementAccountNumber} · {form.settlementAccountHolder}</p></div> : null}
                <p className="mt-5 rounded-2xl bg-[var(--tm-bg-subtle)] px-4 py-3 text-xs leading-5 text-[var(--tm-text-secondary)]">참가비는 앱에서 결제되지 않으며, 참가자와 직접 정산해요.</p>
              </div>
            </article>
            {error ? (
              <p className="mt-4 rounded-2xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm leading-6 text-[var(--tm-status-error-text)]" role="alert">
                {error}
              </p>
            ) : null}
          </ModalContentItem>
        </ModalContent>

        <ActionArea variant="strong">
          <ActionAreaButton disabled={saving} onClick={onSubmit} variant="main">{saving ? "등록 중…" : "매칭 공개하기"}</ActionAreaButton>
        </ActionArea>
      </ModalContainer>
    </Modal>
  );
}

function PreviewItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-[var(--tm-action-primary)]">{icon}</span>
      <div>
        <dt className="text-xs font-bold text-[var(--tm-text-secondary)]">{label}</dt>
        <dd className="mt-1 text-sm leading-5 text-[var(--tm-text-primary)]">{value}</dd>
      </div>
    </div>
  );
}

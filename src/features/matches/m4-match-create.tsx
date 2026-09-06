"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  CurrencyKrw,
  MagnifyingGlass,
  Minus,
  PencilSimple,
  Plus,
  Sparkle,
  TennisBall,
  UsersThree,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { forwardRef, useEffect, useState, type ReactNode } from "react";

import { ActionArea, ActionAreaButton, DatePicker, type DatePickerFieldProps, type DateType, FormControl, FormField, FormLabel, Modal, ModalClose, ModalContainer, ModalContent, ModalContentItem, ModalDescription, ModalNavigation, SearchField, TextArea, TextButton, TextField, TextFieldContent, TimePicker, type TimePickerFieldProps } from "@wanteddev/wds";

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
  title: string;
  recruitCount: number;
  playPurposes: string[];
  partnerPreference: string;
  totalCourtFeeKrw: string;
  additionalCostNote: string;
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

function dateInputToValue(date: string): Date | undefined {
  if (!date) return undefined;
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return undefined;

  return new Date(year, month - 1, day);
}

function valueToDateInput(value: DateType): string {
  const date = value instanceof Date ? value : typeof value === "string" && value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function timeInputToValue(time: string): Date | undefined {
  if (!time) return undefined;
  const [hour, minute] = time.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return undefined;
  const date = new Date();
  date.setHours(hour, minute, 0, 0);

  return date;
}

function valueToTimeInput(value: DateType): string {
  const date = value instanceof Date ? value : typeof value === "string" && value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";

  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

const DATE_PICKER_FORMAT = "YYYY.MM.DD";
const TIME_PICKER_FORMAT = "a hh:mm";

// WDS의 DatePicker/TimePicker는 값이 비어 있을 때 포맷 문자열 자체를(예: "YYYY.MM.DD")
// 입력값으로 채워 넣는데, 이 화면에서는 달력/휠 선택만 쓰기 때문에 아직 아무것도
// 고르지 않은 상태에서는 그 포맷 문자열 대신 안내 placeholder만 보이도록 감춘다.
const MaskedDateField = forwardRef<HTMLDivElement, DatePickerFieldProps>(({ inputRef, value, ...props }, ref) => (
  <TextField {...props} ref={inputRef} value={value === DATE_PICKER_FORMAT ? "" : value} wrapperRef={ref} />
));
MaskedDateField.displayName = "MaskedDateField";

const MaskedTimeField = forwardRef<HTMLDivElement, TimePickerFieldProps>(({ inputRef, value, ...props }, ref) => (
  <TextField {...props} ref={inputRef} value={value === TIME_PICKER_FORMAT ? "" : value} wrapperRef={ref} />
));
MaskedTimeField.displayName = "MaskedTimeField";

function getDescription<Value extends string>(items: readonly (readonly [Value, string, string])[], value: string) {
  return items.find(([item]) => item === value)?.[2] ?? "";
}

const MAX_COURT_FEE_KRW = 1_000_000;

// 이미 앞 단계에서 고른 플레이 목적·상대 선호를 자연스러운 한 두 문장으로 엮어
// 초보자도 부담 없이 "소개" 칸을 채울 수 있도록 초안을 만들어 준다. 외부 AI 호출 없이
// 화면에 이미 쓰인 안내 문구(질문 카드의 설명 문구)를 그대로 재활용한다.
function suggestIntroduction(form: Pick<MatchCreateForm, "playPurposes" | "partnerPreference">) {
  const purposeSentences = form.playPurposes.map((purpose) => getDescription(purposes, purpose)).filter(Boolean);
  const preferenceSentence = getDescription(preferences, form.partnerPreference);
  const sentences = [...purposeSentences, preferenceSentence].filter(Boolean);
  if (sentences.length === 0) return "";

  return `${sentences.join(". ")}. 함께 즐거운 시간 보내요!`;
}

function isCourtPlaceSearchItem(value: unknown): value is CourtPlaceSearchItem {
  return typeof value === "object" && value !== null &&
    "name" in value && typeof value.name === "string" &&
    "address" in value && typeof value.address === "string" &&
    "roadAddress" in value && (typeof value.roadAddress === "string" || value.roadAddress === null);
}

export function M4MatchCreate() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
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
    title: "",
    recruitCount: 1,
    playPurposes: ["RALLY_PRACTICE"],
    partnerPreference: "COMPLETE_BEGINNER_WELCOME",
    totalCourtFeeKrw: "",
    additionalCostNote: "",
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
  const totalCourtFee = Number(form.totalCourtFeeKrw);
  const fee = form.totalCourtFeeKrw === "" || !Number.isFinite(totalCourtFee) ? 0 : Math.ceil(totalCourtFee / expectedPeople);

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
    if (!form.title.trim() || form.playPurposes.length === 0 || form.recruitCount < 1) return "매칭 제목, 모집 인원, 원하는 플레이를 확인해 주세요.";
    if (form.totalCourtFeeKrw === "" || !Number.isInteger(totalCourtFee) || totalCourtFee < 0 || totalCourtFee > MAX_COURT_FEE_KRW) {
      return `전체 코트 비용을 0원 이상 ${MAX_COURT_FEE_KRW.toLocaleString("ko-KR")}원 이하의 정수로 입력해 주세요.`;
    }

    return null;
  };

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const startsAt = new Date(`${form.date}T${form.startTime}`).toISOString();
      const endsAt = new Date(`${form.date}T${form.endTime}`).toISOString();
      const response = await fetch("/api/v1/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRequestId: form.clientRequestId,
          title: form.title,
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
          additionalCostNote: form.additionalCostNote || null,
          introduction: form.introduction || null,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body));
      const matchId = typeof body === "object" && body !== null && "id" in body && typeof body.id === "string" ? body.id : null;
      if (!matchId) throw new Error("등록된 매칭 정보를 찾지 못했어요. 목록에서 다시 확인해 주세요.");

      router.push(`/matches/${matchId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "등록하지 못했어요.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = () => {
    const message = validateForm();
    if (message) {
      setError(message);
      return;
    }
    void submit();
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
          <CostAndNoticeSection expectedPeople={expectedPeople} fee={fee} form={form} set={set} />

          {error ? (
            <p className="mt-5 rounded-2xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm leading-6 text-[var(--tm-status-error-text)]" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <ActionFooter disabled={saving} onSubmit={handleSubmit} saving={saving} />
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
            <DatePicker format={DATE_PICKER_FORMAT} input={MaskedDateField} min={dateInputToValue(getTodayDate())} onChange={(value) => set("date", valueToDateInput(value))} placeholder="연도.월.일" value={dateInputToValue(form.date)} />
          </FormControl>
        </FormField>
        <div className="mt-6">
          <FieldTitle required>매칭 시간</FieldTitle>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <FormField>
              <FormLabel>시작 시간</FormLabel>
              <FormControl>
                <TimePicker format={TIME_PICKER_FORMAT} input={MaskedTimeField} onChange={(value) => set("startTime", valueToTimeInput(value))} placeholder="시작 시간" value={timeInputToValue(form.startTime)} />
              </FormControl>
            </FormField>
            <FormField>
              <FormLabel>종료 시간</FormLabel>
              <FormControl>
                <TimePicker format={TIME_PICKER_FORMAT} input={MaskedTimeField} minTime={timeInputToValue(form.startTime)} onChange={(value) => set("endTime", valueToTimeInput(value))} placeholder="종료 시간" value={timeInputToValue(form.endTime)} />
              </FormControl>
            </FormField>
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

  return (
    <div>
      <FormPanel description="짧고 자연스러운 제목이 좋아요." icon={<TennisBall aria-hidden size={23} weight="fill" />} title="매칭 제목">
        <FormField>
          <FormLabel required>제목</FormLabel>
          <FormControl>
            <TextField maxLength={80} onChange={(event) => set("title", event.target.value)} placeholder="예: 주말에 편하게 공 주고받아요" value={form.title} />
          </FormControl>
          <p className="text-right text-xs text-[var(--tm-text-secondary)]">{form.title.length} / 80</p>
        </FormField>
      </FormPanel>

      <FormPanel description="모집자를 제외하고 함께 칠 인원을 정해 주세요." icon={<UsersThree aria-hidden size={23} weight="fill" />} title="몇 명과 함께할까요?">
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

function CostAndNoticeSection({ expectedPeople, fee, form, set }: { expectedPeople: number; fee: number; form: MatchCreateForm; set: FormSetter }) {
  return (
    <div>
      <FormPanel description="예약할 때 확인한 전체 코트 이용료를 입력해 주세요." icon={<CurrencyKrw aria-hidden size={23} weight="bold" />} title="코트 비용">
        <FormField>
          <FormLabel required>전체 코트 비용</FormLabel>
          <FormControl>
            <TextField
              inputMode="numeric"
              max={MAX_COURT_FEE_KRW}
              min="0"
              onChange={(event) => {
                const { value } = event.target;
                if (value !== "" && (!Number.isFinite(Number(value)) || Number(value) > MAX_COURT_FEE_KRW)) return;
                set("totalCourtFeeKrw", value);
              }}
              placeholder="예: 24,000"
              trailingContent={<TextFieldContent variant="text">원</TextFieldContent>}
              type="number"
              value={form.totalCourtFeeKrw}
            />
          </FormControl>
          <p className="mt-2 text-xs text-[var(--tm-text-secondary)]">최대 {MAX_COURT_FEE_KRW.toLocaleString("ko-KR")}원까지 입력할 수 있어요.</p>
        </FormField>
        <div className="mt-4 rounded-2xl bg-[var(--tm-bg-subtle)] p-4">
          <p className="text-sm text-[var(--tm-text-secondary)]">예상 1인 비용</p>
          <p className="mt-1 text-xl font-bold text-[var(--tm-action-primary)]">약 {fee.toLocaleString("ko-KR")}원</p>
          <p className="mt-2 text-xs leading-5 text-[var(--tm-text-secondary)]">전체 비용 ÷ 예상 총 {expectedPeople}명, 1원 단위 올림으로 계산해요.</p>
        </div>
        <p className="mt-3 rounded-2xl bg-[var(--tm-bg-subtle)] px-4 py-3 text-xs leading-5 text-[var(--tm-text-secondary)]">Rally On은 코트 비용을 결제하거나 정산하지 않아요. 비용 분담은 참가자끼리 따로 정해요.</p>
      </FormPanel>

      <FormPanel description="준비물이나 별도 비용이 있다면 짧게 알려 주세요." title={<>추가 비용 안내 <span className="text-base font-normal text-[var(--tm-text-secondary)]">(선택)</span></>}>
        <FormField>
          <FormLabel>안내</FormLabel>
          <FormControl>
            <TextField maxLength={200} onChange={(event) => set("additionalCostNote", event.target.value)} placeholder="예: 테니스공은 각자 준비해요" value={form.additionalCostNote} />
          </FormControl>
          <p className="text-right text-xs text-[var(--tm-text-secondary)]">{form.additionalCostNote.length} / 200</p>
        </FormField>
      </FormPanel>

      <FormPanel description="처음 신청하는 분도 편하게 알 수 있도록 적어 주세요." title={<>소개 <span className="text-base font-normal text-[var(--tm-text-secondary)]">(선택)</span></>}>
        <FormField>
          <div className="flex items-center justify-between gap-3">
            <FormLabel>소개</FormLabel>
            <TextButton color="primary" leadingContent={<Sparkle aria-hidden size={16} weight="fill" />} onClick={() => set("introduction", suggestIntroduction(form))} size="small">자동으로 소개 만들기</TextButton>
          </div>
          <FormControl>
            <TextArea maxLength={300} onChange={(event) => set("introduction", event.target.value)} placeholder="예: 천천히 랠리하면서 즐겁게 연습할 분을 찾아요. 처음 게임을 해봐도 괜찮아요!" value={form.introduction} />
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

function ActionFooter({ disabled, onSubmit, saving }: { disabled: boolean; onSubmit: () => void; saving: boolean }) {
  // WDS's underlying `Button` bakes `height: fit-content` into its own generated style, so a
  // plain (non-`!important`) Tailwind height utility only ties on specificity with it and can
  // lose depending on style-injection order — which is why the earlier `min-h-[52px]` attempt
  // didn't visibly grow the button. `!` forces `!important`, which always wins regardless of
  // order, so the footer's CTA reliably renders at its intended height.
  return (
    <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--tm-border-subtle)] bg-white/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      <div className="mx-auto max-w-[560px]">
        <Button className="!h-14" disabled={disabled} fullWidth onClick={onSubmit} size="large">
          {saving ? "등록 중…" : "매칭 공개하기"}
        </Button>
      </div>
    </footer>
  );
}

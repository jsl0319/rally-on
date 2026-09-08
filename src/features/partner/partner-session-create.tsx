"use client";

import { CalendarBlank, CheckCircle, CurrencyKrw, MapPin, Minus, Plus, TennisBall, UsersThree } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { ActionArea, ActionAreaButton, FormControl, FormField, FormLabel, Modal, ModalClose, ModalContainer, ModalContent, ModalContentItem, ModalDescription, ModalNavigation, TextArea, TextField } from "@wanteddev/wds";

import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { BackButton } from "@/components/navigation/back-button";
import { Button } from "@/components/ui/button";
import { CourtMedia } from "@/features/matches/court-media";
import { bankNames } from "@/matches/bank-list";
import { activeGameTypes, gameTypeLabels, type GameType } from "@/matches/game-type";
import { needsGenderQuota } from "@/matches/recruitment";

import { apiMessage, formatDuration, formatPartnerSchedule, type PublicCourtSlot } from "./partner-session";

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

type PartnerSessionForm = {
  clientRequestId: string;
  gameType: GameType | "";
  splitRecruitment: boolean;
  recruitCount: number;
  maleRecruitCount: number;
  femaleRecruitCount: number;
  playPurposes: string[];
  partnerPreference: string;
  introduction: string;
  settlementBank: string;
  settlementAccountNumber: string;
  settlementAccountHolder: string;
};

type FormSetter = <Key extends keyof PartnerSessionForm>(key: Key, value: PartnerSessionForm[Key]) => void;

type AvailableSlotResponse = { items: PublicCourtSlot[] };

function getLabel<Value extends string>(items: readonly (readonly [Value, string, string])[], value: string) {
  return items.find(([item]) => item === value)?.[1] ?? value;
}

export function PartnerSessionCreate({ slotId }: { slotId: string }) {
  const router = useRouter();
  const [slot, setSlot] = useState<PublicCourtSlot | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [form, setForm] = useState<PartnerSessionForm>(() => ({
    clientRequestId: crypto.randomUUID(),
    gameType: "",
    splitRecruitment: false,
    recruitCount: 1,
    maleRecruitCount: 1,
    femaleRecruitCount: 0,
    playPurposes: ["RALLY_PRACTICE"],
    partnerPreference: "COMPLETE_BEGINNER_WELCOME",
    introduction: "",
    settlementBank: "",
    settlementAccountNumber: "",
    settlementAccountHolder: "",
  }));

  const load = useCallback(async () => {
    try {
      setLoadError("");
      const response = await fetch("/api/v1/partner-session-slots/available", { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "코트 매칭을 열 수 있는 시간을 불러오지 못했어요."));
      const selectedSlot = (body as AvailableSlotResponse).items.find((item) => item.id === slotId) ?? null;
      if (!selectedSlot) throw new Error("선택한 코트 시간은 이미 다른 코트 매칭에 연결됐거나 더 이상 열 수 없어요.");
      setSlot(selectedSlot);
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "코트 매칭을 열 수 있는 시간을 불러오지 못했어요.");
    }
  }, [slotId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const set: FormSetter = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const togglePurpose = (purpose: string) => setForm((current) => {
    if (current.playPurposes.includes(purpose)) return { ...current, playPurposes: current.playPurposes.filter((item) => item !== purpose) };
    if (current.playPurposes.length === 2) return current;
    return { ...current, playPurposes: [...current.playPurposes, purpose] };
  });

  // 현장 최대 인원에서 모집자 본인을 뺀 만큼만 더 모을 수 있다.
  const maxRecruitCount = slot ? Math.max(slot.maxParticipantCount - 1, 1) : 1;

  const updateRecruitCount = (change: number) => setForm((current) => ({
    ...current,
    recruitCount: Math.min(maxRecruitCount, Math.max(1, current.recruitCount + change)),
  }));

  const selectGameType = (value: GameType) => setForm((current) => {
    const split = needsGenderQuota(value);
    return {
      ...current,
      gameType: value,
      splitRecruitment: split,
      maleRecruitCount: value === "WOMENS_DOUBLES" ? 0 : current.recruitCount,
      femaleRecruitCount: value === "WOMENS_DOUBLES" ? current.recruitCount : 0,
    };
  });

  const changeGenderCount = (gender: "maleRecruitCount" | "femaleRecruitCount", count: number) => setForm((current) => {
    const next = Math.max(0, Math.min(maxRecruitCount, count));
    const other = gender === "maleRecruitCount" ? current.femaleRecruitCount : current.maleRecruitCount;
    return { ...current, [gender]: next, recruitCount: next + other };
  });

  const setSplitRecruitment = (split: boolean) => setForm((current) => ({
    ...current,
    splitRecruitment: split,
    maleRecruitCount: current.recruitCount,
    femaleRecruitCount: 0,
  }));

  const validateForm = () => {
    if (!slot) return "선택한 코트 시간을 다시 불러와 주세요.";
    if (!form.gameType) return "게임 유형을 선택해 주세요.";
    if (form.playPurposes.length === 0) return "원하는 플레이를 확인해 주세요.";
    if (form.splitRecruitment && form.maleRecruitCount + form.femaleRecruitCount !== form.recruitCount) return "남녀별 모집 인원의 합계를 확인해 주세요.";
    if (form.recruitCount < 1) return "추가 모집 인원은 1명 이상이어야 해요.";
    if (form.recruitCount > maxRecruitCount) return `현장 최대 ${slot.maxParticipantCount}명이라 추가 모집 인원은 ${maxRecruitCount}명까지 선택할 수 있어요.`;
    const accountFields = [form.settlementBank.trim(), form.settlementAccountNumber.trim(), form.settlementAccountHolder.trim()];
    if (accountFields.some(Boolean) && !accountFields.every(Boolean)) return "정산 정보를 입력하려면 은행, 계좌번호, 예금주를 모두 입력해 주세요.";
    if (form.settlementAccountNumber.trim() && !/^(?=.*[0-9])[0-9-]{5,40}$/.test(form.settlementAccountNumber.trim())) return "계좌번호는 숫자와 하이픈으로 5~40자 입력해 주세요.";
    return null;
  };

  const submit = async () => {
    if (!slot) return;
    const validationError = validateForm();
    if (validationError) { setSubmitError(validationError); return; }

    setSaving(true);
    setSubmitError("");
    try {
      const response = await fetch("/api/v1/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRequestId: form.clientRequestId,
          courtSource: "PARTNER_COURT",
          courtSlotId: slot.id,
          gameType: form.gameType,
          maleRecruitCount: form.splitRecruitment ? form.maleRecruitCount : null,
          femaleRecruitCount: form.splitRecruitment ? form.femaleRecruitCount : null,
          recruitCount: form.recruitCount,
          playPurposes: form.playPurposes,
          partnerPreference: form.partnerPreference,
          introduction: form.introduction.trim() || null,
          settlementAccount: form.settlementBank.trim()
            ? { bank: form.settlementBank.trim(), accountNumber: form.settlementAccountNumber.trim(), accountHolder: form.settlementAccountHolder.trim() }
            : null,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "코트 매칭을 열지 못했어요."));
      router.replace(`/matches/${(body as { id: string }).id}`);
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : "코트 매칭을 열지 못했어요.");
    } finally {
      setSaving(false);
    }
  };

  // "미리보기"는 검증만 하고 시트를 연다. 실제 개설은 시트 안의 CTA에서 일어난다.
  const openPreview = () => {
    const message = validateForm();
    if (message) { setError(message); return; }
    setError("");
    setSubmitError("");
    setIsPreviewOpen(true);
  };

  if (!slot) {
    return <main className="grid min-h-svh place-items-center bg-[var(--tm-bg-page)] px-5 text-center text-[var(--tm-text-primary)]">
      {loadError
        ? <div><p className="text-lg font-bold">이 시간으로는 코트 매칭을 열 수 없어요</p><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">{loadError}</p><Button as={Link} className="mt-5" href="/partner-sessions" size="medium">다른 시간 보기</Button></div>
        : <CourtRallyLoader label="선택한 코트 시간을 확인하고 있어요." />}
    </main>;
  }


  return <main className="min-h-svh bg-[#F4F6FA] pb-36 text-[var(--tm-text-primary)]"><section className="mx-auto max-w-[560px] px-5 pt-6">
    <BackButton className="inline-flex size-11 items-center justify-center rounded-full text-xl" fallbackPath={`/partner-sessions/${slot.id}`} />
    <p className="mt-5 text-sm font-semibold text-[var(--tm-action-primary)]">코트 매칭 열기</p>
    <h1 className="mt-1 text-2xl font-bold">함께 칠 메이트를<br />모집해 볼까요?</h1>
    <p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">코트, 시간, 비용은 운영자가 준비한 정보로 고정돼요.</p>

    <section className="mt-6 overflow-hidden rounded-3xl border border-[var(--tm-border-default)] bg-white p-4">
      <CourtMedia alt={`${slot.court.name} 코트 이미지`} className="aspect-[7/3] w-full" fallbackLabel="Rally On 기본 코트 이미지" image={slot.court.image} />
      <p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">🗓 {formatPartnerSchedule(slot.startsAt, slot.endsAt)} · {formatDuration(slot.durationMinutes)}<br />📍 {slot.court.name} · {slot.court.courtNumber}<br />게스트 참가비 {slot.guestFeeKrw.toLocaleString("ko-KR")}원 · 현장 최대 {slot.maxParticipantCount}명</p>
      {slot.usageNote ? <p className="mt-3 rounded-2xl bg-[var(--tm-bg-subtle)] px-3 py-2 text-sm leading-5 text-[var(--tm-text-secondary)]">{slot.usageNote}</p> : null}
    </section>

    <FormPanel description="어떤 스타일로, 몇 명과 함께할까요?" icon={<TennisBall aria-hidden size={23} weight="fill" />} title="게임 설정">
      <fieldset><legend className="mb-3 text-sm font-semibold">게임 유형 <span className="text-[var(--tm-status-error-text)]">*</span></legend>
        <div className="grid grid-cols-2 gap-2">{activeGameTypes.map((value) => <button aria-pressed={form.gameType === value} className={`min-h-12 rounded-xl border text-sm font-semibold ${form.gameType === value ? "border-[var(--tm-action-primary)] bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]" : "border-[var(--tm-border-default)] bg-white"}`} key={value} onClick={() => selectGameType(value)} type="button">{gameTypeLabels[value]}</button>)}</div>
        <p className="mt-3 text-xs leading-5 text-[var(--tm-text-secondary)]">혼복은 혼합 복식, 남복은 남자 복식, 여복은 여자 복식이에요. 프로필의 성별을 기준으로 신청하고, 남녀별 정원 안에서 수락해요.</p>
      </fieldset>

      <div className="mt-6 border-t border-[var(--tm-border-subtle)] pt-5">
        <p className="mb-3 text-sm font-semibold">모집 인원 <span className="font-normal text-[var(--tm-text-secondary)]">(최대 {maxRecruitCount}명)</span></p>
        {!needsGenderQuota(form.gameType) ? <div className="mb-4 flex gap-2">{[false, true].map((split) => <button aria-pressed={form.splitRecruitment === split} className="min-h-11 rounded-xl border border-[var(--tm-border-default)] bg-white px-3 text-sm aria-pressed:border-[var(--tm-action-primary)] aria-pressed:text-[var(--tm-action-primary)]" key={String(split)} onClick={() => setSplitRecruitment(split)} type="button">{split ? "남녀 구분" : "성별 무관"}</button>)}</div> : null}
        {form.splitRecruitment
          ? <div><div className="grid grid-cols-2 gap-3">{([["maleRecruitCount", "남자 모집 인원"], ["femaleRecruitCount", "여자 모집 인원"]] as const).map(([key, label]) => <label className="text-sm font-semibold" key={key}>{label}<select className="mt-2 min-h-12 w-full rounded-xl border border-[var(--tm-border-default)] bg-white px-3 disabled:bg-neutral-100" disabled={key === "maleRecruitCount" ? form.gameType === "WOMENS_DOUBLES" : form.gameType === "MENS_DOUBLES"} onChange={(event) => changeGenderCount(key, Number(event.target.value))} value={form[key]}>{Array.from({ length: maxRecruitCount + 1 }, (_, count) => <option key={count} value={count}>{count}명</option>)}</select></label>)}</div><p className="mt-3 text-xs leading-5 text-[var(--tm-text-secondary)]">추가 모집: 남자 {form.maleRecruitCount}명 · 여자 {form.femaleRecruitCount}명</p></div>
          : <div className="flex items-center justify-between rounded-2xl border border-[var(--tm-border-default)] bg-white p-3">
            <p className="text-sm font-bold">추가 모집 인원</p>
            <div className="flex items-center gap-3">
              <button aria-label="모집 인원 줄이기" className="grid size-10 place-items-center rounded-xl border border-[var(--tm-border-default)] disabled:opacity-40" disabled={form.recruitCount <= 1} onClick={() => updateRecruitCount(-1)} type="button"><Minus aria-hidden size={17} weight="bold" /></button>
              <output aria-label={`추가 모집 인원 ${form.recruitCount}명`} className="min-w-7 text-center text-lg font-bold">{form.recruitCount}</output>
              <button aria-label="모집 인원 늘리기" className="grid size-10 place-items-center rounded-xl bg-[var(--tm-action-primary)] text-white disabled:opacity-40" disabled={form.recruitCount >= maxRecruitCount} onClick={() => updateRecruitCount(1)} type="button"><Plus aria-hidden size={17} weight="bold" /></button>
            </div>
          </div>}
      </div>
    </FormPanel>

    <FormPanel description="최대 두 가지를 골라 주세요." icon={<TennisBall aria-hidden size={23} weight="fill" />} title="원하는 플레이">
      <div className="grid gap-3 sm:grid-cols-2">{purposes.map(([code, label, description]) => <ChoiceCard description={description} key={code} onClick={() => togglePurpose(code)} selected={form.playPurposes.includes(code)}>{label}</ChoiceCard>)}</div>
    </FormPanel>

    <FormPanel description="실력 수치 대신, 함께하고 싶은 분위기를 골라 주세요." icon={<UsersThree aria-hidden size={23} weight="fill" />} title="원하는 상대">
      <div className="grid gap-3">{preferences.map(([value, label, description]) => <ChoiceCard description={description} key={value} onClick={() => set("partnerPreference", value)} selected={form.partnerPreference === value}>{label}</ChoiceCard>)}</div>
    </FormPanel>

    <FormPanel description="처음 신청하는 분도 편하게 알 수 있도록 적어 주세요." title="코트 매칭 소개글 (선택)">
      <FormField>
        <FormLabel>소개글</FormLabel>
        <FormControl>
          <TextArea autoComplete="off" maxLength={300} minRows={6} onChange={(event) => set("introduction", event.target.value)} placeholder="예: 천천히 랠리하면서 즐겁게 연습할 분을 찾아요. 처음 게임을 해봐도 괜찮아요!" value={form.introduction} width="100%" />
        </FormControl>
        <p className="text-right text-xs text-[var(--tm-text-secondary)]">{form.introduction.length} / 300</p>
      </FormField>
      <p className="mt-4 rounded-2xl bg-[var(--tm-bg-subtle)] px-4 py-3 text-sm leading-6 text-[var(--tm-action-hover)]">수락된 참가자와 서비스 내 채팅에서 당일 준비를 조율해요.</p>
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

    <section className="mt-6 rounded-2xl bg-[var(--tm-bg-subtle)] p-4 text-sm leading-6">
      <p className="font-semibold">게스트 참가비 {slot.guestFeeKrw.toLocaleString("ko-KR")}원</p>
      <p className="mt-1 text-[var(--tm-text-secondary)]">운영자가 정한 금액이라 바꿀 수 없어요. Rally On에서 결제하지 않고, 참가자와 직접 정산해요.</p>
    </section>

    {error ? <p className="mt-5 rounded-2xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm leading-6 text-[var(--tm-status-error-text)]" role="alert">{error}</p> : null}

    <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--tm-border-subtle)] bg-white/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      <div className="mx-auto max-w-[560px]"><Button className="!h-14" fullWidth onClick={openPreview} size="large">미리보기</Button></div>
    </footer>

    <PartnerSessionPreviewSheet
      error={submitError}
      form={form}
      onClose={() => setIsPreviewOpen(false)}
      onSubmit={() => void submit()}
      open={isPreviewOpen}
      saving={saving}
      slot={slot}
    />
  </section></main>;
}

// 공개 직전에 실제로 보일 모습을 한 번 확인시킨다. 실제 개설은 이 시트의 CTA에서만 일어난다.
function PartnerSessionPreviewSheet({ error, form, onClose, onSubmit, open, saving, slot }: {
  error: string;
  form: PartnerSessionForm;
  onClose: () => void;
  onSubmit: () => void;
  open: boolean;
  saving: boolean;
  slot: PublicCourtSlot;
}) {
  if (!open) return null;

  return <Modal open onOpenChange={(next) => { if (!next) onClose(); }}>
    <ModalContainer size="large" variant="bottom">
      <ModalNavigation trailingContent={<ModalClose aria-label="미리보기 닫기" />}>미리보기</ModalNavigation>
      <ModalContent>
        <ModalContentItem>
          <ModalDescription>열면 코트 매칭 목록에 보여지고, 참가 신청을 받을 수 있어요.</ModalDescription>
          <article className="mt-4 overflow-hidden rounded-3xl border border-[var(--tm-border-default)] bg-white shadow-[0_12px_30px_rgba(29,50,84,0.08)]">
            <div className="p-5">
              <h2 className="mt-3 text-xl font-bold leading-7">{slot.court.name}</h2>
              <p className="mt-2 text-sm">{form.gameType ? gameTypeLabels[form.gameType] : ""}{form.splitRecruitment ? ` · 남자 ${form.maleRecruitCount}명 / 여자 ${form.femaleRecruitCount}명 모집` : " · 성별 무관"}</p>
              <dl className="mt-5 grid gap-4">
                <PreviewItem icon={<CalendarBlank aria-hidden size={19} weight="fill" />} label="일시" value={`${formatPartnerSchedule(slot.startsAt, slot.endsAt)} · ${formatDuration(slot.durationMinutes)}`} />
                <PreviewItem icon={<MapPin aria-hidden size={19} weight="fill" />} label="코트" value={[slot.court.name, slot.court.courtNumber, slot.court.address].filter(Boolean).join(" · ")} />
                <PreviewItem icon={<UsersThree aria-hidden size={19} weight="fill" />} label="모집" value={`추가 ${form.recruitCount}명 · 현장 최대 ${slot.maxParticipantCount}명`} />
                <PreviewItem icon={<CurrencyKrw aria-hidden size={19} weight="bold" />} label="게스트 참가비" value={`${slot.guestFeeKrw.toLocaleString("ko-KR")}원`} />
              </dl>
              <div className="mt-5 border-t border-[var(--tm-border-subtle)] pt-4">
                <p className="text-sm font-bold">함께하고 싶은 플레이</p>
                <p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">{form.playPurposes.map((purpose) => getLabel(purposes, purpose)).join(" · ")}<br />{getLabel(preferences, form.partnerPreference)}</p>
                {form.partnerPreference === "COMPLETE_BEGINNER_WELCOME" ? <p className="mt-3 inline-flex rounded-full bg-[var(--tm-bg-subtle)] px-3 py-1.5 text-xs font-bold text-[var(--tm-action-primary)]">초보자 환영</p> : null}
                {form.introduction ? <p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">{form.introduction}</p> : null}
              </div>
              {slot.usageNote ? <p className="mt-4 rounded-2xl bg-[var(--tm-bg-subtle)] px-4 py-3 text-sm leading-6 text-[var(--tm-text-secondary)]">{slot.usageNote}</p> : null}
              {form.settlementBank.trim() ? <div className="mt-4 rounded-2xl bg-[var(--tm-bg-subtle)] p-4 text-sm"><p className="font-bold">정산 정보 · 수락된 참가자에게만 공개</p><p className="mt-2 break-all">{form.settlementBank} {form.settlementAccountNumber} · {form.settlementAccountHolder}</p></div> : null}
              <p className="mt-5 rounded-2xl bg-[var(--tm-bg-subtle)] px-4 py-3 text-xs leading-5 text-[var(--tm-text-secondary)]">참가비는 Rally On에서 결제하지 않아요. 참가자와 직접 정산해요.</p>
            </div>
          </article>
          {error ? <p className="mt-4 rounded-2xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm leading-6 text-[var(--tm-status-error-text)]" role="alert">{error}</p> : null}
        </ModalContentItem>
      </ModalContent>

      <ActionArea variant="strong">
        <ActionAreaButton disabled={saving} onClick={onSubmit} variant="main">{saving ? "여는 중…" : "이 시간으로 코트 매칭 열기"}</ActionAreaButton>
      </ActionArea>
    </ModalContainer>
  </Modal>;
}

function FormPanel({ children, description, icon, title }: { children: ReactNode; description: string; icon?: ReactNode; title: ReactNode }) {
  return <section className="mt-6 rounded-3xl bg-white p-5 shadow-[0_10px_30px_rgba(29,50,84,0.06)]"><div className="flex gap-3">{icon ? <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]">{icon}</span> : null}<div><h2 className="text-lg font-bold">{title}</h2><p className="mt-1 text-sm leading-6 text-[var(--tm-text-secondary)]">{description}</p></div></div><div className="mt-5">{children}</div></section>;
}

function ChoiceCard({ children, description, onClick, selected }: { children: ReactNode; description: string; onClick: () => void; selected: boolean }) {
  return <button aria-pressed={selected} className={`relative min-h-[78px] rounded-2xl border p-4 pr-11 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tm-action-primary)] ${selected ? "border-[var(--tm-action-primary)] bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]" : "border-[var(--tm-border-default)] bg-white text-[var(--tm-text-primary)] hover:border-[var(--tm-action-primary)]"}`} onClick={onClick} type="button"><strong className="text-sm">{children}</strong><span className="mt-1 block text-xs font-normal leading-5 text-[var(--tm-text-secondary)]">{description}</span>{selected ? <CheckCircle aria-label="선택됨" className="absolute right-4 top-4" size={20} weight="fill" /> : null}</button>;
}

function PreviewItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="flex gap-3"><span className="mt-0.5 text-[var(--tm-action-primary)]">{icon}</span><div><dt className="text-xs font-bold text-[var(--tm-text-secondary)]">{label}</dt><dd className="mt-1 text-sm leading-5 text-[var(--tm-text-primary)]">{value}</dd></div></div>;
}

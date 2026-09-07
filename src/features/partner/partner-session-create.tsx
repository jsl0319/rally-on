"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { BackButton } from "@/components/navigation/back-button";
import { Button } from "@/components/ui/button";
import { CourtMedia } from "@/features/matches/court-media";

import { apiMessage, formatPartnerSchedule, type PublicCourtSlot } from "./partner-session";

const purposes = [
  ["CASUAL_HIT", "편하게 공 주고받기"],
  ["RALLY_PRACTICE", "랠리"],
  ["STROKE_PRACTICE", "스트로크 연습"],
  ["GAME_INTRO", "게임 입문"],
  ["GAME", "게임"],
] as const;

const preferences = [
  ["COMPLETE_BEGINNER_WELCOME", "완전 초보도 좋아요"],
  ["SIMILAR_LEVEL", "비슷한 수준이면 좋아요"],
  ["GAME_CAPABLE", "게임 가능한 분을 찾고 있어요"],
] as const;

type AvailableSlotResponse = { items: PublicCourtSlot[] };

export function PartnerSessionCreate({ slotId }: { slotId: string }) {
  const router = useRouter();
  const [slot, setSlot] = useState<PublicCourtSlot | null>(null);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    clientRequestId: crypto.randomUUID(),
    recruitCount: 1,
    playPurposes: ["RALLY_PRACTICE"],
    partnerPreference: "COMPLETE_BEGINNER_WELCOME",
    introduction: "",
  }));

  const load = useCallback(async () => {
    try {
      setLoadError("");
      const response = await fetch("/api/v1/partner-session-slots/available", { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "세션을 열 수 있는 코트 시간을 불러오지 못했어요."));
      const selectedSlot = (body as AvailableSlotResponse).items.find((item) => item.id === slotId) ?? null;
      if (!selectedSlot) throw new Error("선택한 코트 시간은 이미 다른 세션에 연결됐거나 더 이상 열 수 없어요.");
      setSlot(selectedSlot);
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "세션을 열 수 있는 코트 시간을 불러오지 못했어요.");
    }
  }, [slotId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));
  const togglePurpose = (purpose: string) => setForm((current) => current.playPurposes.includes(purpose)
    ? { ...current, playPurposes: current.playPurposes.filter((item) => item !== purpose) }
    : current.playPurposes.length < 2 ? { ...current, playPurposes: [...current.playPurposes, purpose] } : current);

  const submit = async () => {
    setSubmitError("");
    if (!slot) return;
    if (form.playPurposes.length === 0) return setSubmitError("원하는 플레이를 확인해 주세요.");
    if (form.recruitCount < 1 || form.recruitCount + 1 > slot.maxParticipantCount) return setSubmitError(`추가 모집 인원은 ${Math.max(slot.maxParticipantCount - 1, 0)}명까지 선택할 수 있어요.`);

    setSaving(true);
    try {
      const response = await fetch("/api/v1/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRequestId: form.clientRequestId,
          courtSource: "PARTNER_COURT",
          courtSlotId: slot.id,
          recruitCount: form.recruitCount,
          playPurposes: form.playPurposes,
          partnerPreference: form.partnerPreference,
          introduction: form.introduction || null,
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

  if (!slot) return <main className="grid min-h-svh place-items-center bg-[var(--tm-bg-page)] px-5 text-center text-[var(--tm-text-primary)]">{loadError ? <div><p className="text-lg font-bold">이 시간으로는 세션을 열 수 없어요</p><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">{loadError}</p><Button as={Link} className="mt-5" href="/partner-sessions" size="medium">다른 시간 보기</Button></div> : <CourtRallyLoader label="선택한 코트 시간을 확인하고 있어요." />}</main>;

  const estimatedFee = Math.ceil(slot.totalCourtFeeKrw / (form.recruitCount + 1));
  const maxRecruitCount = Math.max(slot.maxParticipantCount - 1, 1);
  return <main className="min-h-svh bg-[var(--tm-bg-page)] px-5 pb-28 pt-6 text-[var(--tm-text-primary)]"><section className="mx-auto max-w-[560px]"><BackButton className="inline-flex size-11 items-center justify-center rounded-full text-xl" fallbackPath={`/partner-sessions/${slot.id}`} />
    <p className="mt-5 text-sm font-semibold text-[var(--tm-action-primary)]">코트 매칭 열기</p><h1 className="mt-1 text-2xl font-bold">함께 칠 메이트를<br />모집해 볼까요?</h1><p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">코트, 시간, 비용은 운영자가 준비한 정보로 고정돼요.</p>
    <section className="mt-6 overflow-hidden rounded-3xl border border-[var(--tm-border-default)] bg-white p-4"><CourtMedia alt={`${slot.court.name} 코트 이미지`} className="aspect-[7/3] w-full" fallbackLabel="Rally On 기본 코트 이미지" image={slot.court.image} /><p className="mt-4 text-sm font-semibold text-[var(--tm-action-primary)]">Rally On에서 준비한 코트예요</p><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">🗓 {formatPartnerSchedule(slot.startsAt, slot.endsAt)}<br />📍 {slot.court.name} · {slot.court.courtNumber}<br />전체 {slot.totalCourtFeeKrw.toLocaleString("ko-KR")}원 · 현장 최대 {slot.maxParticipantCount}명</p>{slot.usageNote ? <p className="mt-3 rounded-2xl bg-[var(--tm-bg-subtle)] px-3 py-2 text-sm leading-5 text-[var(--tm-text-secondary)]">{slot.usageNote}</p> : null}</section>
    <FormFields>
      <label>추가 모집 인원 <span className="font-normal text-[var(--tm-text-secondary)]">(최대 {maxRecruitCount}명)</span><input max={maxRecruitCount} min="1" onChange={(event) => update("recruitCount", Number(event.target.value))} type="number" value={form.recruitCount} /></label>
    </FormFields>
    <p className="mt-6 text-sm font-semibold">원하는 플레이 <span className="font-normal text-[var(--tm-text-secondary)]">(최대 2개)</span></p><div className="mt-3 grid gap-2">{purposes.map(([code, label]) => <SelectCard key={code} selected={form.playPurposes.includes(code)} onClick={() => togglePurpose(code)}>{label}</SelectCard>)}</div>
    <p className="mt-6 text-sm font-semibold">원하는 상대</p><div className="mt-3 grid gap-2">{preferences.map(([code, label]) => <SelectCard key={code} selected={form.partnerPreference === code} onClick={() => update("partnerPreference", code)}>{label}</SelectCard>)}</div>
    <FormFields><label>소개 <span className="font-normal text-[var(--tm-text-secondary)]">(선택)</span><textarea maxLength={300} onChange={(event) => update("introduction", event.target.value)} value={form.introduction} /></label><p className="rounded-2xl bg-[var(--tm-bg-subtle)] px-4 py-3 text-sm leading-6 text-[var(--tm-action-hover)]">수락된 참가자와 서비스 내 채팅에서 당일 준비를 조율해요.</p></FormFields>
    <section className="mt-5 rounded-2xl bg-[var(--tm-bg-subtle)] p-4 text-sm leading-6"><p className="font-semibold">예상 1인 비용 약 {estimatedFee.toLocaleString("ko-KR")}원</p><p className="mt-1 text-[var(--tm-text-secondary)]">모집자를 포함한 예상 {form.recruitCount + 1}명 기준이에요. Rally On에서 결제하지 않아요.</p></section>
    {submitError ? <p className="mt-5 rounded-2xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm leading-6 text-[var(--tm-status-error-text)]">{submitError}</p> : null}
    <Button className="mt-6" disabled={saving} fullWidth loading={saving} onClick={() => void submit()}>이 시간으로 코트 매칭 열기</Button>
  </section></main>;
}

function SelectCard({ children, onClick, selected }: { children: React.ReactNode; onClick: () => void; selected: boolean }) {
  return <button aria-pressed={selected} className={`min-h-12 rounded-2xl border px-4 py-3 text-left text-sm font-semibold ${selected ? "border-[var(--tm-action-primary)] bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]" : "border-[var(--tm-border-default)] bg-white"}`} onClick={onClick} type="button">{children}</button>;
}

function FormFields({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 grid gap-4 [&_input]:mt-2 [&_input]:h-12 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-[var(--tm-border-default)] [&_input]:bg-white [&_input]:px-3 [&_textarea]:mt-2 [&_textarea]:min-h-24 [&_textarea]:w-full [&_textarea]:rounded-xl [&_textarea]:border [&_textarea]:border-[var(--tm-border-default)] [&_textarea]:bg-white [&_textarea]:p-3 [&_label]:text-sm [&_label]:font-semibold">{children}</div>;
}

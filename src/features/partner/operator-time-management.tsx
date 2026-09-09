"use client";

import { ActionArea, ActionAreaButton, FormControl, FormField, FormLabel, Modal, ModalClose, ModalContainer, ModalContent, ModalContentItem, ModalHeading, ModalNavigation, ModalSummary, SearchField, TextArea, TextField } from "@wanteddev/wds";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { Button } from "@/components/ui/button";
import { activeGameTypes, gameTypeLabels, type ActiveGameType } from "@/matches/game-type";
import { needsGenderQuota } from "@/matches/recruitment";

type Application = {
  status: "DRAFT_ACCESS_GRANTED" | "PUBLISH_APPROVED" | "VERIFYING" | "UNDER_REVIEW" | "REVIEW_REQUIRED" | "CHANGES_REQUESTED" | "REJECTED" | "SUSPENDED" | "DRAFT";
  statusLabel: string;
  venue: { name: string; address: string };
  canCreatePrivateDraft: boolean;
  canPublish: boolean;
};

type Court = {
  id: string;
  name: string;
  address: string;
  settlementAccount: { bank: string; accountNumber: string; accountHolder: string } | null;
  region: { code: string; name: string };
  units: Array<{ id: string; name: string }>;
};

type SlotStatus = "DRAFT" | "AVAILABLE" | "ALLOCATED" | "ENDED" | "BLOCKED" | "CANCELLED";

type Slot = {
  id: string;
  visibility: "PRIVATE" | "PUBLIC";
  status: SlotStatus;
  statusLabel: string;
  statusChangedAt: string;
  startsAt: string;
  endsAt: string;
  guestFeeKrw: number;
  maxParticipantCount: number;
  minParticipantCount: number;
  gameType: { code: string; label: string } | null;
  genderCapacity: { male: number; female: number } | null;
  approvalMode: "AUTO" | "OPERATOR";
  usageNote: string | null;
  court: { id: string; name: string; address: string; courtNumber: string; region: { code: string; name: string } };
  session: { matchId: string; status: string } | null;
  actions: { pendingApproval: number; depositToConfirm: number; refundToComplete: number; confirmed: number };
  version: number;
};

/** 운영자가 지금 눌러야 할 것이 있는 건수. */
function pendingActionCount(slot: Slot) {
  return slot.actions.pendingApproval + slot.actions.depositToConfirm + slot.actions.refundToComplete;
}

type SlotResponse = {
  items: Slot[];
  supplyRestriction: { active: boolean; triggeredAt?: string; reasonCode?: string };
};

type Region = { code: string; name: string; parentName: string | null };

const statusFilters: Array<{ value: "ALL" | SlotStatus; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: "DRAFT", label: "초안" },
  { value: "AVAILABLE", label: "공개 중" },
  // ALLOCATED는 옛 모델(모집자가 슬롯을 배정받던 방식)의 기록에만 남아 있어 필터에서 뺐다.
];

function errorMessage(body: unknown, fallback: string) {
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string"
    ? body.error.message
    : fallback;
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(errorMessage(body, "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."));
  return body as T;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function dateTimeParts(value: string) {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => values.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

function toKstIso(date: string, time: string) {
  return new Date(`${date}T${time}:00+09:00`).toISOString();
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-svh bg-[var(--tm-bg-page)] px-5 pb-28 pt-8 text-[var(--tm-text-primary)]"><div className="mx-auto max-w-[560px]">{children}</div></main>;
}

function BackLink({ href }: { href: string }) {
  return <Link aria-label="이전 화면으로 돌아가기" className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--tm-text-secondary)]" href={href}>← 돌아가기</Link>;
}

function LoadingOrError({ error, label, onRetry }: { error: string; label: string; onRetry: () => void }) {
  if (!error) return <CourtRallyLoader label={label} />;
  return <section className="mt-12 rounded-3xl border border-[var(--tm-border-default)] bg-white p-5 text-center"><h1 className="text-lg font-bold">불러오지 못했어요</h1><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">{error}</p><Button className="mt-5" onClick={onRetry} size="medium">다시 불러오기</Button></section>;
}

function StatusPill({ slot }: { slot: Slot }) {
  const color = slot.status === "AVAILABLE" ? "bg-[var(--tm-bg-highlight)] text-[var(--tm-tennis-ball-muted)]" : slot.status === "ALLOCATED" ? "bg-[var(--tm-action-primary)] text-white" : slot.status === "DRAFT" ? "bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]" : "bg-[var(--tm-bg-subtle-muted)] text-[var(--tm-text-secondary)]";
  return <span className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-semibold ${color}`}>{slot.statusLabel}</span>;
}

function RestrictionNotice({ restriction }: { restriction: SlotResponse["supplyRestriction"] }) {
  if (!restriction.active) return null;
  return <section className="mt-5 rounded-3xl border border-[var(--tm-tennis-ball)] bg-[var(--tm-bg-highlight)] p-5"><p className="text-sm font-bold text-[var(--tm-text-primary)]">새 시간 공개가 일시 중지됐어요</p><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">최근 운영상 철회를 확인하고 있어요. 이미 연결된 다른 세션은 그대로 유지되며, 검토가 끝날 때까지 새 시간은 공개할 수 없어요.</p></section>;
}

function useOperatorSlots() {
  const [application, setApplication] = useState<Application | null>(null);
  const [slotData, setSlotData] = useState<SlotResponse | null>(null);
  const [court, setCourt] = useState<Court | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setError("");
      const [nextApplication, nextSlots, nextCourts] = await Promise.all([
        requestJson<Application>("/api/v1/operator-applications/me"),
        requestJson<SlotResponse>("/api/v1/operator/slots"),
        requestJson<{ items: Court[] }>("/api/v1/operator/courts"),
      ]);
      setApplication(nextApplication);
      setSlotData(nextSlots);
      setCourt(nextCourts.items[0] ?? null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "운영자 정보를 불러오지 못했어요.");
    }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  return { application, slotData, court, error, load };
}

export function OperatorDashboard() {
  const { application, slotData, court, error, load } = useOperatorSlots();
  const [loadedAt] = useState(() => Date.now());
  if (!application || !slotData) return <PageShell><LoadingOrError error={error} label="운영 현황을 준비하고 있어요." onRetry={() => void load()} /></PageShell>;

  if (!application.canCreatePrivateDraft) {
    return <PageShell><p className="text-sm font-semibold text-[var(--tm-action-primary)]">운영 홈</p><h1 className="mt-2 text-2xl font-bold">운영자 확인이 필요해요</h1><p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">{application.statusLabel} 상태에서는 시간대를 관리할 수 없어요. 심사 상태를 먼저 확인해 주세요.</p><Button as={Link} className="mt-6" href="/partner/application" size="medium">심사 상태 보기</Button></PageShell>;
  }

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const openToday = slotData.items.filter((slot) => slot.session && dateTimeParts(slot.startsAt).date === today).length;
  const openThisWeek = slotData.items.filter((slot) => slot.session && new Date(slot.startsAt).getTime() < loadedAt + 7 * 24 * 60 * 60 * 1000).length;
  const draftCount = slotData.items.filter((slot) => slot.status === "DRAFT").length;
  const depositToConfirm = slotData.items.reduce((sum, slot) => sum + slot.actions.depositToConfirm, 0);
  const pendingApproval = slotData.items.reduce((sum, slot) => sum + slot.actions.pendingApproval, 0);
  const refundToComplete = slotData.items.reduce((sum, slot) => sum + slot.actions.refundToComplete, 0);
  const needsAction = slotData.items.filter((slot) => slot.session && pendingActionCount(slot) > 0);
  const attentionCount = slotData.items.filter((slot) => slot.status === "BLOCKED" || slot.status === "CANCELLED").length;
  return <PageShell>
    <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-[var(--tm-action-primary)]">운영 홈</p><h1 className="mt-2 text-2xl font-bold">{application.venue.name}</h1><p className="mt-2 text-sm text-[var(--tm-text-secondary)]">시간 공급과 참가자 모집은 따로 관리돼요.</p></div><Button as={Link} href="/partner/application" size="medium" variant="secondary">심사 상태</Button></div>
    <RestrictionNotice restriction={slotData.supplyRestriction} />
    {needsAction.length ? <section className="mt-6 rounded-3xl border border-[var(--tm-action-primary)] bg-white p-5">
      <p className="text-sm font-semibold text-[var(--tm-action-primary)]">지금 처리할 일</p>
      <p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">{[
        depositToConfirm ? `입금 확인 ${depositToConfirm}건` : null,
        pendingApproval ? `승인 대기 ${pendingApproval}건` : null,
        refundToComplete ? `환불 ${refundToComplete}건` : null,
      ].filter(Boolean).join(" · ")}</p>
      <div className="mt-4 grid gap-2">{needsAction.slice(0, 3).map((slot) => <Button as={Link} fullWidth href={`/partner/court-matches/${encodeURIComponent(slot.session?.matchId ?? "")}`} key={slot.id} size="medium" variant="secondary">{formatDate(slot.startsAt)} {formatTime(slot.startsAt)} · {pendingActionCount(slot)}건</Button>)}</div>
      {needsAction.length > 3 ? <p className="mt-3 text-xs text-[var(--tm-text-secondary)]">그 외 {needsAction.length - 3}개의 코트 매칭에도 처리할 일이 있어요.</p> : null}
    </section> : null}
    <section className="mt-6 grid grid-cols-3 gap-3"><SummaryCard label="오늘 코트 매칭" value={`${openToday}개`} /><SummaryCard label="이번 주 공개" value={`${openThisWeek}개`} /><SummaryCard label={draftCount ? "작성 중 초안" : "확인 필요"} value={`${draftCount || attentionCount}개`} /></section>
    <section className="mt-6 rounded-3xl border border-[var(--tm-border-default)] bg-white p-5"><p className="text-sm font-semibold text-[var(--tm-action-primary)]">시간대 운영 원칙</p><h2 className="mt-2 text-lg font-bold">공개한 시간은 바로 바꾸지 않아요</h2><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">등록 실수는 공개 중지 후 새 초안으로 정정해요. 이미 세션에 연결된 시간은 운영상 문제 접수로만 안내할 수 있어요.</p></section>
    {court && !court.settlementAccount ? <section className="mt-6 rounded-3xl bg-[var(--tm-status-error-bg)] p-5"><p className="font-bold text-[var(--tm-status-error-text)]">입금 계좌를 먼저 등록해 주세요</p><p className="mt-2 text-sm leading-6 text-[var(--tm-status-error-text)]">참가비를 계좌이체로 받기 때문에, 계좌가 없으면 코트 매칭을 공개할 수 없어요.</p><Button as={Link} className="mt-4" href="/partner/settlement-account" size="medium" variant="secondary">입금 계좌 등록하기</Button></section> : null}
    <div className="mt-6 grid gap-3"><Button as={Link} fullWidth href="/partner/slots/new">시간 등록하기</Button><Button as={Link} fullWidth href="/partner/slots" variant="secondary">시간 관리 보기</Button><Button as={Link} fullWidth href="/partner/settlement-account" variant="secondary">입금 계좌 관리</Button>{application.canPublish ? <Button as={Link} fullWidth href="/partner/court-photos" variant="secondary">대표 코트 사진 관리</Button> : null}</div>
  </PageShell>;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <section className="rounded-2xl bg-white p-4 shadow-[0_4px_14px_rgba(49,94,158,0.05)]"><p className="text-xs leading-5 text-[var(--tm-text-secondary)]">{label}</p><p className="mt-2 text-lg font-bold">{value}</p></section>;
}

export function OperatorSlotList() {
  const { application, slotData, error, load } = useOperatorSlots();
  const [filter, setFilter] = useState<"ALL" | SlotStatus>("ALL");
  const [runningId, setRunningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [incidentSlot, setIncidentSlot] = useState<Slot | null>(null);
  if (!application || !slotData) return <PageShell><BackLink href="/partner" /><LoadingOrError error={error} label="시간 목록을 준비하고 있어요." onRetry={() => void load()} /></PageShell>;
  const slots = filter === "ALL" ? slotData.items : slotData.items.filter((slot) => slot.status === filter);
  const changeStatus = async (slot: Slot, action: "publish" | "block") => {
    const isCancelledSession = slot.session?.status === "CANCELLED";
    const confirmation = isCancelledSession
      ? "세션 모집자가 취소한 시간이에요. 실제 공급 가능 여부를 확인했나요? 이 시간을 중지하면 자동으로 다시 열리지 않으며, 새 초안을 별도로 등록해야 해요."
      : "이 시간의 새 세션 연결을 중지할까요? 다시 공개할 수 없으며, 정정하려면 새 초안을 등록해야 해요.";
    if (action === "block" && !window.confirm(confirmation)) return;
    setRunningId(slot.id); setActionError("");
    try {
      await requestJson(`/api/v1/operator/slots/${encodeURIComponent(slot.id)}/${action}`, { method: "POST" });
      await load();
    } catch (caught) { setActionError(caught instanceof Error ? caught.message : "시간 상태를 변경하지 못했어요."); } finally { setRunningId(null); }
  };
  return <PageShell>
    <BackLink href="/partner" />
    <div className="mt-4 flex items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[var(--tm-action-primary)]">시간 관리</p><h1 className="mt-1 text-2xl font-bold">모집 가능한 시간을 관리해요</h1></div><Button as={Link} href="/partner/slots/new" size="medium">시간 등록</Button></div>
    <p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">코트 예약 요청을 받는 화면이 아니에요. 공개된 시간은 일반 모집자가 세션을 여는 데만 사용해요.</p>
    <RestrictionNotice restriction={slotData.supplyRestriction} />
    <div className="-mx-5 mt-5 flex gap-2 overflow-x-auto px-5 pb-1" role="group" aria-label="시간 상태 필터">{statusFilters.map((item) => <button aria-pressed={filter === item.value} className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold ${filter === item.value ? "bg-[var(--tm-action-primary)] text-white" : "border border-[var(--tm-border-default)] bg-white text-[var(--tm-text-secondary)]"}`} key={item.value} onClick={() => setFilter(item.value)} type="button">{item.label}</button>)}</div>
    {actionError ? <p className="mt-4 rounded-2xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm text-[var(--tm-status-error-text)]" role="alert">{actionError}</p> : null}
    {slots.length ? <div className="mt-5 grid gap-4">{slots.map((slot) => <SlotCard application={application} disabled={runningId === slot.id || slotData.supplyRestriction.active} key={slot.id} slot={slot} onBlock={() => void changeStatus(slot, "block")} onIncident={() => setIncidentSlot(slot)} onPublish={() => void changeStatus(slot, "publish")} />)}</div> : <section className="mt-8 rounded-3xl border border-dashed border-[var(--tm-border-strong)] bg-white px-5 py-12 text-center"><p className="text-lg font-bold">아직 등록한 시간이 없어요</p><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">코트 면, 이용 시간과 전체 비용을 초안으로 먼저 적어 보세요.</p><Button as={Link} className="mt-5" href="/partner/slots/new" size="medium">첫 시간 등록하기</Button></section>}
    {incidentSlot ? <SupplyIncidentSheet slot={incidentSlot} onClose={() => setIncidentSlot(null)} onDone={async () => { setIncidentSlot(null); await load(); }} /> : null}
  </PageShell>;
}

function SlotCard({ application, disabled, slot, onPublish, onBlock, onIncident }: { application: Application; disabled: boolean; slot: Slot; onPublish: () => void; onBlock: () => void; onIncident: () => void }) {
  const isCancelledSession = slot.session?.status === "CANCELLED";
  return <section className="rounded-3xl border border-[var(--tm-border-default)] bg-white p-5 shadow-[0_4px_14px_rgba(49,94,158,0.05)]"><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-[var(--tm-text-secondary)]">{slot.court.name} · {slot.court.courtNumber}</p><h2 className="mt-1 text-lg font-bold">{formatDate(slot.startsAt)} · {formatTime(slot.startsAt)}–{formatTime(slot.endsAt)}</h2></div><StatusPill slot={slot} /></div><div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-[var(--tm-bg-subtle-muted)] p-3 text-sm"><p><span className="block text-xs text-[var(--tm-text-secondary)]">게스트 참가비</span><span className="mt-1 block font-semibold">{slot.guestFeeKrw.toLocaleString("ko-KR")}원</span></p><p><span className="block text-xs text-[var(--tm-text-secondary)]">모집 정원</span><span className="mt-1 block font-semibold">{slot.genderCapacity ? `남 ${slot.genderCapacity.male} · 여 ${slot.genderCapacity.female}명` : `${slot.maxParticipantCount}명`}</span></p><p><span className="block text-xs text-[var(--tm-text-secondary)]">최소 인원</span><span className="mt-1 block font-semibold">{slot.minParticipantCount}명</span></p><p><span className="block text-xs text-[var(--tm-text-secondary)]">{slot.gameType ? "경기 유형" : "승인"}</span><span className="mt-1 block font-semibold">{slot.gameType ? slot.gameType.label : slot.approvalMode === "AUTO" ? "자동" : "직접"}</span></p></div>{slot.usageNote ? <p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">{slot.usageNote}</p> : null}<p className="mt-3 text-xs text-[var(--tm-text-secondary)]">상태 갱신 {formatDateTime(slot.statusChangedAt)}</p>{slot.status === "DRAFT" ? <div className="mt-5 grid grid-cols-2 gap-3"><Button as={Link} fullWidth href={`/partner/slots/${encodeURIComponent(slot.id)}/edit`} size="medium" variant="secondary">초안 수정</Button><Button disabled={!application.canPublish || disabled} fullWidth onClick={onPublish} size="medium">{application.canPublish ? "공개하기" : "심사 후 공개"}</Button></div> : null}{slot.session && pendingActionCount(slot) > 0 ? <p className="mt-3 rounded-2xl bg-[var(--tm-bg-highlight)] px-4 py-3 text-sm font-semibold leading-6 text-[var(--tm-text-primary)]">{[
      slot.actions.depositToConfirm ? `입금 확인 ${slot.actions.depositToConfirm}건` : null,
      slot.actions.pendingApproval ? `승인 대기 ${slot.actions.pendingApproval}건` : null,
      slot.actions.refundToComplete ? `환불 ${slot.actions.refundToComplete}건` : null,
    ].filter(Boolean).join(" · ")}</p> : null}{slot.status === "AVAILABLE" ? <div className="mt-5 grid gap-3">{slot.session ? <Button as={Link} fullWidth href={`/partner/court-matches/${encodeURIComponent(slot.session.matchId)}`} size="medium">참가자 관리{pendingActionCount(slot) > 0 ? ` (${pendingActionCount(slot)})` : ""}</Button> : null}{slot.session && !isCancelledSession ? null : <Button disabled={disabled} fullWidth onClick={onBlock} size="medium" variant="secondary">공개 중지 · 새 초안으로 정정</Button>}</div> : null}{slot.session && !isCancelledSession ? <div className="mt-5 rounded-2xl bg-[var(--tm-bg-subtle)] p-4"><p className="text-sm font-semibold text-[var(--tm-action-primary)]">참가자를 모집 중인 코트 매칭이에요</p><p className="mt-1 text-sm leading-6 text-[var(--tm-text-secondary)]">시간·비용·코트를 바꿀 수 없어요. 실제로 코트를 쓸 수 없게 되면 운영상 문제를 접수해 주세요. 코트 매칭이 취소되고 참가자에게 안내돼요.</p><Button className="mt-3" fullWidth onClick={onIncident} size="medium" variant="secondary">운영상 문제 접수</Button></div> : null}{isCancelledSession ? <div className="mt-5 rounded-2xl bg-[var(--tm-bg-highlight)] p-4"><p className="text-sm font-semibold text-[var(--tm-text-primary)]">세션 모집자가 취소했어요</p><p className="mt-1 text-sm leading-6 text-[var(--tm-text-secondary)]">자동으로 다시 열지 않아요. 실제 공급 가능 여부를 확인한 뒤 이 시간을 중지하면 새 초안을 등록할 수 있어요.</p><Button className="mt-3" disabled={disabled} fullWidth onClick={onBlock} size="medium" variant="secondary">확인 후 이 시간 중지</Button></div> : null}{slot.status === "BLOCKED" ? <p className="mt-5 rounded-2xl bg-[var(--tm-bg-subtle)] px-4 py-3 text-sm leading-6 text-[var(--tm-text-secondary)]">이 시간은 공개 중지 상태예요. 같은 정보를 정정하려면 새 초안을 등록해 주세요.</p> : null}{slot.status === "CANCELLED" ? <p className="mt-5 rounded-2xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm leading-6 text-[var(--tm-status-error-text)]">운영상 공급 철회로 연결 세션이 취소됐어요. 이 기록은 다시 공개하지 않아요.</p> : null}</section>;
}

function SupplyIncidentSheet({ slot, onClose, onDone }: { slot: Slot; onClose: () => void; onDone: () => Promise<void> }) {
  const [code, setCode] = useState<"INFORMATION_REVIEW" | "SCHEDULE_UNAVAILABLE" | "FACILITY_CLOSED" | "SAFETY_RISK" | "NATURAL_DISASTER">("INFORMATION_REVIEW");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const isReview = code === "INFORMATION_REVIEW";
  const submit = async () => {
    setSubmitting(true); setError("");
    try {
      await requestJson(`/api/v1/operator/slots/${encodeURIComponent(slot.id)}/supply-incidents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, expectedVersion: slot.version }) });
      await onDone();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "운영상 문제를 접수하지 못했어요."); } finally { setSubmitting(false); }
  };
  return <Modal open onOpenChange={(next) => { if (!next) onClose(); }}>
    <ModalContainer variant="bottom">
      <ModalNavigation trailingContent={<ModalClose aria-label="닫기" />} />
      <ModalContent>
        <ModalContentItem>
          <ModalSummary>운영상 문제 접수</ModalSummary>
          <ModalHeading>시간을 바로 바꾸지 않아요</ModalHeading>
        </ModalContentItem>
        {confirming ? (
          <ModalContentItem>
            <section className="rounded-3xl bg-[var(--tm-status-error-bg)] p-5"><h3 className="font-bold">연결된 세션을 취소할까요?</h3><p className="mt-2 text-sm leading-6 text-[var(--tm-status-error-text)]">연결된 세션이 취소되고 모집자와 신청자에게 앱 안에서 안내돼요. 시간을 다른 때로 바꾸는 기능은 아니에요.</p></section>
            {error ? <p className="mt-4 text-sm text-[var(--tm-status-error-text)]">{error}</p> : null}
          </ModalContentItem>
        ) : (
          <ModalContentItem>
            <p className="text-sm leading-6 text-[var(--tm-text-secondary)]">{slot.court.name} · {formatDateTime(slot.startsAt)} 시간에 어떤 도움이 필요한지 골라 주세요.</p>
            <div className="mt-2 grid gap-2"><IncidentOption checked={code === "INFORMATION_REVIEW"} description="시간과 연결된 세션은 그대로 두고 운영 검토에 접수해요." label="일반 오류·문의" onClick={() => setCode("INFORMATION_REVIEW")} /><IncidentOption checked={code === "SCHEDULE_UNAVAILABLE"} description="등록한 시간에 실제 코트 공급이 불가해요." label="등록한 시간이 실제로 불가함" onClick={() => setCode("SCHEDULE_UNAVAILABLE")} /><IncidentOption checked={code === "FACILITY_CLOSED"} description="시설 운영이 중단되어 세션을 진행할 수 없어요." label="시설 폐쇄" onClick={() => setCode("FACILITY_CLOSED")} /><IncidentOption checked={code === "SAFETY_RISK"} description="안전상 이유로 코트를 제공할 수 없어요." label="안전 위험" onClick={() => setCode("SAFETY_RISK")} /><IncidentOption checked={code === "NATURAL_DISASTER"} description="재난·기상 등으로 코트를 제공할 수 없어요." label="재난·기상" onClick={() => setCode("NATURAL_DISASTER")} /></div>
            {error ? <p className="mt-4 text-sm text-[var(--tm-status-error-text)]">{error}</p> : null}
          </ModalContentItem>
        )}
      </ModalContent>
      {confirming ? (
        <ActionArea variant="neutral">
          <ActionAreaButton buttonColor="assistive" disabled={submitting} onClick={() => setConfirming(false)} variant="alternative">돌아가기</ActionAreaButton>
          <button className="min-h-[52px] flex-1 rounded-2xl bg-[var(--tm-status-error-text)] text-sm font-semibold text-white disabled:opacity-50" disabled={submitting} onClick={() => void submit()} type="button">{submitting ? "처리 중…" : "세션 취소·안내"}</button>
        </ActionArea>
      ) : (
        <ActionArea variant="strong">
          <ActionAreaButton disabled={submitting} loading={submitting} onClick={() => isReview ? void submit() : setConfirming(true)} variant="main">{isReview ? "운영 검토에 접수" : "긴급 철회 내용 확인"}</ActionAreaButton>
        </ActionArea>
      )}
    </ModalContainer>
  </Modal>;
}

function IncidentOption({ checked, description, label, onClick }: { checked: boolean; description: string; label: string; onClick: () => void }) {
  return <button aria-pressed={checked} className={`rounded-2xl border p-4 text-left ${checked ? "border-[var(--tm-action-primary)] bg-[var(--tm-bg-subtle)]" : "border-[var(--tm-border-default)] bg-white"}`} onClick={onClick} type="button"><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-sm leading-5 text-[var(--tm-text-secondary)]">{description}</span></button>;
}

type SlotDraft = { courtUnitName: string; date: string; startsAt: string; endsAt: string; priceKrw: string; maxParticipantCount: string; minParticipantCount: string; gameType: ActiveGameType | ""; maleCapacity: string; femaleCapacity: string; approvalMode: "AUTO" | "OPERATOR"; usageNote: string };

const emptyDraft: SlotDraft = { courtUnitName: "", date: "", startsAt: "", endsAt: "", priceKrw: "", maxParticipantCount: "4", minParticipantCount: "2", gameType: "", maleCapacity: "2", femaleCapacity: "2", approvalMode: "AUTO", usageNote: "" };

export function OperatorSlotForm({ slotId }: { slotId?: string }) {
  const router = useRouter();
  const [application, setApplication] = useState<Application | null>(null);
  const [courts, setCourts] = useState<Court[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [draft, setDraft] = useState<SlotDraft>(emptyDraft);
  const [regionQuery, setRegionQuery] = useState("");
  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const slot = useMemo(() => slots.find((item) => item.id === slotId) ?? null, [slotId, slots]);
  const load = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const [nextApplication, courtResponse, slotResponse] = await Promise.all([
        requestJson<Application>("/api/v1/operator-applications/me"),
        requestJson<{ items: Court[] }>("/api/v1/operator/courts"),
        requestJson<SlotResponse>("/api/v1/operator/slots"),
      ]);
      setApplication(nextApplication); setCourts(courtResponse.items); setSlots(slotResponse.items);
      if (slotId) {
        const existing = slotResponse.items.find((item) => item.id === slotId);
        if (!existing) throw new Error("시간 초안을 찾을 수 없어요.");
        const start = dateTimeParts(existing.startsAt); const end = dateTimeParts(existing.endsAt);
        setDraft({ courtUnitName: existing.court.courtNumber, date: start.date, startsAt: start.time, endsAt: end.time, priceKrw: String(existing.guestFeeKrw), maxParticipantCount: String(existing.maxParticipantCount), minParticipantCount: String(existing.minParticipantCount), gameType: (existing.gameType?.code ?? "") as ActiveGameType | "", maleCapacity: String(existing.genderCapacity?.male ?? 0), femaleCapacity: String(existing.genderCapacity?.female ?? 0), approvalMode: existing.approvalMode, usageNote: existing.usageNote ?? "" });
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "시간 등록 정보를 불러오지 못했어요."); } finally { setLoading(false); }
  }, [slotId]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    const query = regionQuery.trim();
    if (!query || courts.length) return;
    const timer = window.setTimeout(() => { void requestJson<{ items: Region[] }>(`/api/v1/regions?query=${encodeURIComponent(query)}`).then((response) => setRegions(response.items)).catch(() => setRegions([])); }, 180);
    return () => window.clearTimeout(timer);
  }, [courts.length, regionQuery]);
  const set = <Key extends keyof SlotDraft>(key: Key, value: SlotDraft[Key]) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    if (!application?.canCreatePrivateDraft) { setError("현재 심사 상태에서는 시간 초안을 저장할 수 없어요."); return; }
    setSubmitting(true); setError("");
    try {
      if (!draft.courtUnitName.trim()) throw new Error("코트 면 이름을 입력해 주세요.");
      if (!draft.date || !draft.startsAt || !draft.endsAt) throw new Error("날짜와 시작·종료 시간을 모두 입력해 주세요.");
      if (!draft.priceKrw.trim() || !Number.isInteger(Number(draft.priceKrw)) || Number(draft.priceKrw) < 0) throw new Error("게스트 참가비를 0원 이상의 정수로 입력해 주세요.");
      if (!draft.maxParticipantCount.trim() || !Number.isInteger(Number(draft.maxParticipantCount)) || Number(draft.maxParticipantCount) < 2) throw new Error("모집 정원은 2명 이상으로 입력해 주세요.");
      if (!draft.minParticipantCount.trim() || !Number.isInteger(Number(draft.minParticipantCount)) || Number(draft.minParticipantCount) < 1) throw new Error("최소 인원은 1명 이상으로 입력해 주세요.");
      if (Number(draft.minParticipantCount) > Number(draft.maxParticipantCount)) throw new Error("최소 인원은 모집 정원보다 많을 수 없어요.");
      if (!draft.gameType) throw new Error("경기 유형을 선택해 주세요.");
      const splitGender = needsGenderQuota(draft.gameType);
      if (splitGender && Number(draft.maleCapacity) + Number(draft.femaleCapacity) !== Number(draft.maxParticipantCount)) throw new Error("남자·여자 정원의 합계가 모집 정원과 같아야 해요.");
      const payload = {
        courtUnitName: draft.courtUnitName,
        startsAt: toKstIso(draft.date, draft.startsAt),
        endsAt: toKstIso(draft.date, draft.endsAt),
        priceKrw: Number(draft.priceKrw),
        maxParticipantCount: Number(draft.maxParticipantCount),
        minParticipantCount: Number(draft.minParticipantCount),
        gameType: draft.gameType,
        maleCapacity: splitGender ? Number(draft.maleCapacity) : null,
        femaleCapacity: splitGender ? Number(draft.femaleCapacity) : null,
        approvalMode: draft.approvalMode,
        usageNote: draft.usageNote.trim() || null,
      };
      if (slotId) {
        if (!slot) throw new Error("시간 초안을 다시 불러와 주세요.");
        await requestJson(`/api/v1/operator/slots/${encodeURIComponent(slot.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, expectedVersion: slot.version }) });
      } else {
        let courtId = courts[0]?.id;
        if (!courtId) {
          if (!selectedRegion) throw new Error("시설이 있는 시·군·구를 선택해 주세요.");
          const court = await requestJson<Court>("/api/v1/operator/courts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ regionCode: selectedRegion.code }) });
          courtId = court.id;
        }
        await requestJson(`/api/v1/operator/courts/${encodeURIComponent(courtId)}/slots`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      }
      router.push("/partner/slots");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "시간 초안을 저장하지 못했어요."); } finally { setSubmitting(false); }
  };
  if (loading) return <PageShell><BackLink href="/partner/slots" /><CourtRallyLoader label="시간 입력을 준비하고 있어요." /></PageShell>;
  if (error && !application) return <PageShell><BackLink href="/partner/slots" /><LoadingOrError error={error} label="시간 입력을 준비하고 있어요." onRetry={() => void load()} /></PageShell>;
  const canEdit = !slotId || slot?.status === "DRAFT";
  return <PageShell><BackLink href="/partner/slots" /><p className="mt-4 text-sm font-semibold text-[var(--tm-action-primary)]">{slotId ? "시간 초안 수정" : "시간 등록"}</p><h1 className="mt-1 text-2xl font-bold">{slotId ? "초안 내용을 다시 확인해요" : "모집 가능한 시간을 등록해요"}</h1><p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">저장하면 비공개 초안으로 남아요. 이용자에게 보이기 전까지 내용을 수정할 수 있어요.</p>{courts[0] ? <section className="mt-5 rounded-2xl bg-[var(--tm-bg-subtle)] p-4"><p className="text-xs text-[var(--tm-text-secondary)]">등록된 테니스장</p><p className="mt-1 font-semibold">{courts[0].name}</p><p className="mt-1 text-sm text-[var(--tm-text-secondary)]">{courts[0].address}</p></section> : <section className="mt-5 rounded-2xl border border-[var(--tm-border-default)] bg-white p-4"><p className="font-semibold">시설 위치를 먼저 확인해요</p><p className="mt-1 text-sm leading-6 text-[var(--tm-text-secondary)]">승인된 테니스장 정보는 그대로 사용하고, 이 시설이 있는 시·군·구만 선택해 주세요.</p><FormField className="mt-4"><FormLabel>시·군·구 검색</FormLabel><FormControl><SearchField onChange={(event) => { setRegionQuery(event.target.value); setSelectedRegion(null); }} onReset={() => { setRegionQuery(""); setSelectedRegion(null); }} placeholder="예) 마포구" value={regionQuery} /></FormControl></FormField>{selectedRegion ? <p className="mt-3 rounded-xl bg-[var(--tm-bg-subtle)] px-3 py-3 text-sm font-semibold text-[var(--tm-action-primary)]">선택: {selectedRegion.parentName ? `${selectedRegion.parentName} ` : ""}{selectedRegion.name}</p> : null}{regionQuery.trim() && regions.length ? <div className="mt-2 grid gap-2">{regions.map((region) => <button className="min-h-11 rounded-xl border border-[var(--tm-border-default)] px-3 text-left text-sm" key={region.code} onClick={() => { setSelectedRegion(region); setRegionQuery(`${region.parentName ? `${region.parentName} ` : ""}${region.name}`); setRegions([]); }} type="button">{region.parentName ? `${region.parentName} · ` : ""}{region.name}</button>)}</div> : null}</section>}<div className="mt-6 grid gap-4"><FormField><FormLabel>코트 면</FormLabel><FormControl><TextField disabled={!canEdit} maxLength={50} onChange={(event) => set("courtUnitName", event.target.value)} placeholder="예) 2번 코트" value={draft.courtUnitName} /></FormControl></FormField><FormField><FormLabel>날짜</FormLabel><FormControl><TextField disabled={!canEdit} onChange={(event) => set("date", event.target.value)} type="date" value={draft.date} /></FormControl></FormField><div className="grid grid-cols-2 gap-3"><FormField><FormLabel>시작 시간</FormLabel><FormControl><TextField disabled={!canEdit} onChange={(event) => set("startsAt", event.target.value)} type="time" value={draft.startsAt} /></FormControl></FormField><FormField><FormLabel>종료 시간</FormLabel><FormControl><TextField disabled={!canEdit} onChange={(event) => set("endsAt", event.target.value)} type="time" value={draft.endsAt} /></FormControl></FormField></div><FormField><FormLabel>게스트 참가비</FormLabel><FormControl><TextField disabled={!canEdit} inputMode="numeric" min="0" onChange={(event) => set("priceKrw", event.target.value)} placeholder="예) 40000" type="number" value={draft.priceKrw} /></FormControl></FormField><FormField><FormLabel>경기 유형</FormLabel><FormControl><div className="grid w-full grid-cols-2 gap-2">{activeGameTypes.map((value) => <button aria-pressed={draft.gameType === value} className={`min-h-12 rounded-xl border text-sm font-semibold disabled:opacity-50 ${draft.gameType === value ? "border-[var(--tm-action-primary)] bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]" : "border-[var(--tm-border-default)] bg-white"}`} disabled={!canEdit} key={value} onClick={() => { set("gameType", value); if (value === "WOMENS_DOUBLES") { set("maleCapacity", "0"); set("femaleCapacity", draft.maxParticipantCount); } if (value === "MENS_DOUBLES") { set("femaleCapacity", "0"); set("maleCapacity", draft.maxParticipantCount); } }} type="button">{gameTypeLabels[value]}</button>)}</div></FormControl></FormField><div className="grid grid-cols-2 gap-3"><FormField><FormLabel>모집 정원</FormLabel><FormControl><TextField disabled={!canEdit} inputMode="numeric" min="2" onChange={(event) => set("maxParticipantCount", event.target.value)} type="number" value={draft.maxParticipantCount} /></FormControl></FormField><FormField><FormLabel>최소 인원</FormLabel><FormControl><TextField disabled={!canEdit} inputMode="numeric" min="1" onChange={(event) => set("minParticipantCount", event.target.value)} type="number" value={draft.minParticipantCount} /></FormControl></FormField></div><p className="-mt-2 text-xs leading-5 text-[var(--tm-text-secondary)]">모집 정원은 참가자 수예요. 시작 3시간 전까지 최소 인원만큼 입금이 확인되지 않으면 코트 매칭이 자동으로 취소돼요.</p>{needsGenderQuota(draft.gameType) ? <div className="grid grid-cols-2 gap-3"><FormField><FormLabel>남자 정원</FormLabel><FormControl><TextField disabled={!canEdit || draft.gameType === "WOMENS_DOUBLES"} inputMode="numeric" min="0" onChange={(event) => set("maleCapacity", event.target.value)} type="number" value={draft.maleCapacity} /></FormControl></FormField><FormField><FormLabel>여자 정원</FormLabel><FormControl><TextField disabled={!canEdit || draft.gameType === "MENS_DOUBLES"} inputMode="numeric" min="0" onChange={(event) => set("femaleCapacity", event.target.value)} type="number" value={draft.femaleCapacity} /></FormControl></FormField></div> : null}<FormField><FormLabel>참가 승인</FormLabel><FormControl><div className="grid w-full gap-2">{([["AUTO", "자동 승인", "조건이 맞으면 바로 자리를 잡아요. 입금 확인만 하면 돼요."], ["OPERATOR", "직접 승인", "신청을 하나씩 검토하고 승인해요."]] as const).map(([value, label, description]) => <button aria-pressed={draft.approvalMode === value} className={`rounded-xl border px-4 py-3 text-left disabled:opacity-50 ${draft.approvalMode === value ? "border-[var(--tm-action-primary)] bg-[var(--tm-bg-subtle)]" : "border-[var(--tm-border-default)] bg-white"}`} disabled={!canEdit} key={value} onClick={() => set("approvalMode", value)} type="button"><span className={`block text-sm font-semibold ${draft.approvalMode === value ? "text-[var(--tm-action-primary)]" : ""}`}>{label}</span><span className="mt-1 block text-xs leading-5 text-[var(--tm-text-secondary)]">{description}</span></button>)}</div></FormControl></FormField><FormField><FormLabel>이용 안내 <span className="font-normal text-[var(--tm-text-secondary)]">(선택)</span></FormLabel><FormControl><TextArea disabled={!canEdit} maxLength={500} onChange={(event) => set("usageNote", event.target.value)} placeholder="예) 실내 전용 테니스화를 준비해 주세요." value={draft.usageNote} /></FormControl></FormField></div>{!canEdit ? <p className="mt-5 rounded-2xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm leading-6 text-[var(--tm-status-error-text)]">공개했거나 세션에 연결된 시간은 수정할 수 없어요. 새 초안을 등록해 주세요.</p> : null}{error ? <p className="mt-4 text-sm text-[var(--tm-status-error-text)]" role="alert">{error}</p> : null}{canEdit ? <Button className="fixed inset-x-5 bottom-7 mx-auto w-[calc(100%-40px)] max-w-[520px]" disabled={submitting} fullWidth loading={submitting} onClick={() => void submit()}>초안 저장하기</Button> : <Button as={Link} className="fixed inset-x-5 bottom-7 mx-auto w-[calc(100%-40px)] max-w-[520px]" fullWidth href="/partner/slots/new">새 초안 등록하기</Button>}</PageShell>;
}

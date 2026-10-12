"use client";

import { PullToRefresh } from "@/components/feedback/pull-to-refresh";
import { AccountPageHeader } from "@/components/navigation/account-page-header";


import { ActionArea, ActionAreaButton, Modal, ModalContainer, ModalContent, ModalContentItem, ModalDescription, ModalHeading, ModalSummary } from "@wanteddev/wds";
import Link from "next/link";
import { CalendarBlank, CaretDown, TennisBall } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

import { ActivityTabs } from "@/components/navigation/activity-tabs";
import { BottomNavigation } from "@/components/navigation/bottom-navigation";
import { Button } from "@/components/ui/button";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { isFinishedSchedule, matchScheduleText } from "@/matches/schedule";

type SentApplication = {
  id: string;
  status: string;
  statusLabel: string;
  decidedAt: string | null;
  message: string | null;
  match: { id: string; title: string; status: string; startsAt: string; endsAt: string; courtSource: "EXTERNAL_RESERVED" | "COURT_TBD" | "PARTNER_COURT"; courtName: string | null; estimatedFeePerPersonKrw: number | null; courtSlotId: string | null };
  courtMatch: {
    depositCode: string | null;
    paymentDueAt: string | null;
    depositClaimedAt: string | null;
    confirmedAt: string | null;
    awaitingRefund: boolean;
    refundRequested: boolean;
    refundCompletedAt: string | null;
  } | null;
  contact: { href: string | null; label: string; conversationStatus: "OPEN" | "READ_ONLY" | "ARCHIVED" | "NOT_CREATED" } | null;
  supplyNotice: { code: "COURT_SUPPLY_WITHDRAWN"; message: string; occurredAt: string; delivery: "IN_APP" } | null;
  createdAt: string;
};

function schedule(startsAt: string, endsAt: string) {
  return matchScheduleText(startsAt, endsAt);
}

function appliedDate(createdAt: string) {
  return `신청한 ${new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(createdAt))}`;
}

/** 코트 매칭은 승인만으로 끝나지 않는다. 지금 무엇을 해야 하는지 한 줄로 알려 준다. */
function courtMatchNextStep(item: SentApplication) {
  const courtMatch = item.courtMatch;
  if (!courtMatch) return null;
  if (courtMatch.awaitingRefund) {
    return courtMatch.refundCompletedAt
      ? "운영자가 환불 완료로 표시했어요. 실제 입금은 통장에서 확인해 주세요."
      : courtMatch.refundRequested
        ? "환불 계좌를 받았어요. 운영자가 환불하면 알려 드릴게요."
        : "환불받을 계좌를 입력해 주세요.";
  }
  if (item.status === "CONFIRMED") return "참가가 확정됐어요. 당일 안내를 확인해 주세요.";
  if (item.status === "EXPIRED_UNPAID") return "입금 기한이 지나 자리가 반환됐어요.";
  if (item.status === "ACCEPTED") {
    return courtMatch.depositClaimedAt
      ? "입금 알림을 보냈어요. 운영자가 통장을 확인하면 확정돼요."
      : `참가비를 보내고 알려 주세요.${courtMatch.depositCode ? ` 입금자명 뒤에 ${courtMatch.depositCode}를 붙여 주세요.` : ""}`;
  }
  if (item.status === "PENDING") return "운영자가 신청을 확인하고 있어요.";
  return null;
}

function nextStepMessage(status: string, matchStatus: string, wasAccepted = false) {
  return ({
    PENDING: "모집자가 프로필을 확인하고 있어요.",
    ACCEPTED: "같이 치게 됐어요. 매칭 정보를 확인해 주세요.",
    REJECTED: "이번에는 함께하기 어려워요. 다른 매칭을 찾아볼 수 있어요.",
    WITHDRAWN: wasAccepted ? "참가를 취소했어요." : "신청을 철회했어요.",
    CANCELLED: matchStatus === "CANCELLED"
      ? "모집자가 매칭을 취소했어요."
      : matchStatus === "EXPIRED"
        ? "일정이 시작되어 매칭이 성사되지 않았어요."
        : "모집이 마감되어 이번 신청은 진행되지 않아요.",
  } as Record<string, string>)[status] ?? "매칭 상태를 확인해 주세요.";
}

function acceptedCoordinationMessage(courtSource: SentApplication["match"]["courtSource"]) {
  const channel = "서비스 내 채팅";
  if (courtSource === "PARTNER_COURT") return `참가비는 운영자에게 직접 보내요. ${channel}에서는 당일 준비만 확인해요.`;
  return courtSource === "COURT_TBD"
    ? `수락된 참가자끼리 ${channel}에서 코트와 비용을 조율해요.`
    : `수락된 참가자끼리 ${channel}에서 당일 준비와 비용 정산 방법을 확인해요.`;
}

function getErrorMessage(body: unknown, fallback: string) {
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string" ? body.error.message : fallback;
}

export function M5SentApplications() {
  const [items, setItems] = useState<SentApplication[] | null>(null);
  const [error, setError] = useState("");
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [withdrawConfirmId, setWithdrawConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetch("/api/v1/me/applications", { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(body, "신청 내역을 불러오지 못했어요."));
      setItems((body as { items: SentApplication[] }).items);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "신청 내역을 불러오지 못했어요."); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const withdraw = async (applicationId: string) => {
    setWithdrawingId(applicationId);
    setError("");
    try {
      const response = await fetch(`/api/v1/applications/${encodeURIComponent(applicationId)}/withdraw`, { method: "POST" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(body, "신청을 철회하지 못했어요."));
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "신청을 철회하지 못했어요."); } finally { setWithdrawingId(null); }
  };

  return <PullToRefresh onRefresh={load} disabled={withdrawingId !== null || withdrawConfirmId !== null}><main className="min-h-app bg-[var(--tm-bg-page)] pb-28 text-[var(--tm-text-primary)]">
    <AccountPageHeader backHref="/my" title="내가 보낸 신청" />
    <div className="mx-auto max-w-[560px] px-5">
      <ActivityTabs current="sent" />
      {error && items !== null ? <div aria-live="polite" className="mt-5 rounded-2xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm text-[var(--tm-status-error-text)]">{error}</div> : null}
      {error && items === null ? <LoadError error={error} onRetry={load} /> : items === null ? <CourtRallyLoader className="mt-4" label="신청 내역을 준비하고 있어요." /> : items.length === 0 ? <EmptySentApplications /> : <div className="mt-4 grid gap-3">{items.map((item) => <SentApplicationCard item={item} key={item.id} withdrawing={withdrawingId === item.id} onWithdraw={() => setWithdrawConfirmId(item.id)} />)}</div>}
      {withdrawConfirmId ? <WithdrawalConfirm busy={withdrawingId === withdrawConfirmId} mode={items?.find((item) => item.id === withdrawConfirmId)?.status === "ACCEPTED" ? "ACCEPTED" : "PENDING"} onCancel={() => setWithdrawConfirmId(null)} onConfirm={() => { const applicationId = withdrawConfirmId; setWithdrawConfirmId(null); void withdraw(applicationId); }} /> : null}
    </div>
    <BottomNavigation />
  </main></PullToRefresh>;
}

function LoadError({ error, onRetry }: { error: string; onRetry: () => Promise<void> }) {
  return <section className="mt-8 rally-card p-5"><p>{error}</p><Button onClick={() => void onRetry()}>다시 불러오기</Button></section>;
}

function EmptySentApplications() {
  return <section className="mt-10 rounded-[20px] border border-dashed border-[var(--tm-border-strong)] bg-white px-5 py-10 text-center"><TennisBall aria-hidden size={32} className="mx-auto text-[var(--tm-action-primary)]" /><h2 className="mt-4 font-bold">아직 보낸 신청이 없어요</h2><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">마음에 드는 매칭을 찾아 부담 없이 신청해 보세요.</p><Button as={Link} className="mt-5" href="/" size="medium">매칭 찾아보기</Button></section>;
}

/** 지난 일정임을 카드 안에서 바로 알 수 있게 한다. 목록은 다가오는 것부터 보여 준다. */
function PastBadge() {
  return <span className="rounded-full bg-[var(--tm-bg-subtle-muted)] px-2 py-0.5 text-xs font-semibold text-[var(--tm-text-secondary)]">지난 매칭</span>;
}

function SentApplicationCard({ item, withdrawing, onWithdraw }: { item: SentApplication; withdrawing: boolean; onWithdraw: () => void }) {
  const active = item.status === "PENDING" || item.status === "ACCEPTED" || item.status === "CONFIRMED";
  const href = item.match.courtSlotId ? `/partner-sessions/${item.match.courtSlotId}` : `/matches/${item.match.id}?returnTo=${encodeURIComponent("/activity/sent")}`;
  return <article className="rounded-2xl border border-[var(--tm-border-default)] bg-white p-4">
    <Link className="block" href={href}>
      <div className="flex items-center justify-between gap-2"><span className={`rounded-md px-2 py-1 text-[11px] font-semibold ${active ? "bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]" : "bg-[var(--tm-bg-subtle-muted)] text-[var(--tm-text-secondary)]"}`}>{item.statusLabel}</span><span className="text-[11px] text-[var(--tm-text-secondary)]">{appliedDate(item.createdAt)}</span></div>
      <h2 className="mt-3 text-[17px] font-bold leading-6">{item.match.courtName ?? item.match.title}</h2>
      <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-[var(--tm-text-secondary)]"><CalendarBlank size={15} aria-hidden className="mt-0.5 shrink-0" />{schedule(item.match.startsAt, item.match.endsAt)}</p>
      {isFinishedSchedule(item.match.endsAt) ? <div className="mt-2"><PastBadge /></div> : null}
      <p className="mt-2 text-xs text-[var(--tm-text-secondary)]">{item.match.courtSource === "COURT_TBD" ? "코트와 비용을 함께 정해요" : item.match.estimatedFeePerPersonKrw === null ? "참가비를 확인해 주세요" : `1인 ${item.match.estimatedFeePerPersonKrw.toLocaleString("ko-KR")}원`}</p>
    </Link>
    {item.supplyNotice ? <p className="mt-3 rounded-lg bg-[var(--tm-status-error-bg)] p-3 text-xs font-semibold leading-5 text-[var(--tm-status-error-text)]">{item.supplyNotice.message}</p> : <p className="mt-3 border-t border-[var(--tm-border-subtle)] pt-3 text-[13px] font-medium leading-6">{courtMatchNextStep(item) ?? nextStepMessage(item.status, item.match.status, item.decidedAt !== null)}</p>}
    {item.courtMatch && item.match.courtSlotId && (item.status === "ACCEPTED" || item.courtMatch.awaitingRefund) && !item.courtMatch.refundCompletedAt ? <Button as={Link} className="mt-3" fullWidth href={href} size="medium">{item.courtMatch.awaitingRefund ? item.courtMatch.refundRequested ? "환불 진행 확인" : "환불 계좌 입력하기" : item.courtMatch.depositClaimedAt ? "입금 안내 다시 보기" : "입금 안내 보기"}</Button> : null}
    {item.contact ? <><ContactButton contact={item.contact} /><p className="mt-2 text-[11px] leading-5 text-[var(--tm-text-secondary)]">{acceptedCoordinationMessage(item.match.courtSource)}</p></> : null}
    {item.message ? <details className="rally-disclosure mt-2"><summary className="flex min-h-11 items-center justify-between text-xs text-[var(--tm-text-secondary)]">보낸 자기소개<CaretDown aria-hidden className="rally-disclosure-chevron" size={14} /></summary><p className="whitespace-pre-wrap break-words rounded-lg bg-[var(--tm-bg-page)] p-3 text-xs leading-6">{item.message}</p></details> : null}
    {canLeave(item) ? <button className="mt-2 min-h-11 w-full border-t border-[var(--tm-border-subtle)] pt-2 text-xs font-medium text-[var(--tm-text-secondary)] disabled:opacity-50" disabled={withdrawing} onClick={onWithdraw} type="button">{item.status === "PENDING" ? "신청 철회" : "참가 취소"}</button> : null}
  </article>;
}

/**
 * 검토 중이면 철회할 수 있고, 수락된 참가는 시작 전까지 취소할 수 있다.
 * 코트 매칭은 입금·환불이 걸려 있어 코트 매칭 화면에서만 취소한다.
 */
function canLeave(item: SentApplication) {
  if (item.match.courtSource === "PARTNER_COURT") return false;
  if (item.status === "PENDING") return true;
  return item.status === "ACCEPTED"
    && item.match.status !== "CANCELLED"
    && new Date(item.match.startsAt).getTime() > Date.now();
}

function ContactButton({ contact }: { contact: NonNullable<SentApplication["contact"]> }) {
  return contact.href ? <Button as={Link} className="mt-3" fullWidth href={contact.href} size="medium" variant="secondary">{contact.label}</Button> : <p className="mt-3 text-center text-sm text-[var(--tm-text-secondary)]">채팅방을 준비하고 있어요.</p>;
}

function WithdrawalConfirm({ busy, mode, onCancel, onConfirm }: { busy: boolean; mode: "PENDING" | "ACCEPTED"; onCancel: () => void; onConfirm: () => void }) {
  const copy = mode === "ACCEPTED"
    ? { heading: "참가를 취소할까요?", description: "자리는 바로 비워지고 모집자에게 알려요. 취소하면 다시 신청하지 못할 수 있어요.", confirm: "네, 취소할게요" }
    : { heading: "신청을 철회할까요?", description: "철회하면 다시 신청하지 못할 수 있어요.", confirm: "네, 철회할게요" };
  return <Modal open onOpenChange={(next) => { if (!next) onCancel(); }}>
    <ModalContainer variant="bottom">
      <ModalContent>
        <ModalContentItem>
          <ModalSummary>한 번만 확인해요</ModalSummary>
          <ModalHeading>{copy.heading}</ModalHeading>
          <ModalDescription>{copy.description}</ModalDescription>
        </ModalContentItem>
      </ModalContent>
      <ActionArea variant="strong">
        <ActionAreaButton sx={{ borderRadius: 14, minHeight: 48 }} disabled={busy} loading={busy} onClick={onConfirm} variant="main">{copy.confirm}</ActionAreaButton>
        <ActionAreaButton sx={{ borderRadius: 14, minHeight: 48 }} buttonColor="assistive" disabled={busy} onClick={onCancel} variant="alternative">돌아가기</ActionAreaButton>
      </ActionArea>
    </ModalContainer>
  </Modal>;
}

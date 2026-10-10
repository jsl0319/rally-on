"use client";

import Link from "next/link";
import { useCourtDetail } from "./use-court-detail";
import { CourtFreshness } from "./court-freshness";
import { CourtLateReview } from "./court-late-review";
import { useState } from "react";

import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { BackButton } from "@/components/navigation/back-button";
import { Button } from "@/components/ui/button";
import { MatchBadge } from "@/features/matches/match-presentation";
import { matchSchedule } from "@/features/matches/match-presentation";
import type { OperatorCourtMatch } from "@/server/domain/court-match-view";

import { apiMessage, formatStatusChangedAt } from "./partner-session";

import { OperatorMoneyPanel } from "./operator-money-panel";
import { CourtCompositionNotice } from "./court-composition-notice";
import { CourtCompositionCancel } from "./court-composition-cancel";

type Application = OperatorCourtMatch["applications"][number] & {
  profileSnapshot?: unknown;
  message?: string | null;
};

const genderLabels = { MALE: "남", FEMALE: "여" } as const;

function badgeTone(application: Application) {
  if (application.status === "CONFIRMED") return "green" as const;
  if (application.awaitingRefund) return "amber" as const;
  if (application.status === "ACCEPTED") return "blue" as const;
  return "neutral" as const;
}

export function OperatorCourtMatchDetail({ matchId }: { matchId: string }) {
  const { data: match, error, checkedAt, load, reload } = useCourtDetail<OperatorCourtMatch>(
    `/api/v1/operator/court-matches/${encodeURIComponent(matchId)}`, (m) => [m.judgementAt, m.applicationDeadline, m.lateConfirmationDeadline, m.startsAt, m.endsAt, ...m.applications.flatMap((a) => [a.paymentDueAt, a.confirmationDueAt])]);
  const [busyId, setBusyId] = useState("");
  const [actionError, setActionError] = useState("");

  /** 승인·거절·입금 확인·환불 표시가 모두 같은 모양이라 한 곳에서 처리한다. */
  const act = async (application: Application, action: "decision" | "confirm", accept?: boolean) => {
    if (busyId) return;
    setBusyId(application.id);
    setActionError("");
    try {
      const response = await fetch(`/api/v1/court-match-applications/${application.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(action === "decision" ? { body: JSON.stringify({ accept }) } : {}),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "처리하지 못했어요."));
      await load();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "처리하지 못했어요.");
    } finally {
      setBusyId("");
    }
  };

  if (!match) {
    return <main className="grid min-h-svh place-items-center bg-[var(--tm-bg-subtle-muted)] px-5 text-center">
      {error
        ? <div><p className="text-lg font-bold">코트 매칭을 열 수 없어요</p><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">{error}</p><Button as={Link} className="mt-5" href="/partner/slots" size="medium">시간 관리로</Button></div>
        : <CourtRallyLoader label="참가자 정보를 준비하고 있어요." />}
    </main>;
  }

  const date = matchSchedule(match.startsAt, match.endsAt);
  const pending = match.applications.filter((item) => item.status === "PENDING" && !item.awaitingRefund);
  const awaitingDeposit = match.applications.filter((item) => item.status === "ACCEPTED" && !item.awaitingRefund);
  const confirmed = match.applications.filter((item) => item.status === "CONFIRMED" && !item.awaitingRefund);
  const refunds = match.applications.filter((item) => item.awaitingRefund);
  const closed = match.applications.filter((item) => !["PENDING", "ACCEPTED", "CONFIRMED"].includes(item.status) && !item.awaitingRefund);
  const shortfall = match.minParticipantCount - match.confirmedCount;

  return <main className="min-h-svh bg-[var(--tm-bg-page)] pb-16 text-[var(--tm-text-primary)]">
    <article className="mx-auto max-w-[560px] bg-white">
      <header className="px-5 pb-6 pt-[max(1rem,env(safe-area-inset-top))]">
        <BackButton className="inline-flex size-11 items-center justify-center rounded-full text-xl" fallbackPath="/partner/slots" />
        <p className="mt-4 text-sm font-semibold text-[var(--tm-action-primary)]">참가자 관리</p>
        <h1 className="rally-page-title mt-1 break-words text-2xl font-bold leading-snug">{match.title}</h1>
        <p className="mt-2 flex flex-wrap gap-x-2 text-sm tabular-nums text-[var(--tm-text-secondary)]"><span>{date.day}</span><span>{date.time}</span></p>
        <div className="mt-4 flex flex-wrap gap-2">
          <MatchBadge tone={match.status === "OPEN" ? "blue" : "neutral"}>{match.status === "OPEN" ? "모집 중" : match.status === "CLOSED" ? "모집 마감" : match.status === "CANCELLED" ? "취소됨" : "종료"}</MatchBadge>
          <MatchBadge tone="green">{match.approvalMode === "AUTO" ? "선착순 자동 승인" : "직접 승인"}</MatchBadge>
        </div>
      </header>
      <CourtFreshness checkedAt={checkedAt} error={error} reload={reload} />

      <section className="border-t border-[var(--tm-border-default)] px-5 py-6">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="입금 확인" value={`${match.confirmedCount}명`} />
          <Stat label="자리 잡음" value={`${match.seatCount}/${match.maxParticipantCount}명`} />
          <Stat label="최소 인원" value={`${match.minParticipantCount}명`} />
        </div>
        {!match.composition.enabled && match.composition.phase !== "REVIEW_REQUIRED" && match.status === "OPEN" ? <p className={`mt-4 rounded-2xl px-4 py-3 text-sm leading-6 ${shortfall > 0 ? "bg-amber-50 text-amber-800" : "bg-[var(--tm-bg-subtle-muted)] text-[var(--tm-text-muted)]"}`}>
          {shortfall > 0
            ? `${formatStatusChangedAt(match.judgementAt)}까지 입금 확인 인원이 ${shortfall}명 더 필요해요. 못 채우면 자동으로 취소돼요.`
            : `최소 인원을 채웠어요. ${formatStatusChangedAt(match.applicationDeadline)}까지 추가 신청을 받을 수 있어요.`}
        </p> : null}
        <CourtCompositionNotice match={match} operator />
        <CourtLateReview match={match} refresh={load} />
        <CourtCompositionCancel match={match} refresh={load} />
        {match.cancellationReason ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">{match.cancellationReason}</p> : null}
        {actionError ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700" role="alert">{actionError}</p> : null}
      </section>

      {refunds.length ? <Group title="반환·환불 처리" description="처리 시작 후 고정된 금액과 계좌로 송금하고 결과를 기록해 주세요.">
        {refunds.map((application) => <Card application={application} busy={busyId === application.id} key={application.id} match={match} refresh={load}>
          {application.status === "ACCEPTED" && application.receivedAmountKrw !== null ? <Button size="medium" onClick={() => void act(application, "confirm")}>입금 확인하고 확정</Button> : null}
        </Card>)}
      </Group> : null}

      {pending.length ? <Group title={`승인 대기 ${pending.length}명`} description="프로필과 신청 내용을 확인하고 결정해 주세요.">
        {pending.map((application) => <Card application={application} busy={busyId === application.id} key={application.id} match={match} refresh={load}>
          {application.message ? <p className="mt-3 whitespace-pre-wrap break-words rounded-2xl bg-[var(--tm-bg-subtle-muted)] p-4 text-sm leading-6 text-[var(--tm-text-muted)]">{application.message}</p> : null}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Button disabled={busyId === application.id} fullWidth onClick={() => void act(application, "decision", false)} size="medium" variant="secondary">거절</Button>
            <Button disabled={busyId === application.id} fullWidth onClick={() => void act(application, "decision", true)} size="medium">승인</Button>
          </div>
        </Card>)}
      </Group> : null}

      {awaitingDeposit.length ? <Group title={`입금 대기 ${awaitingDeposit.length}명`} description="통장 내역의 입금자명을 식별코드와 대조한 뒤 확정해 주세요.">
        {awaitingDeposit.map((application) => <Card application={application} busy={busyId === application.id} key={application.id} match={match} refresh={load}>
          <dl className="mt-3 space-y-2 rounded-2xl bg-[var(--tm-bg-subtle-muted)] p-4 text-sm">
            <Row label="입금 예정">{match.guestFeeKrw.toLocaleString("ko-KR")}원</Row>
            <Row label="식별코드"><span className="text-base font-bold tabular-nums">{application.depositCode ?? "-"}</span></Row>
            <Row label="입금자명">{application.depositorName ?? <span className="font-normal text-[var(--tm-text-secondary)]">아직 알리지 않음</span>}</Row>
            {application.paymentDueAt ? <Row label="이체 기한">{formatStatusChangedAt(application.paymentDueAt)}</Row> : null}
            {application.confirmationDueAt ? <Row label="확인 기한">{formatStatusChangedAt(application.confirmationDueAt)}</Row> : null}
          </dl>
          {application.receivedAmountKrw !== null ? <Button className="mt-3" disabled={busyId === application.id} fullWidth onClick={() => void act(application, "confirm")} size="medium">기존 입금 기록으로 참가 확정</Button> : null}
          {!application.depositClaimedAt ? <p className="mt-2 text-xs leading-5 text-[var(--tm-text-secondary)]">참가자가 아직 입금했다고 알리지 않았어요. 아래에서 통장 내역을 기록하면 정시 입금은 참가 확정까지 함께 처리돼요.</p> : null}
        </Card>)}
      </Group> : null}

      {confirmed.length ? <Group title={`참가 확정 ${confirmed.length}명`}>
        {confirmed.map((application) => <Card application={application} busy={false} key={application.id} match={match} refresh={load} />)}
      </Group> : null}

      {closed.length ? <Group title="지난 신청">
        {closed.map((application) => <Card application={application} busy={false} key={application.id} match={match} refresh={load} />)}
      </Group> : null}

      {match.applications.length === 0 ? <section className="border-t border-[var(--tm-border-default)] px-5 py-10 text-center">
        <p className="font-bold">아직 신청이 없어요</p>
        <p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">코트 매칭 목록에 공개돼 있어요. 신청이 들어오면 여기에 보여요.</p>
      </section> : null}

      <section className="border-t border-[var(--tm-border-default)] px-5 py-6">
        <div className="flex items-center justify-between gap-3 text-sm">
          <button className="min-h-11 font-semibold text-[var(--tm-action-primary)]" onClick={reload} type="button">목록 새로고침</button>
          <Link className="font-semibold text-[var(--tm-text-secondary)]" href={match.slotId ? `/partner-sessions/${match.slotId}` : "/partner/slots"}>참가자에게 보이는 화면 →</Link>
        </div>
        <Link className="mt-4 block text-sm font-semibold text-[var(--tm-action-primary)]" href="/partner/support-inquiries">담당자 대조 요청 확인 →</Link>
        <p className="mt-4 text-xs leading-5 text-[var(--tm-text-secondary)]">참가비는 Rally On을 거치지 않아요. 입금과 환불은 통장에서 직접 확인해 주세요.</p>
      </section>
    </article>
  </main>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-[var(--tm-bg-subtle-muted)] p-4 text-center"><p className="text-xs leading-5 text-[var(--tm-text-secondary)]">{label}</p><p className="mt-1 text-lg font-bold tabular-nums">{value}</p></div>;
}

function Group({ children, description, title }: { children: React.ReactNode; description?: string; title: string }) {
  return <section className="border-t border-[var(--tm-border-default)] px-5 py-6">
    <h2 className="text-lg font-bold">{title}</h2>
    {description ? <p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">{description}</p> : null}
    <div className="mt-4 grid gap-3">{children}</div>
  </section>;
}

function Card({ application, busy, children, match, refresh }: { application: Application; busy: boolean; children?: React.ReactNode; match: OperatorCourtMatch; refresh: () => Promise<void> }) {
  const profile = match.approvalMode === "OPERATOR" ? readProfile(application.profileSnapshot) : null;
  return <article id={`application-${application.id}`} className={`scroll-mt-6 rounded-[20px] border border-[var(--tm-border-subtle)] p-4 ${busy ? "opacity-60" : ""}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="break-words font-bold">{application.nickname}{application.gender ? <span className="ml-1.5 text-sm font-medium text-[var(--tm-text-secondary)]">{genderLabels[application.gender]}</span> : null}</p>
        <p className="mt-1 text-xs text-[var(--tm-text-secondary)]">신청 · {formatStatusChangedAt(application.createdAt)}</p>
      </div>
      <MatchBadge tone={badgeTone(application)}>{application.statusLabel}</MatchBadge>
    </div>
    {profile ? <p className="mt-2 text-xs leading-5 text-[var(--tm-text-secondary)]">{profile}</p> : null}
    {children}
    <OperatorMoneyPanel key={application.receiptVersion} application={application} refresh={refresh} />
  </article>;
}

/**
 * 신청 당시 프로필 스냅샷은 자유 형태 JSON이라 화면에서 방어적으로 읽는다.
 * 운영자 승인 방식일 때만 서버가 내려 준다(docs/03-2 §3.8).
 */
function readProfile(snapshot: unknown) {
  if (typeof snapshot !== "object" || snapshot === null) return null;
  const labels = ["experienceLabel", "rallyLevelLabel", "gameExperienceLabel"]
    .map((key) => (snapshot as Record<string, unknown>)[key])
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  return labels.length ? labels.join(" · ") : null;
}

function Row({ children, label }: { children: React.ReactNode; label: string }) {
  return <div className="flex justify-between gap-4"><dt className="shrink-0 text-[var(--tm-text-secondary)]">{label}</dt><dd className="text-right font-semibold">{children}</dd></div>;
}

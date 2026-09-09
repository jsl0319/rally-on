"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { BackButton } from "@/components/navigation/back-button";
import { Button } from "@/components/ui/button";
import { MatchBadge } from "@/features/matches/match-presentation";
import { matchSchedule } from "@/features/matches/match-presentation";
import type { OperatorCourtMatch } from "@/server/domain/court-match-view";

import { apiMessage, formatStatusChangedAt } from "./partner-session";

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
  const [match, setMatch] = useState<OperatorCourtMatch | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/v1/operator/court-matches/${encodeURIComponent(matchId)}`, { cache: "no-store" });
    const body: unknown = await response.json();
    if (!response.ok) throw new Error(apiMessage(body, "코트 매칭을 불러오지 못했어요."));
    setMatch(body as OperatorCourtMatch);
    setError("");
  }, [matchId]);

  const reload = useCallback(() => {
    void load().catch((caught) => setError(caught instanceof Error ? caught.message : "불러오지 못했어요."));
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(reload, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  /** 승인·거절·입금 확인·환불 표시가 모두 같은 모양이라 한 곳에서 처리한다. */
  const act = async (application: Application, action: "decision" | "confirm" | "refund", accept?: boolean) => {
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
    return <main className="grid min-h-svh place-items-center bg-slate-50 px-5 text-center">
      {error
        ? <div><p className="text-lg font-bold">코트 매칭을 열 수 없어요</p><p className="mt-2 text-sm leading-6 text-slate-500">{error}</p><Button as={Link} className="mt-5" href="/partner/slots" size="medium">시간 관리로</Button></div>
        : <CourtRallyLoader label="참가자 정보를 준비하고 있어요." />}
    </main>;
  }

  const date = matchSchedule(match.startsAt, match.endsAt);
  const pending = match.applications.filter((item) => item.status === "PENDING");
  const awaitingDeposit = match.applications.filter((item) => item.status === "ACCEPTED");
  const confirmed = match.applications.filter((item) => item.status === "CONFIRMED");
  const refunds = match.applications.filter((item) => item.awaitingRefund);
  const closed = match.applications.filter((item) => !["PENDING", "ACCEPTED", "CONFIRMED"].includes(item.status) && !item.awaitingRefund);
  const shortfall = match.minParticipantCount - match.confirmedCount;

  return <main className="min-h-svh bg-slate-50 pb-16 text-[var(--tm-text-primary)]">
    <article className="mx-auto max-w-[560px] bg-white">
      <header className="px-5 pb-6 pt-[max(1rem,env(safe-area-inset-top))]">
        <BackButton className="inline-flex size-11 items-center justify-center rounded-full text-xl" fallbackPath="/partner/slots" />
        <p className="mt-4 text-sm font-semibold text-blue-600">참가자 관리</p>
        <h1 className="mt-1 break-words text-2xl font-bold leading-snug">{match.title}</h1>
        <p className="mt-2 flex flex-wrap gap-x-2 text-sm tabular-nums text-slate-500"><span>{date.day}</span><span>{date.time}</span></p>
        <div className="mt-4 flex flex-wrap gap-2">
          <MatchBadge tone={match.status === "OPEN" ? "blue" : "neutral"}>{match.status === "OPEN" ? "모집 중" : match.status === "CLOSED" ? "모집 마감" : match.status === "CANCELLED" ? "취소됨" : "종료"}</MatchBadge>
          <MatchBadge tone="green">{match.approvalMode === "AUTO" ? "선착순 자동 승인" : "직접 승인"}</MatchBadge>
        </div>
      </header>

      <section className="border-t-[8px] border-slate-50 px-5 py-6">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="입금 확인" value={`${match.confirmedCount}명`} />
          <Stat label="자리 잡음" value={`${match.seatCount}/${match.maxParticipantCount}명`} />
          <Stat label="최소 인원" value={`${match.minParticipantCount}명`} />
        </div>
        {match.status === "OPEN" ? <p className={`mt-4 rounded-2xl px-4 py-3 text-sm leading-6 ${shortfall > 0 ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-600"}`}>
          {shortfall > 0
            ? `${formatStatusChangedAt(match.judgementAt)}까지 입금 확인 인원이 ${shortfall}명 더 필요해요. 못 채우면 자동으로 취소돼요.`
            : `최소 인원을 채웠어요. ${formatStatusChangedAt(match.applicationDeadline)}까지 추가 신청을 받을 수 있어요.`}
        </p> : null}
        {match.cancellationReason ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">{match.cancellationReason}</p> : null}
        {actionError ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700" role="alert">{actionError}</p> : null}
      </section>

      {refunds.length ? <Group title="환불할 참가자" description="이체를 마친 뒤 표시해 주세요. 서비스가 송금을 대신하거나 확인하지는 않아요.">
        {refunds.map((application) => <Card application={application} busy={busyId === application.id} key={application.id} match={match}>
          <p className="mt-3 text-sm leading-6 text-slate-600">보낼 금액 <strong className="font-semibold tabular-nums">{(application.refundAmountKrw ?? match.guestFeeKrw).toLocaleString("ko-KR")}원</strong>{application.participantCancelledAt ? <span className="ml-1.5 text-slate-500">· 참가자 취소</span> : null}</p>
          {application.refundAccount
            ? <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm"><p className="font-semibold">{application.refundAccount.bank} · {application.refundAccount.accountHolder}</p><p className="mt-1 break-all font-semibold tabular-nums">{application.refundAccount.accountNumber}</p></div>
            : <p className="mt-3 text-sm leading-6 text-slate-500">참가자가 아직 환불 계좌를 입력하지 않았어요. 입력하면 여기에 보여요.</p>}
          {application.refundAccount && !application.refundCompletedAt
            ? <Button className="mt-3" disabled={busyId === application.id} fullWidth onClick={() => void act(application, "refund")} size="medium" variant="secondary">환불 완료로 표시</Button>
            : null}
        </Card>)}
      </Group> : null}

      {pending.length ? <Group title={`승인 대기 ${pending.length}명`} description="프로필과 신청 내용을 확인하고 결정해 주세요.">
        {pending.map((application) => <Card application={application} busy={busyId === application.id} key={application.id} match={match}>
          {application.message ? <p className="mt-3 whitespace-pre-wrap break-words rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">{application.message}</p> : null}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Button disabled={busyId === application.id} fullWidth onClick={() => void act(application, "decision", false)} size="medium" variant="secondary">거절</Button>
            <Button disabled={busyId === application.id} fullWidth onClick={() => void act(application, "decision", true)} size="medium">승인</Button>
          </div>
        </Card>)}
      </Group> : null}

      {awaitingDeposit.length ? <Group title={`입금 대기 ${awaitingDeposit.length}명`} description="통장 내역의 입금자명을 식별코드와 대조한 뒤 확정해 주세요.">
        {awaitingDeposit.map((application) => <Card application={application} busy={busyId === application.id} key={application.id} match={match}>
          <dl className="mt-3 space-y-2 rounded-2xl bg-slate-50 p-4 text-sm">
            <Row label="입금 예정">{match.guestFeeKrw.toLocaleString("ko-KR")}원</Row>
            <Row label="식별코드"><span className="text-base font-bold tabular-nums">{application.depositCode ?? "-"}</span></Row>
            <Row label="입금자명">{application.depositorName ?? <span className="font-normal text-slate-400">아직 알리지 않음</span>}</Row>
            {application.paymentDueAt ? <Row label="기한">{formatStatusChangedAt(application.paymentDueAt)}</Row> : null}
          </dl>
          <Button className="mt-3" disabled={busyId === application.id} fullWidth onClick={() => void act(application, "confirm")} size="medium">입금 확인하고 확정</Button>
          {!application.depositClaimedAt ? <p className="mt-2 text-xs leading-5 text-slate-500">참가자가 아직 입금했다고 알리지 않았어요. 통장에 들어와 있다면 그대로 확정해도 돼요.</p> : null}
        </Card>)}
      </Group> : null}

      {confirmed.length ? <Group title={`참가 확정 ${confirmed.length}명`}>
        {confirmed.map((application) => <Card application={application} busy={false} key={application.id} match={match} />)}
      </Group> : null}

      {closed.length ? <Group title="지난 신청">
        {closed.map((application) => <Card application={application} busy={false} key={application.id} match={match} />)}
      </Group> : null}

      {match.applications.length === 0 ? <section className="border-t-[8px] border-slate-50 px-5 py-10 text-center">
        <p className="font-bold">아직 신청이 없어요</p>
        <p className="mt-2 text-sm leading-6 text-slate-500">코트 매칭 목록에 공개돼 있어요. 신청이 들어오면 여기에 보여요.</p>
      </section> : null}

      <section className="border-t-[8px] border-slate-50 px-5 py-6">
        <div className="flex items-center justify-between gap-3 text-sm">
          <button className="min-h-11 font-semibold text-blue-600" onClick={reload} type="button">목록 새로고침</button>
          <Link className="font-semibold text-slate-500" href={match.slotId ? `/partner-sessions/${match.slotId}` : "/partner/slots"}>참가자에게 보이는 화면 →</Link>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">참가비는 Rally On을 거치지 않아요. 입금과 환불은 통장에서 직접 확인해 주세요.</p>
      </section>
    </article>
  </main>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-4 text-center"><p className="text-xs leading-5 text-slate-500">{label}</p><p className="mt-1 text-lg font-bold tabular-nums">{value}</p></div>;
}

function Group({ children, description, title }: { children: React.ReactNode; description?: string; title: string }) {
  return <section className="border-t-[8px] border-slate-50 px-5 py-6">
    <h2 className="text-lg font-bold">{title}</h2>
    {description ? <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p> : null}
    <div className="mt-4 grid gap-3">{children}</div>
  </section>;
}

function Card({ application, busy, children, match }: { application: Application; busy: boolean; children?: React.ReactNode; match: OperatorCourtMatch }) {
  const profile = match.approvalMode === "OPERATOR" ? readProfile(application.profileSnapshot) : null;
  return <article className={`rounded-3xl border border-slate-100 p-4 ${busy ? "opacity-60" : ""}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="break-words font-bold">{application.nickname}{application.gender ? <span className="ml-1.5 text-sm font-medium text-slate-500">{genderLabels[application.gender]}</span> : null}</p>
        <p className="mt-1 text-xs text-slate-500">신청 · {formatStatusChangedAt(application.createdAt)}</p>
      </div>
      <MatchBadge tone={badgeTone(application)}>{application.statusLabel}</MatchBadge>
    </div>
    {profile ? <p className="mt-2 text-xs leading-5 text-slate-500">{profile}</p> : null}
    {children}
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
  return <div className="flex justify-between gap-4"><dt className="shrink-0 text-slate-500">{label}</dt><dd className="text-right font-semibold">{children}</dd></div>;
}

"use client";

import { ActionArea, ActionAreaButton, Modal, ModalContainer, ModalContent, ModalContentItem, ModalDescription, ModalHeading, ModalSummary } from "@wanteddev/wds";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";

import { ActivityTabs } from "@/components/navigation/activity-tabs";
import { BackButton } from "@/components/navigation/back-button";
import { BottomNavigation } from "@/components/navigation/bottom-navigation";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { Button } from "@/components/ui/button";

type HostedMatch = {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  startsAt: string;
  endsAt: string;
  court: { source: "EXTERNAL_RESERVED" | "COURT_TBD" | "PARTNER_COURT"; name: string | null };
  recruitCount: number;
  acceptedCount: number;
  remainingSpots: number;
  pendingApplicationCount: number;
  version: number;
  canClose: boolean;
  canCancel: boolean;
  canComplete: boolean;
  canReopen: boolean;
  contact: { href: string | null; label: string; conversationStatus: "OPEN" | "READ_ONLY" | "ARCHIVED" | "NOT_CREATED" };
};

type ProfileSnapshot = {
  experienceLabel?: string;
  rallyLevelLabel?: string;
  gameExperienceLabel?: string;
  playPurposes?: Array<{ label?: string }>;
};

type ReceivedApplication = {
  applicantGender?: "MALE" | "FEMALE" | null;
  id: string;
  status: string;
  statusLabel: string;
  message: string | null;
  applicant: { nickname: string; profileSnapshot: ProfileSnapshot };
  createdAt: string;
};

type ReceivedResponse = {
  match: HostedMatch & { version: number; pendingApplicationCount: number };
  items: ReceivedApplication[];
};

function apiMessage(body: unknown, fallback: string) {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string") return body.error.message;
  return fallback;
}

function schedule(startsAt: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Seoul" }).format(new Date(startsAt));
}

function snapshotSummary(snapshot: ProfileSnapshot) {
  return [snapshot.experienceLabel, snapshot.rallyLevelLabel].filter(Boolean).join(" · ");
}

function snapshotDetails(snapshot: ProfileSnapshot) {
  return [snapshot.gameExperienceLabel, snapshot.playPurposes?.map((purpose) => purpose.label).filter(Boolean).join(" · ")].filter(Boolean).join(" · ");
}

function hostCoordinationMessage(courtSource: HostedMatch["court"]["source"]) {
  const channel = "서비스 내 채팅";
  return courtSource === "COURT_TBD"
    ? `수락된 참가자와 ${channel}에서 코트와 비용을 조율해요.`
    : `수락된 참가자와 ${channel}에서 당일 준비와 비용 정산 방법을 확인해요.`;
}

function useJsonLoader<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetch(url, { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "정보를 불러오지 못했어요."));
      setData(body as T);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "정보를 불러오지 못했어요."); }
  }, [url]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  return { data, error, load };
}

function PageShell({ children, withNavigation = false }: { children: React.ReactNode; withNavigation?: boolean }) {
  return <main className={`min-h-svh bg-[var(--tm-bg-page)] px-5 pt-6 text-[var(--tm-text-primary)] ${withNavigation ? "pb-28" : "pb-10"}`}><div className="mx-auto max-w-[560px]">{children}</div>{withNavigation ? <BottomNavigation /> : null}</main>;
}

function LoadingOrError({ error, label, load }: { error: string; label: string; load: () => Promise<void> }) {
  return error ? <section className="mt-8 rounded-3xl border border-[var(--tm-border-default)] bg-white p-5"><p>{error}</p><Button onClick={() => void load()} size="medium">다시 불러오기</Button></section> : <CourtRallyLoader className="mt-4" label={label} />;
}

export function M6ReceivedApplications() {
  const { data, error, load } = useJsonLoader<{ items: HostedMatch[] }>("/api/v1/me/hosted-matches");
  return <PageShell withNavigation>
    <BackButton ariaLabel="마이로 돌아가기" className="inline-flex size-11 items-center justify-center rounded-full text-xl" fallbackPath="/my" />
    <p className="mt-4 text-sm font-semibold text-[var(--tm-action-primary)]">내 활동</p>
    <h1 className="mt-1 text-2xl font-bold">받은 신청</h1>
    <ActivityTabs current="received" />
    <p className="mt-4 text-sm leading-6 text-[var(--tm-text-secondary)]">내가 만든 매칭에 들어온 신청을 한곳에서 확인해요.</p>
    {data === null ? <LoadingOrError error={error} label="신청 정보를 준비하고 있어요." load={load} /> : data.items.length === 0 ? <EmptyHostedMatches /> : <div className="mt-6 space-y-4">{data.items.map((match) => <HostedMatchCard key={match.id} match={match} onChanged={load} />)}</div>}
  </PageShell>;
}

function EmptyHostedMatches() {
  return <section className="mt-10 rounded-3xl border border-dashed border-[var(--tm-border-strong)] bg-white px-5 py-10 text-center"><p className="text-2xl">🎾</p><h2 className="mt-4 font-bold">아직 만든 매칭이 없어요</h2><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">코트 예약 전에도 일정과 지역을 정해 메이트를 모집할 수 있어요.</p><Button as={Link} className="mt-5" href="/matches/new" size="medium">매칭 만들기</Button></section>;
}

type HostedAction = "close" | "cancel" | "complete" | "reopen";

function HostedMatchCard({ match, onChanged }: { match: HostedMatch; onChanged: () => Promise<void> }) {
  const [action, setAction] = useState<HostedAction | null>(null);
  const [confirmAction, setConfirmAction] = useState<HostedAction | null>(null);
  const [error, setError] = useState("");
  const runAction = async (nextAction: HostedAction) => {
    setAction(nextAction); setError("");
    try {
      const response = await fetch(`/api/v1/matches/${encodeURIComponent(match.id)}/${nextAction}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextAction === "cancel" ? { expectedVersion: match.version, reason: null } : { expectedVersion: match.version }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "매칭 상태를 변경하지 못했어요."));
      await onChanged();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "매칭 상태를 변경하지 못했어요."); } finally { setAction(null); }
  };
  return <>
    <section className="rounded-3xl border border-[var(--tm-border-default)] bg-white p-5 shadow-[0_4px_14px_rgba(49,94,158,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-h-7 items-center whitespace-nowrap rounded-full bg-[var(--tm-bg-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--tm-action-primary)]">{match.statusLabel}</span>
        {match.pendingApplicationCount > 0 ? <span className="inline-flex min-h-7 items-center whitespace-nowrap rounded-full bg-[var(--tm-bg-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--tm-action-primary)]">검토할 신청 {match.pendingApplicationCount}건</span> : null}
      </div>
      <h2 className="mt-4 text-lg font-bold">{match.title}</h2>
      <p className="mt-3 text-sm text-[var(--tm-text-muted)]">🗓 {schedule(match.startsAt)}</p>
      <p className="mt-1 text-sm text-[var(--tm-text-muted)]">📍 {match.court.name ?? "코트와 비용을 함께 정해요"}</p>
      <p className="mt-4 border-t border-[var(--tm-border-subtle)] pt-3 text-sm font-semibold">수락 {match.acceptedCount}명 / 모집 {match.recruitCount}명 <span className="font-normal text-[var(--tm-text-secondary)]">· 남은 자리 {match.remainingSpots}명</span></p>
      {match.acceptedCount > 0 && match.status !== "COMPLETED" ? <>
        <p className="mt-4 rounded-2xl bg-[var(--tm-bg-subtle)] px-4 py-3 text-sm leading-6 text-[var(--tm-action-hover)]">{hostCoordinationMessage(match.court.source)}</p>
        <HostedContactButton contact={match.contact} />
      </> : null}
      {match.pendingApplicationCount > 0 ? <Button as={Link} className="mt-4" fullWidth href={`/activity/received/${match.id}`} size="large">신청자 보기</Button> : <p className="mt-4 text-sm text-[var(--tm-text-secondary)]">{match.status === "COMPLETED" ? "함께한 일정이 완료됐어요." : "새로 검토할 신청을 기다리고 있어요."}</p>}
      {match.canComplete ? <Button className="mt-3" disabled={action !== null} fullWidth onClick={() => setConfirmAction("complete")} size="large">플레이 완료하기</Button> : null}
      {match.canClose ? <Button className="mt-3" disabled={action !== null} fullWidth onClick={() => setConfirmAction("close")} size="medium" variant="neutral">모집 마감</Button> : null}
      {match.canReopen ? <Button className="mt-3" disabled={action !== null} fullWidth onClick={() => setConfirmAction("reopen")} size="medium" variant="neutral">다시 모집하기</Button> : null}
      {match.canCancel ? <button className="mt-3 min-h-11 w-full rounded-2xl px-4 text-sm font-semibold text-[var(--tm-text-secondary)] disabled:opacity-50" disabled={action !== null} onClick={() => setConfirmAction("cancel")} type="button">매칭 취소</button> : null}
      {error ? <p className="mt-3 rounded-2xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm text-[var(--tm-status-error-text)]">{error}</p> : null}
    </section>
    {confirmAction ? <LifecycleConfirm action={confirmAction} busy={action !== null} onCancel={() => setConfirmAction(null)} onConfirm={() => { setConfirmAction(null); void runAction(confirmAction); }} /> : null}
  </>;
}

function HostedContactButton({ contact }: { contact: HostedMatch["contact"] }) {
  return contact.href ? <Button as={Link} className="mt-3" fullWidth href={contact.href} size="large" variant="secondary">{contact.label}</Button> : <p className="mt-3 text-center text-sm text-[var(--tm-text-secondary)]">채팅방을 준비하고 있어요.</p>;
}

function LifecycleConfirm({ action, busy, onCancel, onConfirm }: { action: HostedAction; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const copy = action === "complete"
    ? { title: "플레이를 완료할까요?", body: "완료하면 수락된 참가자에게도 ‘완료’로 표시돼요.", confirm: "네, 완료할게요" }
    : action === "close"
      ? { title: "모집을 마감할까요?", body: "남은 대기 신청은 ‘모집이 마감됐어요’로 표시돼요.", confirm: "네, 마감할게요" }
      : action === "reopen"
        ? { title: "다시 모집할까요?", body: "빈 자리만큼 새 신청을 받을 수 있어요. 마감할 때 정리된 지난 신청은 되살아나지 않아요.", confirm: "네, 다시 모집할게요" }
        : { title: "매칭을 취소할까요?", body: "수락된 참가자와 대기 신청자에게 취소로 표시돼요.", confirm: "네, 취소할게요" };
  return <Modal open onOpenChange={(next) => { if (!next) onCancel(); }}>
    <ModalContainer variant="bottom">
      <ModalContent>
        <ModalContentItem>
          <ModalSummary>한 번만 확인해요</ModalSummary>
          <ModalHeading>{copy.title}</ModalHeading>
          <ModalDescription>{copy.body}</ModalDescription>
        </ModalContentItem>
      </ModalContent>
      <ActionArea variant="strong">
        <ActionAreaButton disabled={busy} loading={busy} onClick={onConfirm} variant="main">{copy.confirm}</ActionAreaButton>
        <ActionAreaButton buttonColor="assistive" disabled={busy} onClick={onCancel} variant="alternative">돌아가기</ActionAreaButton>
      </ActionArea>
    </ModalContainer>
  </Modal>;
}

export function M6ReceivedMatch({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = use(params);
  const { data, error, load } = useJsonLoader<ReceivedResponse>(`/api/v1/matches/${encodeURIComponent(matchId)}/applications?status=PENDING`);
  if (data === null) return <PageShell><BackButton className="inline-flex size-11 items-center justify-center rounded-full text-xl" fallbackPath="/activity/received" /><LoadingOrError error={error} label="신청자 정보를 준비하고 있어요." load={load} /></PageShell>;
  return <PageShell>
    <BackButton className="inline-flex size-11 items-center justify-center rounded-full text-xl" fallbackPath="/activity/received" />
    <p className="mt-5 text-sm font-semibold text-[var(--tm-action-primary)]">받은 신청</p>
    <h1 className="mt-1 text-2xl font-bold">신청자 {data.match.pendingApplicationCount}명을 검토해요</h1>
    <p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">신청 내용을 보고 함께 치기 좋은 분을 선택하세요.</p>
    <section className="mt-6 rounded-3xl border border-[var(--tm-border-default)] bg-white p-5 shadow-[0_4px_14px_rgba(49,94,158,0.05)]">
      <div className="flex items-center justify-between gap-3"><span className="inline-flex min-h-7 items-center whitespace-nowrap rounded-full bg-[var(--tm-bg-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--tm-action-primary)]">{data.match.statusLabel}</span><span className="inline-flex min-h-7 items-center whitespace-nowrap rounded-full bg-[var(--tm-bg-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--tm-action-primary)]">검토할 신청 {data.match.pendingApplicationCount}건</span></div>
      <h2 className="mt-4 text-lg font-bold">{data.match.title}</h2>
      <p className="mt-3 text-sm text-[var(--tm-text-muted)]">🗓 {schedule(data.match.startsAt)} · {data.match.court.name ?? "코트와 비용을 함께 정해요"}</p>
      <p className="mt-3 text-sm font-semibold">수락 {data.match.acceptedCount}명 / 모집 {data.match.recruitCount}명 <span className="font-normal text-[var(--tm-text-secondary)]">· 남은 자리 {data.match.remainingSpots}명</span></p>
    </section>
    {data.items.length === 0 ? <section className="mt-6 rounded-3xl border border-dashed border-[var(--tm-border-strong)] bg-white px-5 py-10 text-center"><h2 className="font-bold">검토할 신청을 모두 확인했어요</h2><p className="mt-2 text-sm text-[var(--tm-text-secondary)]">새 신청이 오면 여기에서 확인할 수 있어요.</p></section> : <div className="mt-4 grid gap-4">{data.items.map((application) => <ApplicantCard application={application} matchId={matchId} key={application.id} />)}</div>}
  </PageShell>;
}

function ApplicantCard({ application, matchId }: { application: ReceivedApplication; matchId: string }) {
  const snapshot = application.applicant.profileSnapshot;
  return <Link className="block rounded-3xl border border-[var(--tm-border-default)] bg-white p-5 shadow-[0_4px_14px_rgba(49,94,158,0.05)] transition-colors hover:border-[var(--tm-border-strong)]" href={`/activity/received/${matchId}/applications/${application.id}`}><div className="flex items-center justify-between gap-3"><span className="inline-flex min-h-7 items-center whitespace-nowrap rounded-full bg-[var(--tm-bg-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--tm-action-primary)]">{application.statusLabel}</span><span className="text-xs font-semibold text-[var(--tm-action-primary)]">신청 내용 보기 →</span></div><h2 className="mt-4 text-lg font-bold">{application.applicant.nickname}님</h2><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">{snapshotSummary(snapshot)}</p>{application.applicantGender ? <p className="mt-2 text-sm font-semibold">{application.applicantGender === "MALE" ? "남자 자리" : "여자 자리"} 신청</p> : null}<p className="mt-1 text-sm leading-6 text-[var(--tm-text-secondary)]">{snapshotDetails(snapshot)}</p>{application.message ? <p className="mt-4 border-t border-[var(--tm-border-subtle)] pt-3 text-sm leading-6 text-[var(--tm-text-muted)]">“{application.message}”</p> : null}</Link>;
}

export function M6ApplicantReview({ params }: { params: Promise<{ matchId: string; applicationId: string }> }) {
  const { matchId, applicationId } = use(params);
  const { data, error, load } = useJsonLoader<ReceivedResponse>(`/api/v1/matches/${encodeURIComponent(matchId)}/applications?status=PENDING`);
  const [decision, setDecision] = useState<"ACCEPT" | "REJECT" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  const [completed, setCompleted] = useState<{ type: "ACCEPT" | "REJECT"; remainingSpots?: number; isFull?: boolean } | null>(null);
  const application = data?.items.find((item) => item.id === applicationId) ?? null;

  const decide = async () => {
    if (!data || !decision || !application) return;
    setSubmitting(true); setDecisionError("");
    try {
      const response = await fetch(`/api/v1/applications/${encodeURIComponent(application.id)}/${decision === "ACCEPT" ? "accept" : "reject"}`, { method: "POST", headers: { "Content-Type": "application/json" }, ...(decision === "ACCEPT" ? { body: JSON.stringify({ expectedMatchVersion: data.match.version }) } : {}) });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "신청 상태를 변경하지 못했어요."));
      const match = typeof body === "object" && body !== null && "match" in body && typeof body.match === "object" && body.match !== null ? body.match as { remainingSpots?: number; status?: string } : null;
      setCompleted({ type: decision, remainingSpots: match?.remainingSpots, isFull: match?.status === "CLOSED" });
      setDecision(null);
    } catch (caught) { setDecisionError(caught instanceof Error ? caught.message : "신청 상태를 변경하지 못했어요."); } finally { setSubmitting(false); }
  };

  return <PageShell><BackButton className="inline-flex size-11 items-center justify-center rounded-full text-xl" fallbackPath={`/activity/received/${matchId}`} />{data === null ? <LoadingOrError error={error} label="신청 정보를 준비하고 있어요." load={load} /> : !application ? <section className="mt-10 rounded-3xl border border-[var(--tm-border-default)] bg-white p-5"><h1 className="text-xl font-bold">이미 처리된 신청이에요</h1><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">최신 신청 목록을 확인해 주세요.</p><Button as={Link} className="mt-5" href={`/activity/received/${matchId}`} size="medium">신청 목록 보기</Button></section> : completed ? <DecisionSuccess matchId={matchId} result={completed} /> : <ApplicantReviewContent application={application} data={data} decisionError={decisionError} onDecision={setDecision} />}{decision ? <DecisionConfirm application={application} decision={decision} error={decisionError} submitting={submitting} remainingSpots={data?.match.remainingSpots ?? 0} onCancel={() => setDecision(null)} onConfirm={() => void decide()} /> : null}</PageShell>;
}

function ApplicantReviewContent({ application, data, decisionError, onDecision }: { application: ReceivedApplication; data: ReceivedResponse; decisionError: string; onDecision: (decision: "ACCEPT" | "REJECT") => void }) {
  const snapshot = application.applicant.profileSnapshot;
  return <><p className="mt-5 text-sm font-semibold text-[var(--tm-action-primary)]">{data.match.title} · 검토할 신청</p><h1 className="mt-1 text-2xl font-bold">{application.applicant.nickname}님을 검토해요</h1><section className="mt-6 rounded-3xl bg-[var(--tm-bg-subtle)] p-5"><p className="text-sm font-semibold text-[var(--tm-action-primary)]">신청 당시 테니스 프로필{application.applicantGender ? ` · ${application.applicantGender === "MALE" ? "남자 자리" : "여자 자리"} 신청` : ""}</p><h2 className="mt-3 text-lg font-bold">{snapshotSummary(snapshot)}</h2><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">{snapshotDetails(snapshot)}</p></section><section className="mt-4 rounded-3xl border border-[var(--tm-border-default)] bg-white p-5"><h2 className="font-bold">신청 메시지</h2><p className="mt-3 text-sm leading-6 text-[var(--tm-text-muted)]">{application.message ? `“${application.message}”` : "남긴 메시지가 없어요."}</p></section>{decisionError ? <p className="mt-4 rounded-2xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm text-[var(--tm-status-error-text)]">{decisionError}</p> : null}<div className="mt-6 grid grid-cols-2 gap-3"><Button fullWidth onClick={() => onDecision("REJECT")} size="large" variant="neutral">이번에는 어려워요</Button><Button fullWidth onClick={() => onDecision("ACCEPT")} size="large">수락하기</Button></div></>;
}

function DecisionConfirm({ application, decision, error, submitting, remainingSpots, onCancel, onConfirm }: { application: ReceivedApplication | null; decision: "ACCEPT" | "REJECT"; error: string; submitting: boolean; remainingSpots: number; onCancel: () => void; onConfirm: () => void }) {
  if (!application) return null;
  const accepting = decision === "ACCEPT";
  return <Modal open onOpenChange={(next) => { if (!next) onCancel(); }}>
    <ModalContainer variant="bottom">
      <ModalContent>
        <ModalContentItem>
          <ModalHeading>{accepting ? `${application.applicant.nickname}님과 함께 치기로 할까요?` : "이번 신청을 정중하게 마무리할까요?"}</ModalHeading>
          <ModalDescription>{accepting ? `수락하면 남은 자리가 ${Math.max(remainingSpots - 1, 0)}자리예요.${remainingSpots === 1 ? " 마지막 자리라면 다른 대기 신청은 자동으로 마감돼요." : ""}` : "상대방에게는 ‘이번에는 함께하기 어려워요’라고 표시돼요."}</ModalDescription>
          {error ? <p className="mt-3 rounded-2xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm text-[var(--tm-status-error-text)]">{error}</p> : null}
        </ModalContentItem>
      </ModalContent>
      <ActionArea variant="strong">
        <ActionAreaButton disabled={submitting} loading={submitting} onClick={onConfirm} variant="main">{accepting ? "네, 함께 칠게요" : "이번에는 어려워요"}</ActionAreaButton>
        <ActionAreaButton buttonColor="assistive" disabled={submitting} onClick={onCancel} variant="alternative">취소</ActionAreaButton>
      </ActionArea>
    </ModalContainer>
  </Modal>;
}

function DecisionSuccess({ matchId, result }: { matchId: string; result: { type: "ACCEPT" | "REJECT"; remainingSpots?: number; isFull?: boolean } }) {
  const accepted = result.type === "ACCEPT";
  return <section className="mt-20 rounded-[28px] bg-white p-6 text-center shadow-[0_10px_40px_rgba(49,94,158,0.09)]"><p className="text-4xl">{accepted ? "🎾" : "✓"}</p><h1 className="mt-4 text-2xl font-bold">{accepted ? "같이 치기로 했어요" : "신청을 정중히 마무리했어요"}</h1><p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">{accepted ? result.isFull ? "정원이 채워져 남은 신청은 자동으로 마감됐어요." : `남은 자리는 ${result.remainingSpots ?? 0}자리예요.` : "신청자에게 결과가 전달돼요."}</p><Button as={Link} className="mt-6" fullWidth href={`/activity/received/${matchId}`} size="large">신청 목록 보기</Button></section>;
}

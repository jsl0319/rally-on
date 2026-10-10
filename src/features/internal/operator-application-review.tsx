"use client";

import { PageHeader } from "@/components/ui/page-header";

import { Tab, TabList, TabListItem } from "@wanteddev/wds";
import { useCallback, useEffect, useState } from "react";

import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { Button } from "@/components/ui/button";

type ReviewStatus = "REVIEW_REQUIRED" | "PUBLISH_APPROVED" | "SUSPENDED";
type Decision = "APPROVE_PUBLISH" | "REQUEST_CHANGES" | "REJECT";
type ReviewReasonCode = "MANUAL_VERIFIED" | "INFORMATION_INCOMPLETE" | "BUSINESS_UNVERIFIED" | "VENUE_UNVERIFIED" | "OPERATING_AUTHORITY_UNCONFIRMED" | "DUPLICATE_VENUE";
type ControlReasonCode = "BUSINESS_UNVERIFIED" | "VENUE_UNVERIFIED" | "OPERATING_AUTHORITY_UNCONFIRMED" | "SAFETY_REVIEW" | "VENUE_CLOSED";
type ReviewApplication = {
  id: string;
  status: ReviewStatus;
  businessName: string;
  businessVerificationStatus: string;
  venueVerificationStatus: string;
  venue: { name: string; address: string };
  submittedAt: string | null;
  businessRegistrationCertificateAvailable: boolean;
  court: { id: string; name: string; address: string; status: "ACTIVE" | "INACTIVE" } | null;
};
type ReviewList = { items: ReviewApplication[] };
type ReviewDraft = { decision: Decision; reasonCode: ReviewReasonCode };

const statusTabs: Array<{ value: ReviewStatus; label: string }> = [
  { value: "REVIEW_REQUIRED", label: "심사 대기" },
  { value: "PUBLISH_APPROVED", label: "승인 운영자" },
  { value: "SUSPENDED", label: "공개 중지" },
];

const reviewReasonOptions: Array<{ value: Exclude<ReviewReasonCode, "MANUAL_VERIFIED">; label: string }> = [
  { value: "INFORMATION_INCOMPLETE", label: "입력 정보가 충분하지 않아요" },
  { value: "BUSINESS_UNVERIFIED", label: "사업자 확인이 필요해요" },
  { value: "VENUE_UNVERIFIED", label: "테니스장 정보 확인이 필요해요" },
  { value: "OPERATING_AUTHORITY_UNCONFIRMED", label: "운영 권한 확인이 필요해요" },
  { value: "DUPLICATE_VENUE", label: "같은 장소 운영 여부를 확인해 주세요" },
];

const controlReasonOptions: Array<{ value: ControlReasonCode; label: string }> = [
  { value: "BUSINESS_UNVERIFIED", label: "사업자 정보를 다시 확인해야 해요" },
  { value: "VENUE_UNVERIFIED", label: "테니스장 정보를 다시 확인해야 해요" },
  { value: "OPERATING_AUTHORITY_UNCONFIRMED", label: "운영 권한을 다시 확인해야 해요" },
  { value: "SAFETY_REVIEW", label: "안전 검토가 필요해요" },
  { value: "VENUE_CLOSED", label: "시설 운영 종료를 확인했어요" },
];

function messageFrom(body: unknown, fallback: string) {
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string"
    ? body.error.message
    : fallback;
}

function formatSubmittedAt(value: string | null) {
  return value ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value)) : "제출 시각 확인 필요";
}

export function InternalOperatorApplicationReview() {
  const [applications, setApplications] = useState<ReviewApplication[] | null>(null);
  const [status, setStatus] = useState<ReviewStatus>("REVIEW_REQUIRED");
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [controlReasons, setControlReasons] = useState<Record<string, ControlReasonCode>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetch(`/api/internal/operator-applications?status=${status}`, { cache: "no-store" });
      if (!response.ok) throw new Error(messageFrom(await response.json(), "운영자 목록을 불러오지 못했어요."));
      const body = await response.json() as ReviewList;
      setApplications(body.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "운영자 목록을 불러오지 못했어요.");
      setApplications([]);
    }
  }, [status]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const setDecision = (applicationId: string, decision: Decision) => {
    setDrafts((current) => ({
      ...current,
      [applicationId]: {
        decision,
        reasonCode: decision === "APPROVE_PUBLISH" ? "MANUAL_VERIFIED" : current[applicationId]?.reasonCode === "MANUAL_VERIFIED" || !current[applicationId] ? "INFORMATION_INCOMPLETE" : current[applicationId].reasonCode,
      },
    }));
  };

  const setReviewReasonCode = (applicationId: string, reasonCode: Exclude<ReviewReasonCode, "MANUAL_VERIFIED">) => {
    setDrafts((current) => ({ ...current, [applicationId]: { decision: current[applicationId]?.decision ?? "REQUEST_CHANGES", reasonCode } }));
  };

  const submitReview = async (applicationId: string) => {
    const draft = drafts[applicationId];
    if (!draft) {
      setError("판정 결과를 먼저 선택해 주세요.");
      return;
    }
    setSubmittingId(applicationId);
    setError("");
    try {
      const response = await fetch(`/api/internal/operator-applications/${encodeURIComponent(applicationId)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) throw new Error(messageFrom(await response.json(), "판정을 저장하지 못했어요."));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "판정을 저장하지 못했어요.");
    } finally {
      setSubmittingId(null);
    }
  };

  const runControl = async (application: ReviewApplication, action: "suspend" | "deactivate") => {
    const reasonCode = controlReasons[application.id] ?? "OPERATING_AUTHORITY_UNCONFIRMED";
    const message = action === "suspend"
      ? "새 시간 공개와 사진 공개를 중지할까요? 이미 열린 제휴 코트 세션은 취소되지 않아요. 실제 공급 불가는 운영상 문제 접수로 처리해야 해요."
      : "이 코트의 새 공급과 사진 공개를 중지할까요? 운영자 승인과 이미 열린 제휴 코트 세션은 유지돼요.";
    if (!window.confirm(message) || (action === "deactivate" && !application.court)) return;

    setSubmittingId(`${action}:${application.id}`);
    setError("");
    try {
      const path = action === "suspend"
        ? `/api/internal/operator-applications/${encodeURIComponent(application.id)}/suspend`
        : `/api/internal/courts/${encodeURIComponent(application.court!.id)}/deactivate`;
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reasonCode }),
      });
      if (!response.ok) throw new Error(messageFrom(await response.json(), "운영 조치를 저장하지 못했어요."));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "운영 조치를 저장하지 못했어요.");
    } finally {
      setSubmittingId(null);
    }
  };

  if (applications === null) return <main className="grid min-h-app place-items-center bg-[var(--tm-bg-page)] px-5"><CourtRallyLoader className="max-w-[560px]" label="운영자 심사 목록을 불러오고 있어요." /></main>;

  const emptyTitle = status === "REVIEW_REQUIRED" ? "심사 대기 신청이 없어요" : status === "PUBLISH_APPROVED" ? "공개 승인 운영자가 없어요" : "공개 중지된 운영자가 없어요";
  const emptyDescription = status === "REVIEW_REQUIRED" ? "새 신청이 들어오면 이 목록에서 안전한 정보만 확인할 수 있어요." : "심사자가 조치한 운영자만 이 목록에 표시돼요.";

  return <main className="min-h-app bg-[var(--tm-bg-page)] px-5 pb-12 pt-4 text-[var(--tm-text-primary)]"><div className="mx-auto max-w-[560px]">
    <PageHeader eyebrow="내부 관리" title="운영자 신청 검토" description="확인한 내용만 선택해 판정해요. 공개 중지와 코트 비활성화는 새 공급·사진만 막고 기존 세션은 취소하지 않아요." />
    <Tab onValueChange={(value) => { const nextStatus = value as ReviewStatus; if (status === nextStatus) { void load(); return; } setApplications(null); setStatus(nextStatus); }} value={status}>
      <TabList aria-label="운영자 심사 상태" className="mt-5">
        {statusTabs.map((tab) => <TabListItem key={tab.value} value={tab.value}>{tab.label}</TabListItem>)}
      </TabList>
    </Tab>
    {error ? <p className="mt-4 rounded-xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm leading-5 text-[var(--tm-status-error-text)]" role="alert">{error}</p> : null}
    {applications.length ? <div className="mt-6 grid gap-4">{applications.map((application) => application.status === "REVIEW_REQUIRED"
      ? <ApplicationCard application={application} draft={drafts[application.id]} key={application.id} onDecision={setDecision} onReasonCode={setReviewReasonCode} onSubmit={submitReview} submitting={submittingId === application.id} />
      : <OperatorControlCard application={application} key={application.id} onReasonChange={(reasonCode) => setControlReasons((current) => ({ ...current, [application.id]: reasonCode }))} onRun={runControl} reasonCode={controlReasons[application.id] ?? "OPERATING_AUTHORITY_UNCONFIRMED"} submittingId={submittingId} />,
    )}</div> : <section className="mt-8 rounded-2xl border border-[var(--tm-border-default)] bg-white p-5"><h2 className="text-lg font-semibold">{emptyTitle}</h2><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">{emptyDescription}</p><Button className="mt-5" onClick={() => void load()} size="medium" variant="secondary">다시 불러오기</Button></section>}
  </div></main>;
}

function ApplicationCard({ application, draft, onDecision, onReasonCode, onSubmit, submitting }: { application: ReviewApplication; draft?: ReviewDraft; onDecision: (applicationId: string, decision: Decision) => void; onReasonCode: (applicationId: string, reasonCode: Exclude<ReviewReasonCode, "MANUAL_VERIFIED">) => void; onSubmit: (applicationId: string) => void; submitting: boolean }) {
  const needsReason = draft && draft.decision !== "APPROVE_PUBLISH";
  return <section className="rounded-2xl border border-[var(--tm-border-default)] bg-white p-5"><p className="text-xs font-semibold text-[var(--tm-text-secondary)]">{formatSubmittedAt(application.submittedAt)}</p><h2 className="mt-2 text-lg font-semibold">{application.businessName}</h2><p className="mt-1 text-sm leading-5 text-[var(--tm-text-secondary)]">{application.venue.name}<br />{application.venue.address}</p><dl className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-[var(--tm-bg-subtle)] p-3 text-xs"><div><dt className="text-[var(--tm-text-secondary)]">사업자 확인</dt><dd className="mt-1 font-semibold">{application.businessVerificationStatus}</dd></div><div><dt className="text-[var(--tm-text-secondary)]">장소 확인</dt><dd className="mt-1 font-semibold">{application.venueVerificationStatus}</dd></div></dl>{application.businessRegistrationCertificateAvailable ? <Button as="a" className="mt-4" href={`/api/internal/operator-applications/${encodeURIComponent(application.id)}/business-registration-certificate`} rel="noreferrer" size="medium" target="_blank" variant="secondary">사업자등록증 안전하게 열기</Button> : <p className="mt-4 rounded-xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm leading-5 text-[var(--tm-status-error-text)]">사업자등록증을 다시 제출하도록 요청해 주세요.</p>}<fieldset className="mt-5"><legend className="text-sm font-semibold">판정</legend><div className="mt-2 grid gap-2"><DecisionButton active={draft?.decision === "APPROVE_PUBLISH"} label="공개 승인" onClick={() => onDecision(application.id, "APPROVE_PUBLISH")} /><DecisionButton active={draft?.decision === "REQUEST_CHANGES"} label="정보 보완 요청" onClick={() => onDecision(application.id, "REQUEST_CHANGES")} /><DecisionButton active={draft?.decision === "REJECT"} label="등록 반려" onClick={() => onDecision(application.id, "REJECT")} /></div></fieldset>{needsReason ? <label className="mt-4 block text-sm font-semibold">판정 사유<select className="rally-input mt-2 h-11 w-full rounded-xl border border-[var(--tm-border-default)] bg-white px-3 text-sm" onChange={(event) => onReasonCode(application.id, event.target.value as Exclude<ReviewReasonCode, "MANUAL_VERIFIED">)} value={draft.reasonCode}>{reviewReasonOptions.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></label> : null}<p className="mt-4 text-xs leading-5 text-[var(--tm-text-secondary)]">판정은 심사자와 시각, 선택한 사유 코드만 감사 이력에 남고 수정할 수 없어요.</p><Button className="mt-5" disabled={!draft || submitting || (draft.decision === "APPROVE_PUBLISH" && !application.businessRegistrationCertificateAvailable)} fullWidth loading={submitting} onClick={() => void onSubmit(application.id)}>판정 저장하기</Button></section>;
}

function OperatorControlCard({ application, onReasonChange, onRun, reasonCode, submittingId }: { application: ReviewApplication; onReasonChange: (reasonCode: ControlReasonCode) => void; onRun: (application: ReviewApplication, action: "suspend" | "deactivate") => void; reasonCode: ControlReasonCode; submittingId: string | null }) {
  const isApproved = application.status === "PUBLISH_APPROVED";
  return <section className="rounded-2xl border border-[var(--tm-border-default)] bg-white p-5"><p className="text-xs font-semibold text-[var(--tm-text-secondary)]">{formatSubmittedAt(application.submittedAt)}</p><h2 className="mt-2 text-lg font-semibold">{application.businessName}</h2><p className="mt-1 text-sm leading-5 text-[var(--tm-text-secondary)]">{application.venue.name}<br />{application.venue.address}</p><dl className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-[var(--tm-bg-subtle)] p-3 text-xs"><div><dt className="text-[var(--tm-text-secondary)]">운영자 공개</dt><dd className="mt-1 font-semibold">{isApproved ? "공개 승인" : "공개 중지"}</dd></div><div><dt className="text-[var(--tm-text-secondary)]">코트 상태</dt><dd className="mt-1 font-semibold">{application.court?.status === "ACTIVE" ? "운영 중" : application.court ? "비활성" : "미생성"}</dd></div></dl>{isApproved ? <><label className="mt-5 block text-sm font-semibold">조치 사유<select className="rally-input mt-2 h-11 w-full rounded-xl border border-[var(--tm-border-default)] bg-white px-3 text-sm" onChange={(event) => onReasonChange(event.target.value as ControlReasonCode)} value={reasonCode}>{controlReasonOptions.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</select></label><p className="mt-3 rounded-xl bg-[var(--tm-bg-highlight)] px-4 py-3 text-sm leading-5 text-[var(--tm-text-secondary)]">기존 제휴 코트 세션은 유지돼요. 실제 공급이 불가능하면 운영상 문제 접수로 취소를 처리해야 해요.</p><button className="mt-4 min-h-12 w-full rounded-xl bg-[var(--tm-status-error-text)] px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={submittingId !== null} onClick={() => onRun(application, "suspend")} type="button">{submittingId === `suspend:${application.id}` ? "공개 중지 저장 중…" : "운영자 공개 일시 중지"}</button>{application.court?.status === "ACTIVE" ? <button className="mt-3 min-h-12 w-full rounded-xl border border-[var(--tm-border-strong)] px-4 text-sm font-semibold text-[var(--tm-status-error-text)] disabled:opacity-50" disabled={submittingId !== null} onClick={() => onRun(application, "deactivate")} type="button">{submittingId === `deactivate:${application.id}` ? "코트 비활성화 중…" : "이 코트 비활성화"}</button> : null}</> : <p className="mt-5 rounded-xl bg-[var(--tm-bg-subtle)] px-4 py-3 text-sm leading-6 text-[var(--tm-text-secondary)]">새 시간 공개와 사진 공개가 중지된 상태예요. 다시 승인하는 절차는 별도 운영 정책에서 다뤄요.</p>}</section>;
}

function DecisionButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button aria-pressed={active} className={`min-h-11 rounded-xl border px-3 text-left text-sm font-semibold ${active ? "border-[var(--tm-action-primary)] bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]" : "border-[var(--tm-border-default)] bg-white"}`} onClick={onClick} type="button">{label}</button>;
}

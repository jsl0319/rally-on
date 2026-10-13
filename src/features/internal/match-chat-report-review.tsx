"use client";

import { PageHeader } from "@/components/ui/page-header";

import { Tab, TabList, TabListItem } from "@wanteddev/wds";
import { useCallback, useEffect, useState } from "react";

import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { Button } from "@/components/ui/button";

type ReportStatus = "OPEN" | "RESOLVED";
type ModerationAction = "NO_ACTION" | "HIDE_MESSAGE" | "SUSPEND_SENDING" | "SET_READ_ONLY";
type ChatReport = {
  id: string;
  status: ReportStatus;
  reason: "HARASSMENT" | "SEXUAL_OR_HATEFUL_CONTENT" | "PERSONAL_INFORMATION" | "SPAM_OR_FRAUD" | "OTHER";
  description: string | null;
  createdAt: string;
  reporter: { nickname: string };
  message: { id: string; body: string; senderNickname: string | null };
  match: { id: string; title: string };
};
type ReportList = { items: ChatReport[] };

const statusTabs: Array<{ value: ReportStatus; label: string }> = [
  { value: "OPEN", label: "처리 대기" },
  { value: "RESOLVED", label: "처리 완료" },
];

const reasonLabels: Record<ChatReport["reason"], string> = {
  HARASSMENT: "괴롭힘 또는 위협",
  SEXUAL_OR_HATEFUL_CONTENT: "성적·혐오 표현",
  PERSONAL_INFORMATION: "개인정보 노출",
  SPAM_OR_FRAUD: "광고 또는 사기 의심",
  OTHER: "기타",
};

const actionOptions: Array<{ value: ModerationAction; label: string; description: string }> = [
  { value: "NO_ACTION", label: "조치 없이 종결", description: "메시지와 대화 권한을 그대로 두고 신고만 종결해요." },
  { value: "HIDE_MESSAGE", label: "메시지 숨기기", description: "참여자 채팅 목록에서 해당 메시지를 숨겨요." },
  { value: "SUSPEND_SENDING", label: "발신 제한", description: "해당 메시지를 보낸 참여자는 이 방에 더 보낼 수 없어요." },
  { value: "SET_READ_ONLY", label: "방 읽기 전용", description: "모든 참여자가 이전 대화만 볼 수 있고 새 메시지는 보낼 수 없어요." },
];

function messageFrom(body: unknown, fallback: string) {
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string"
    ? body.error.message
    : fallback;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
}

export function InternalMatchChatReportReview() {
  const [reports, setReports] = useState<ChatReport[] | null>(null);
  const [status, setStatus] = useState<ReportStatus>("OPEN");
  const [drafts, setDrafts] = useState<Record<string, { action: ModerationAction; reason: string }>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetch(`/api/internal/chat-reports?status=${status}`, { cache: "no-store" });
      if (!response.ok) throw new Error(messageFrom(await response.json(), "채팅 신고 목록을 불러오지 못했어요."));
      setReports((await response.json() as ReportList).items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "채팅 신고 목록을 불러오지 못했어요.");
      setReports([]);
    }
  }, [status]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const setAction = (reportId: string, action: ModerationAction) => {
    setDrafts((current) => ({ ...current, [reportId]: { action, reason: current[reportId]?.reason ?? "" } }));
  };

  const setReason = (reportId: string, reason: string) => {
    setDrafts((current) => ({ ...current, [reportId]: { action: current[reportId]?.action ?? "NO_ACTION", reason } }));
  };

  const submit = async (report: ChatReport) => {
    const draft = drafts[report.id] ?? { action: "NO_ACTION" as const, reason: "" };
    const selected = actionOptions.find((option) => option.value === draft.action)!;
    if (!window.confirm(`“${selected.label}”로 이 신고를 종결할까요? 저장 후에는 신고 상태를 되돌릴 수 없어요.`)) return;

    setSubmittingId(report.id);
    setError("");
    try {
      const response = await fetch(`/api/internal/chat-reports/${encodeURIComponent(report.id)}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: draft.action, reason: draft.reason.trim() || null }),
      });
      if (!response.ok) throw new Error(messageFrom(await response.json(), "신고 조치를 저장하지 못했어요."));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "신고 조치를 저장하지 못했어요.");
    } finally {
      setSubmittingId(null);
    }
  };

  if (reports === null) return <main className="grid min-h-app place-items-center bg-[var(--tm-bg-page)] px-5"><CourtRallyLoader className="max-w-[560px]" label="채팅 신고를 불러오고 있어요." /></main>;

  const emptyTitle = status === "OPEN" ? "처리할 채팅 신고가 없어요" : "처리 완료된 채팅 신고가 없어요";
  const emptyDescription = status === "OPEN" ? "새 신고가 들어오면 이 목록에서 필요한 범위로만 검토할 수 있어요." : "처리한 신고는 이 목록에서 감사 목적으로 확인할 수 있어요.";

  return <main className="min-h-app bg-[var(--tm-bg-page)] px-5 pb-12 pt-4 text-[var(--tm-text-primary)]"><div className="mx-auto max-w-[560px]">
    <PageHeader backHref="/internal" eyebrow="내부 관리" title="채팅 신고 검토" description="신고 사유와 해당 메시지만 확인해요. 조치 기록은 심사자와 시각, 선택한 조치·메모로 남고 수정할 수 없어요." />
    <Tab onValueChange={(value) => { const nextStatus = value as ReportStatus; if (status === nextStatus) { void load(); return; } setReports(null); setStatus(nextStatus); }} value={status}>
      <TabList aria-label="채팅 신고 상태" className="mt-5">
        {statusTabs.map((tab) => <TabListItem key={tab.value} value={tab.value}>{tab.label}</TabListItem>)}
      </TabList>
    </Tab>
    {error ? <p className="mt-4 rounded-xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm leading-5 text-[var(--tm-status-error-text)]" role="alert">{error}</p> : null}
    {reports.length ? <div className="mt-6 grid gap-4">{reports.map((report) => <ReportCard draft={drafts[report.id] ?? { action: "NO_ACTION", reason: "" }} key={report.id} onActionChange={setAction} onReasonChange={setReason} onSubmit={submit} report={report} submitting={submittingId === report.id} />)}</div> : <section className="mt-8 rounded-2xl border border-[var(--tm-border-default)] bg-white p-5"><h2 className="text-lg font-semibold">{emptyTitle}</h2><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">{emptyDescription}</p><Button className="mt-5" onClick={() => void load()} size="medium" variant="secondary">다시 불러오기</Button></section>}
  </div></main>;
}

function ReportCard({ report, draft, onActionChange, onReasonChange, onSubmit, submitting }: { report: ChatReport; draft: { action: ModerationAction; reason: string }; onActionChange: (reportId: string, action: ModerationAction) => void; onReasonChange: (reportId: string, reason: string) => void; onSubmit: (report: ChatReport) => void; submitting: boolean }) {
  const selected = actionOptions.find((option) => option.value === draft.action)!;
  return <section className="rounded-2xl border border-[var(--tm-border-default)] bg-white p-5">
    <p className="text-xs font-semibold text-[var(--tm-text-secondary)]">{formatDate(report.createdAt)}</p>
    <h2 className="mt-2 text-lg font-semibold">{report.match.title}</h2>
    <p className="mt-1 text-sm text-[var(--tm-text-secondary)]">{report.reporter.nickname}님이 {reasonLabels[report.reason]} 사유로 신고했어요.</p>
    <div className="mt-4 rounded-xl bg-[var(--tm-bg-subtle)] p-4"><p className="text-xs font-semibold text-[var(--tm-text-secondary)]">신고된 메시지 · {report.message.senderNickname ?? "시스템"}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{report.message.body}</p></div>
    {report.description ? <p className="mt-3 rounded-xl border border-[var(--tm-border-default)] px-4 py-3 text-sm leading-5 text-[var(--tm-text-secondary)]">신고 설명: {report.description}</p> : null}
    {report.status === "OPEN" ? <><fieldset className="mt-5"><legend className="text-sm font-semibold">조치</legend><div className="mt-2 grid gap-2">{actionOptions.map((option) => <button aria-pressed={draft.action === option.value} className={`rounded-xl border p-3 text-left ${draft.action === option.value ? "border-[var(--tm-action-primary)] bg-[var(--tm-bg-subtle)]" : "border-[var(--tm-border-default)]"}`} key={option.value} onClick={() => onActionChange(report.id, option.value)} type="button"><span className="block text-sm font-semibold">{option.label}</span><span className="mt-1 block text-xs leading-5 text-[var(--tm-text-secondary)]">{option.description}</span></button>)}</div></fieldset><label className="mt-4 block text-sm font-semibold">검토 메모 <span className="font-normal text-[var(--tm-text-secondary)]">(선택)</span><textarea className="rally-input mt-2 min-h-20 w-full rounded-xl border border-[var(--tm-border-default)] px-3 py-2 text-sm font-normal leading-5" maxLength={200} onChange={(event) => onReasonChange(report.id, event.target.value)} placeholder="운영 검토에 필요한 사실만 짧게 남겨 주세요." value={draft.reason} /></label><p className="mt-2 text-xs leading-5 text-[var(--tm-text-secondary)]">선택한 조치: {selected.label}. 참여자에게 심사자 정보나 신고자 정보는 공개되지 않아요.</p><Button className="mt-5" disabled={submitting} fullWidth loading={submitting} onClick={() => void onSubmit(report)}>신고 조치 저장하기</Button></> : <p className="mt-5 rounded-xl bg-[var(--tm-bg-subtle)] px-4 py-3 text-sm leading-6 text-[var(--tm-text-secondary)]">처리 완료된 신고예요. 감사 이력은 수정할 수 없어요.</p>}
  </section>;
}

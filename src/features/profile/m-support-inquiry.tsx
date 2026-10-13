"use client";

import { AccountPageHeader } from "@/components/navigation/account-page-header";
import { CaretDown, ChatCircleText } from "@phosphor-icons/react";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { useActionToast } from "@/components/feedback/use-action-toast";

import type { SupportInquiryView as Inquiry } from "@/server/domain/support-service";
import { SupportThread } from "@/features/support/support-thread";

function apiMessage(body: unknown, fallback: string) {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string") return body.error.message;
  return fallback;
}

export function MSupportInquiry() {
  const showComplete = useActionToast();
  // 코트 매칭 화면에서 넘어오면 어느 건인지 함께 보낸다. 운영자에게 되묻지 않아도 된다.
  const params = useSearchParams();
  const inquiryId = params.get("inquiryId");
  const matchId = params.get("matchId");
  const applicationId = params.get("applicationId");
  const [items, setItems] = useState<Inquiry[] | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [view, setView] = useState<"compose" | "history">(inquiryId ? "history" : "compose");

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetch("/api/v1/support-inquiries", { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "문의 내역을 불러오지 못했어요."));
      setItems((body as { items: Inquiry[] }).items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "문의 내역을 불러오지 못했어요.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const submit = async () => {
    if (submitting || message.trim().length < 10) return;
    setSubmitting(true);
    setSubmitError("");
    setSubmitted(false);
    try {
      const response = await fetch("/api/v1/support-inquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, matchId, applicationId }) });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "문의를 보내지 못했어요."));
      showComplete("문의가 접수되었습니다.");
      setMessage("");
      setSubmitted(true);
      setView("history");
      await load();
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : "문의를 보내지 못했어요.");
    } finally {
      setSubmitting(false);
    }
  };

  const valid = message.trim().length >= 10;
  const visibleItems = items && inquiryId && !submitted ? [...items.filter(item => item.id === inquiryId), ...items.filter(item => item.id !== inquiryId)] : items;

  return <main className="min-h-app bg-[var(--tm-bg-page)] pb-10 text-[var(--tm-text-primary)]">
    <AccountPageHeader title="1:1 문의" />
    <div className="mx-auto max-w-[560px] px-5">
      <div className="mb-6 mt-4 grid grid-cols-2 rounded-xl bg-[var(--tm-bg-subtle)] p-1" aria-label="문의 화면 선택">{([["compose", "문의하기"], ["history", "내 문의 내역"]] as const).map(([key, label]) => <button aria-pressed={view === key} className={`min-h-11 rounded-lg text-sm font-semibold ${view === key ? "bg-white text-[var(--tm-action-primary)] shadow-sm" : "text-[var(--tm-text-secondary)]"}`} key={key} onClick={() => setView(key)} type="button">{label}</button>)}</div>
      {view === "compose" ? <>
        <h2 className="text-[23px] font-bold leading-8 tracking-[-.7px]">어떤 도움이 필요하세요?</h2><p className="mb-6 mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">이용 중 궁금한 점을 남겨 주세요.<br />답변은 내 문의 내역에서 확인할 수 있어요.</p>
        {matchId ? <p className="mb-5 rounded-xl bg-[var(--tm-bg-subtle)] px-3 py-3 text-xs leading-5 text-[var(--tm-action-primary)]">방금 보던 매칭 정보가 함께 전달돼요.</p> : null}
        <form onSubmit={event => { event.preventDefault(); void submit(); }}>
          <label className="text-sm font-semibold" htmlFor="support-message">문의 내용</label>
          <textarea aria-describedby="support-message-help" className="rally-input mt-3 min-h-[190px] w-full resize-y rounded-2xl border border-[var(--tm-border-default)] bg-white p-4 text-base leading-7" disabled={submitting} id="support-message" required minLength={10} maxLength={1000} onChange={event => { setMessage(event.target.value); setSubmitError(""); }} placeholder="어떤 상황에서 불편하셨는지 알려 주세요." value={message} />
          <div id="support-message-help" className="mt-2 flex justify-between gap-3 text-[11px] text-[var(--tm-text-secondary)]"><span>10자 이상 · 비밀번호나 계좌번호는 적지 마세요.</span><span className="shrink-0">{message.trim().length}/1000</span></div>
          {submitError ? <p className="mt-3 text-sm text-[var(--tm-status-error-text)]" role="alert">{submitError}</p> : null}
          <Button className="mt-6" disabled={!valid || submitting} fullWidth loading={submitting} type="submit">문의 보내기</Button>
        </form>
      </> : <>
        {submitted ? <p className="mb-4 rounded-xl bg-[var(--tm-bg-subtle)] p-3 text-sm leading-6 text-[var(--tm-action-primary)]" role="status">문의가 접수됐어요. 확인 후 답변드릴게요.</p> : null}
        <h2 className="sr-only">내 문의 내역</h2>
        {error ? <section role="alert" className="mb-4 rounded-xl bg-white p-4"><p className="text-sm">{error}</p><Button className="mt-3" onClick={() => void load()} size="small">다시 불러오기</Button></section> : null}
        {items === null ? !error ? <CourtRallyLoader label="문의 내역을 불러오고 있어요." /> : null : items.length === 0 ? <div className="py-14 text-center"><ChatCircleText aria-hidden size={36} className="mx-auto text-[var(--tm-action-primary)]" /><p className="mt-4 font-semibold">아직 보낸 문의가 없어요</p><p className="mt-2 text-sm text-[var(--tm-text-secondary)]">필요할 때 편하게 남겨 주세요.</p></div> : <ul className="space-y-3">{visibleItems?.map((item, index) => <li key={item.id}><details className="rally-disclosure rounded-2xl border border-[var(--tm-border-default)] bg-white" open={(!submitted && item.id === inquiryId) || (submitted && index === 0) ? true : undefined} name="support-inquiry"><summary className="flex items-center gap-3 p-4"><span className="min-w-0 flex-1"><span className="text-[11px] font-semibold text-[var(--tm-action-primary)]">{item.statusLabel}</span><span className="mt-2 block truncate text-sm font-semibold">{item.message || "매칭 관련 문의"}</span><time className="mt-1 block text-[11px] text-[var(--tm-text-secondary)]">{new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(item.createdAt))}</time></span><CaretDown aria-hidden size={16} className="rally-disclosure-chevron shrink-0" /></summary><SupportThread inquiry={item} audience="member" refresh={load} embedded /></details></li>)}</ul>}
      </>}
    </div>
  </main>;
}

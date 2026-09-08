"use client";

import { useCallback, useEffect, useState } from "react";

import { BackButton } from "@/components/navigation/back-button";
import { Button } from "@/components/ui/button";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";

type Inquiry = { id: string; message: string; status: "OPEN" | "ANSWERED"; statusLabel: string; createdAt: string };

function apiMessage(body: unknown, fallback: string) {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string") return body.error.message;
  return fallback;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Seoul" }).format(new Date(value));
}

export function MSupportInquiry() {
  const [items, setItems] = useState<Inquiry[] | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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
    setSubmitting(true);
    setSubmitError("");
    setSubmitted(false);
    try {
      const response = await fetch("/api/v1/support-inquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "문의를 보내지 못했어요."));
      setMessage("");
      setSubmitted(true);
      await load();
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : "문의를 보내지 못했어요.");
    } finally {
      setSubmitting(false);
    }
  };

  const valid = message.trim().length >= 10;

  return <main className="min-h-svh bg-[var(--tm-bg-page)] px-5 pb-10 pt-6 text-[var(--tm-text-primary)]">
    <div className="mx-auto max-w-[560px]">
      <BackButton ariaLabel="마이로 돌아가기" className="inline-flex size-11 items-center justify-center rounded-full text-xl" fallbackPath="/my" />
      <h1 className="mt-4 text-2xl font-bold">1:1 문의</h1>
      <p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">궁금한 점이나 불편한 점을 남겨주시면 확인 후 도와드릴게요.</p>

      <section className="mt-5 rounded-3xl border border-[var(--tm-border-default)] bg-white p-5 shadow-[0_4px_14px_rgba(49,94,158,0.05)]">
        <label className="block text-sm font-semibold" htmlFor="support-message">문의 내용</label>
        <textarea
          className="mt-2 min-h-[140px] w-full resize-none rounded-2xl border border-[var(--tm-border-default)] p-3 text-sm leading-6"
          id="support-message"
          maxLength={1000}
          onChange={(event) => { setMessage(event.target.value); setSubmitError(""); }}
          placeholder="예: 매칭 신청 후 상대방과 연락이 닿지 않아요."
          value={message}
        />
        <p className="mt-1 text-right text-xs text-[var(--tm-text-muted)]">{message.trim().length}/1000</p>
        {submitError ? <p className="mt-1 text-sm text-[var(--tm-status-error-text)]" role="alert">{submitError}</p> : null}
        {submitted ? <p className="mt-1 text-sm text-[var(--tm-action-primary)]">문의가 접수됐어요. 확인 후 답변드릴게요.</p> : null}
        <Button className="mt-4" disabled={!valid || submitting} fullWidth loading={submitting} onClick={() => void submit()}>문의 보내기</Button>
      </section>

      <h2 className="mt-8 font-bold">내 문의 내역</h2>
      {items === null ? error ? <section className="mt-4 rounded-3xl border border-[var(--tm-border-default)] bg-white p-5"><p className="text-sm leading-6">{error}</p><Button className="mt-4" onClick={() => void load()} size="medium">다시 불러오기</Button></section> : <CourtRallyLoader className="mt-4" label="문의 내역을 불러오고 있어요." /> : items.length === 0 ? <p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">아직 보낸 문의가 없어요.</p> : <ul className="mt-3 space-y-3">
        {items.map((item) => <li className="rounded-2xl border border-[var(--tm-border-default)] bg-white p-4" key={item.id}>
          <div className="flex items-center justify-between gap-2">
            <span className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-xs font-semibold ${item.status === "ANSWERED" ? "bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]" : "bg-[var(--tm-bg-subtle-muted)] text-[var(--tm-text-secondary)]"}`}>{item.statusLabel}</span>
            <span className="text-xs text-[var(--tm-text-muted)]">{formatDate(item.createdAt)}</span>
          </div>
          <p className="mt-2 whitespace-pre-line text-sm leading-6">{item.message}</p>
        </li>)}
      </ul>}
    </div>
  </main>;
}

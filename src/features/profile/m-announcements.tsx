"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone } from "@phosphor-icons/react";

import { BackButton } from "@/components/navigation/back-button";
import { Button } from "@/components/ui/button";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";

type Announcement = { id: string; title: string; body: string; publishedAt: string };

function apiMessage(body: unknown, fallback: string) {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string") return body.error.message;
  return fallback;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(value));
}

export function MAnnouncements() {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetch("/api/v1/announcements", { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "공지사항을 불러오지 못했어요."));
      setItems((body as { items: Announcement[] }).items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "공지사항을 불러오지 못했어요.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return <main className="min-h-svh bg-[var(--tm-bg-page)] px-5 pb-10 pt-6 text-[var(--tm-text-primary)]">
    <div className="mx-auto max-w-[560px]">
      <BackButton ariaLabel="마이로 돌아가기" className="inline-flex size-11 items-center justify-center rounded-full text-xl" fallbackPath="/my" />
      <h1 className="mt-4 text-2xl font-bold">공지사항</h1>

      {items === null ? error ? <section className="mt-8 rounded-3xl border border-[var(--tm-border-default)] bg-white p-5"><p className="text-sm leading-6">{error}</p><Button className="mt-4" onClick={() => void load()} size="medium">다시 불러오기</Button></section> : <CourtRallyLoader className="mt-8" label="공지사항을 불러오고 있어요." /> : items.length === 0 ? <section className="mt-10 rounded-3xl border border-dashed border-[var(--tm-border-strong)] bg-white px-5 py-10 text-center"><Megaphone aria-hidden="true" className="mx-auto size-8 text-[var(--tm-text-muted)]" /><h2 className="mt-4 font-bold">아직 공지사항이 없어요</h2><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">새로운 소식이 있으면 이곳에 올려드릴게요.</p></section> : <ul className="mt-4 space-y-3">
        {items.map((item) => <li className="rounded-3xl border border-[var(--tm-border-default)] bg-white p-5 shadow-[0_4px_14px_rgba(49,94,158,0.05)]" key={item.id}>
          <p className="text-xs text-[var(--tm-text-muted)]">{formatDate(item.publishedAt)}</p>
          <h2 className="mt-1 font-bold">{item.title}</h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[var(--tm-text-secondary)]">{item.body}</p>
        </li>)}
      </ul>}
    </div>
  </main>;
}

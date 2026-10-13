"use client";

import { AccountPageHeader } from "@/components/navigation/account-page-header";

import { useCallback, useEffect, useState } from "react";
import { CaretDown, Megaphone } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";

type Announcement = { isPinned: boolean; id: string; title: string; body: string; publishedAt: string };

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

  return <main className="min-h-app bg-[var(--tm-bg-page)] pb-10 text-[var(--tm-text-primary)]">
    <AccountPageHeader title="공지사항" />
    <div className="mx-auto max-w-[560px] px-5">
      <p className="pb-5 pt-6 text-sm text-[var(--tm-text-secondary)]">Rally On의 새로운 소식과 이용 안내</p>
      {error ? <section role="alert" className="rounded-xl bg-white p-4"><p className="text-sm">{error}</p><Button className="mt-3" onClick={() => void load()} size="small">다시 불러오기</Button></section> : null}
      {items === null ? !error ? <CourtRallyLoader className="mt-8" label="공지사항을 불러오고 있어요." /> : null : items.length === 0 ? <section className="py-16 text-center"><Megaphone aria-hidden="true" className="mx-auto size-8 text-[var(--tm-text-muted)]" /><h2 className="mt-4 font-bold">아직 공지사항이 없어요</h2><p className="mt-2 text-sm text-[var(--tm-text-secondary)]">새로운 소식이 생기면 알려 드릴게요.</p></section> : <ul className="border-t border-[var(--tm-border-default)]">
        {items.map(item => <li className="border-b border-[var(--tm-border-default)]" key={item.id}><details className="rally-disclosure" name="announcement"><summary className="flex items-center gap-4 py-5"><span className="min-w-0 flex-1"><time className="text-[11px] text-[var(--tm-text-secondary)]">{formatDate(item.publishedAt)}</time><span className="mt-1.5 block text-[15px] font-semibold leading-6">{item.isPinned ? <span className="mr-2 rounded bg-[var(--tm-bg-subtle)] px-1.5 py-0.5 text-[11px] text-[var(--tm-action-primary)]">중요</span> : null}{item.title}</span></span><CaretDown className="rally-disclosure-chevron shrink-0 text-[var(--tm-text-secondary)]" size={16} aria-hidden /></summary><div className="mb-5 rounded-xl bg-white p-4"><h2 className="sr-only">{item.title}</h2><p className="whitespace-pre-line break-words text-sm leading-7 text-[var(--tm-text-secondary)]">{item.body}</p></div></details></li>)}
      </ul>}
    </div>
  </main>;
}

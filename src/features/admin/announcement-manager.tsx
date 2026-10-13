"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus, CaretRight, Megaphone } from "@phosphor-icons/react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { apiMessage } from "@/features/partner/partner-session";
import type { AdminAnnouncement } from "@/server/domain/announcement-service";

export const announcementStatusLabels = { DRAFT: "초안", PUBLISHED: "공개 중", HIDDEN: "숨김" };
export function AnnouncementManager() {
  const [status, setStatus] = useState("");
  const [items, setItems] = useState<AdminAnnouncement[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async (next?: string, signal?: AbortSignal) => {
    setBusy(true); setError("");
    try {
      const params = new URLSearchParams({ ...(status ? { status } : {}), ...(next ? { cursor: next } : {}) });
      const response = await fetch(`/api/internal/announcements?${params}`, { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok) throw new Error(apiMessage(data, "공지를 불러오지 못했어요."));
      setItems(old => next ? [...old, ...data.items] : data.items); setCursor(data.nextCursor);
    } catch (caught) { if (!signal?.aborted) setError(caught instanceof Error ? caught.message : "공지를 불러오지 못했어요."); }
    finally { if (!signal?.aborted) setBusy(false); }
  }, [status]);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => void load(undefined, controller.signal), 0); return () => { clearTimeout(timer); controller.abort(); }; }, [load]);
  return <main className="min-h-app bg-[var(--tm-bg-page)] px-5 pb-12 pt-4 text-[var(--tm-text-primary)]"><div className="mx-auto max-w-[640px]">
    <PageHeader title="공지사항 관리" backHref="/internal" />
    <Link href="/internal/announcements/new" className="mt-5 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--tm-action-primary)] px-4 text-sm font-bold text-white"><Plus aria-hidden size={18} />새 공지 작성</Link>
    <div className="mb-5 mt-6 flex gap-2" aria-label="공지 상태">{[["", "전체"], ...Object.entries(announcementStatusLabels)].map(([value, label]) => <button key={value} type="button" disabled={busy} aria-pressed={status === value} onClick={() => setStatus(value)} className={`min-h-11 flex-1 rounded-xl px-2 text-sm font-semibold ${status === value ? "bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]" : "text-[var(--tm-text-secondary)]"}`}>{label}</button>)}</div>
    {error ? <div role="alert" className="my-4 text-sm"><p>{error}</p><Button size="small" className="mt-3" onClick={() => void load()}>다시 불러오기</Button></div> : null}
    {busy ? <CourtRallyLoader label="공지를 불러오고 있어요." /> : null}
    {!busy && !error && !items.length ? <div className="py-14 text-center"><Megaphone aria-hidden size={32} className="mx-auto text-[var(--tm-text-muted)]" /><p className="mt-4 font-semibold">아직 등록된 공지가 없어요</p><p className="mt-2 text-sm text-[var(--tm-text-secondary)]">안내할 소식을 초안으로 저장해 보세요.</p></div> : null}
    <ul className="space-y-3">{items.map(item => <li key={item.id}><Link href={`/internal/announcements/${item.id}`} className="flex items-center gap-3 rounded-2xl border border-[var(--tm-border-default)] bg-white p-4"><span className="min-w-0 flex-1"><span className="text-xs font-semibold text-[var(--tm-action-primary)]">{announcementStatusLabels[item.status]}{item.isPinned ? " · 상단 고정" : ""}</span><span className="mt-2 block break-words font-semibold leading-6">{item.title}</span><span className="mt-2 block text-[11px] text-[var(--tm-text-secondary)]">수정 {new Date(item.updatedAt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</span></span><CaretRight aria-hidden size={18} /></Link></li>)}</ul>
    {cursor ? <Button className="mt-5" fullWidth variant="secondary" disabled={busy} onClick={() => void load(cursor)}>더 보기</Button> : null}
  </div></main>;
}

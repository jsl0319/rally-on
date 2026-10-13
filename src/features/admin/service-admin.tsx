"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CaretRight, ChatCircleText, Megaphone, ShieldCheck } from "@phosphor-icons/react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { apiMessage } from "@/features/partner/partner-session";
import { LOGIN_SUPPORT_EMAIL, LOGIN_SUPPORT_HREF } from "@/lib/support-contact";

type Overview = { needsReply: number; waitingOperator: number; drafts: number };
export function ServiceAdmin() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/internal/overview", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "관리 현황을 불러오지 못했어요."));
      setOverview(body);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "관리 현황을 불러오지 못했어요."); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  return <main className="min-h-app bg-[var(--tm-bg-page)] px-5 pb-12 pt-4 text-[var(--tm-text-primary)]"><div className="mx-auto max-w-[640px]">
    <PageHeader title="서비스 관리" backHref="/my" description="문의와 공지, 오늘 확인할 일을 한곳에서" />
    {error ? <div role="alert" className="mt-5 rounded-xl bg-white p-4"><p className="text-sm">{error}</p><Button className="mt-3" size="small" onClick={() => void load()}>다시 불러오기</Button></div> : null}
    {!overview && !error ? <CourtRallyLoader className="my-6" label="관리 현황을 불러오고 있어요." /> : null}
    <section className="mt-6 space-y-3" aria-label="문의와 공지 관리">
      <Link href="/internal/support-inquiries" className="flex items-center gap-4 rounded-2xl border border-[var(--tm-border-default)] bg-white p-5"><ChatCircleText className="size-7 shrink-0 text-[var(--tm-action-primary)]" aria-hidden /><span className="min-w-0 flex-1"><span className="block font-bold">1:1 문의 처리</span><span className="mt-2 block text-sm text-[var(--tm-text-secondary)]">{overview ? `답변할 문의 ${overview.needsReply}건 · 운영자 확인 중 ${overview.waitingOperator}건` : "접수된 문의와 답변 관리"}</span></span><CaretRight aria-hidden size={18} /></Link>
      <Link href="/internal/announcements" className="flex items-center gap-4 rounded-2xl border border-[var(--tm-border-default)] bg-white p-5"><Megaphone className="size-7 shrink-0 text-[var(--tm-action-primary)]" aria-hidden /><span className="min-w-0 flex-1"><span className="block font-bold">공지사항 관리</span><span className="mt-2 block text-sm text-[var(--tm-text-secondary)]">{overview ? `저장된 초안 ${overview.drafts}건` : "공지 작성과 공개 상태 관리"}</span></span><CaretRight aria-hidden size={18} /></Link>
    </section>
    <h2 className="mb-2 mt-8 text-xs font-semibold text-[var(--tm-text-secondary)]">운영 확인</h2>
    <nav className="divide-y divide-[var(--tm-border-subtle)] rounded-2xl bg-white px-4" aria-label="운영 확인">{[["/internal/operator-applications", "코트 운영자 등록 심사"], ["/internal/chat-reports", "채팅 신고 확인"], ["/internal/court-handoffs", "운영 중단 거래 인계"]].map(([href, title]) => <Link key={href} href={href} className="flex min-h-14 items-center gap-3 py-3 text-sm"><ShieldCheck aria-hidden size={18} /><span className="flex-1">{title}</span><CaretRight aria-hidden size={16} /></Link>)}</nav>
    <aside className="mt-7 border-t border-[var(--tm-border-default)] pt-5 text-xs leading-6 text-[var(--tm-text-secondary)]"><p className="font-semibold">로그인 문제 문의 메일</p><a className="break-all underline underline-offset-4" href={LOGIN_SUPPORT_HREF}>{LOGIN_SUPPORT_EMAIL}</a><p>메일함은 직접 확인해 주세요. 앱 문의는 위 목록에서 답변해요.</p></aside>
  </div></main>;
}

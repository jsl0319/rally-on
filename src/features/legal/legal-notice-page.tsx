import Link from "next/link";

import { getSafeReturnTo } from "@/navigation/return-to";

type NoticeSection = {
  title: string;
  body: string;
};

type LegalNoticePageProps = {
  title: string;
  summary: string;
  sections: NoticeSection[];
  notice: string;
  /** 어디에서 들어왔는지. 마이에서 열었으면 마이로 돌아가야 한다. */
  returnTo?: string;
};

/** 로그인 전 화면에서 열면 `/`가 로그인 화면이고, 로그인 후에는 매칭 목록이다. */
const backLabels: Record<string, string> = {
  "/": "로그인 화면으로",
  "/my": "마이로 돌아가기",
};

export function LegalNoticePage({ title, summary, sections, notice, returnTo }: LegalNoticePageProps) {
  const backHref = getSafeReturnTo(returnTo, "/");
  const backLabel = backLabels[backHref] ?? "돌아가기";

  return (
    <main className="min-h-svh bg-[var(--tm-bg-page)] px-5 py-6 text-[var(--tm-text-primary)]">
      <article className="mx-auto max-w-[560px] pb-10">
        <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--tm-action-primary)]" href={backHref}>
          ← {backLabel}
        </Link>
        <header className="mt-6 border-b border-[var(--tm-border-default)] pb-6">
          <p className="text-sm font-semibold text-[var(--tm-action-primary)]">Rally On 비공개 MVP 안내</p>
          <h1 className="mt-2 text-2xl font-bold leading-tight">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">{summary}</p>
          <p className="mt-3 text-xs text-[var(--tm-text-secondary)]">시행일 · 2026년 8월 23일</p>
        </header>

        <div className="mt-6 space-y-4">
          {sections.map((section) => (
            <section className="rounded-3xl border border-[var(--tm-border-default)] bg-white p-5" key={section.title}>
              <h2 className="text-base font-bold">{section.title}</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--tm-text-muted)]">{section.body}</p>
            </section>
          ))}
        </div>

        <section className="mt-4 rounded-3xl bg-[var(--tm-bg-subtle)] p-5">
          <h2 className="text-sm font-semibold text-[var(--tm-action-primary)]">확인해 주세요</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--tm-text-muted)]">{notice}</p>
        </section>
      </article>
    </main>
  );
}

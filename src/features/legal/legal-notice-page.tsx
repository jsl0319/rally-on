import { BackButton } from "@/components/navigation/back-button";
import Link from "next/link";

import { getSafeReturnTo } from "@/navigation/return-to";

type NoticeSection = {
  title: string;
  body: string;
};

type LegalNoticePageProps = {
  title: string;
  summary: string;
  updatedDate: string;
  sections: NoticeSection[];
  notice: string;
  /** 어디에서 들어왔는지. 마이에서 열었으면 마이로 돌아가야 한다. */
  returnTo?: string;
};

export function LegalNoticePage({ title, summary, updatedDate, sections, notice, returnTo }: LegalNoticePageProps) {
  const backHref = getSafeReturnTo(returnTo, "/");

  return (
    <main className="min-h-app bg-[var(--tm-bg-page)] text-[var(--tm-text-primary)]">
      <div className="rally-sticky-header border-b border-[var(--tm-border-subtle)]"><div className="mx-auto flex min-h-14 max-w-[560px] items-center gap-2 px-5"><BackButton fallbackPath={backHref} /><span className="text-sm font-medium">이전 화면</span></div></div>
      <article className="mx-auto max-w-[560px] px-5 pb-12">
        <header className="pb-6 pt-7">
          <p className="text-[11px] font-semibold tracking-wide text-[var(--tm-action-primary)]">Rally On 비공개 MVP 안내</p>
          <h1 className="mt-3 text-[26px] font-bold leading-tight tracking-[-.8px]">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">{summary}</p>
          <p className="mt-3 text-xs text-[var(--tm-text-secondary)]">안내 갱신일 · {updatedDate}</p>
        </header>

        <nav aria-label={`${title} 목차`} className="rounded-2xl bg-white p-5"><h2 className="mb-2 text-sm font-bold">목차</h2><ol>{sections.map((section, index) => <li key={section.title}><Link className="flex min-h-11 items-center gap-3 py-2 text-[13px] text-[var(--tm-action-primary)] underline-offset-4 hover:underline" href={`#policy-section-${index + 1}`}><span aria-hidden className="w-4 shrink-0 text-[11px] text-[var(--tm-text-secondary)]">{String(index + 1).padStart(2, "0")}</span>{section.title}</Link></li>)}</ol></nav>
        <div className="mt-6 divide-y divide-[var(--tm-border-default)]">
          {sections.map((section, index) => (
            <section className="scroll-mt-24 py-6" id={`policy-section-${index + 1}`} key={section.title}>
              <h2 className="text-[17px] font-bold leading-7">{section.title}</h2>
              <p className="mt-3 whitespace-pre-line break-words text-sm leading-7 text-[var(--tm-text-secondary)]">{section.body}</p>
            </section>
          ))}
        </div>

        <section className="mt-4 border-l-2 border-[var(--tm-action-primary)] bg-[var(--tm-bg-subtle)] p-4">
          <h2 className="text-sm font-semibold text-[var(--tm-action-primary)]">확인해 주세요</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--tm-text-muted)]">{notice}</p>
        </section>
      </article>
    </main>
  );
}

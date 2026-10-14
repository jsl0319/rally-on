import Link from "next/link";

export function MatchCreateButton() {
  return <Link aria-label="매칭 만들기" className="fixed bottom-[calc(var(--rally-navigation-height)+8px)] right-[max(20px,calc((100vw-520px)/2))] z-30 inline-flex min-h-[52px] items-center gap-2 rounded-full bg-[var(--tm-action-primary)] px-5 text-sm font-semibold text-white shadow-[0_6px_20px_#174c3c26] transition-transform active:scale-95" href="/matches/new">
    <span aria-hidden="true" className="text-lg leading-none text-[var(--tm-tennis-ball)]">+</span>
    매칭 만들기
  </Link>;
}

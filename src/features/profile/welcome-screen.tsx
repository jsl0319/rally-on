import Image from "next/image";
import Link from "next/link";
import { ChatCircle } from "@phosphor-icons/react/dist/ssr";
import { Brand } from "@/components/ui/brand";

export function WelcomeScreen({ loading, onSignIn, onOperator, error }: {
  loading: boolean; onSignIn: () => void; onOperator?: () => void; error?: string;
}) {
  return <main className="bg-[var(--tm-bg-page)] text-[var(--tm-text-primary)]">
    <section className="rally-welcome">
      <header className="flex items-center justify-between"><Brand /><span className="text-xs text-[var(--tm-text-secondary)]">테니스, 함께 시작해요</span></header>
      <div className="mt-10"><p className="rally-eyebrow">YOUR NEXT RALLY</p><h1 className="rally-title mt-3">잘 치지 않아도,<br />같이 칠 수 있으니까.</h1><p className="mt-4 text-[15px] leading-6 text-[var(--tm-text-secondary)]">나와 비슷한 메이트를 만나<br />레슨 밖의 테니스를 시작해 보세요.</p></div>
      <Image alt="초록 코트에서 편하게 공을 주고받는 두 테니스 메이트의 일러스트" className="rally-welcome-art" src="/images/brand/welcome-court.webp" width={1200} height={800} priority />
      <div className="mt-auto">
        <div className="mb-6 flex justify-between gap-2 text-xs font-medium text-[var(--tm-text-secondary)]"><span>비슷한 플레이</span><span aria-hidden>·</span><span>준비된 코트</span><span aria-hidden>·</span><span>부담 없는 첫 만남</span></div>
        {error ? <p className="mb-3 rounded-xl bg-[var(--tm-status-error-bg)] p-3 text-sm text-[var(--tm-status-error-text)]" role="alert">{error}</p> : null}
        <button className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-[#FEE500] px-4 font-bold text-[#191919] disabled:opacity-60" disabled={loading} onClick={onSignIn} type="button"><ChatCircle aria-hidden weight="fill" size={21} />{loading ? "카카오 연결 중…" : "카카오로 시작하기"}</button>
        {onOperator ? <button className="mt-2 min-h-11 w-full text-sm text-[var(--tm-text-secondary)] underline underline-offset-4" disabled={loading} onClick={onOperator} type="button">테니스장을 운영하고 계신가요?</button> : <p className="mt-3 text-center text-xs text-[var(--tm-text-secondary)]">로그인 후 보던 화면으로 돌아가요.</p>}
        <p className="mt-5 text-center text-[11px] leading-5 text-[var(--tm-text-secondary)]">계속하면 <Link href="/terms" className="underline">이용약관</Link>과 <Link href="/privacy" className="underline">개인정보 처리방침</Link>에 동의합니다.</p>
      </div>
    </section>
  </main>;
}

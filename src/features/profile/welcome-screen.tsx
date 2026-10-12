import { EntryBrand, EntryCourt } from "@/components/ui/entry-brand";
import Link from "next/link";
import { AppleLogo, ChatCircle } from "@phosphor-icons/react/dist/ssr";

export function WelcomeScreen({ loading, onSignIn, onOperator, error }: {
  loading: boolean; onSignIn: () => void; onOperator: () => void; error?: string;
}) {
  return <main className="rally-welcome-surface text-[var(--tm-text-primary)]">
    <EntryCourt />
    <section className="rally-welcome">
      <EntryBrand />
      <div className="rally-welcome-actions rally-entry-reveal" data-entry-actions>
        {error ? <p className="mb-3 rounded-xl bg-[var(--tm-status-error-bg)] p-3 text-sm text-[var(--tm-status-error-text)]" role="alert">{error}</p> : null}
        <div className="rally-welcome-providers">
          <button className="rally-welcome-provider rally-welcome-kakao" disabled={loading} onClick={onSignIn} type="button">
            <ChatCircle aria-hidden weight="fill" size={22} />
            <span>{loading ? "카카오 연결 중…" : "카카오로 시작하기"}</span>
          </button>
          <button className="rally-welcome-provider rally-welcome-apple" disabled aria-describedby="apple-login-status" type="button">
            <AppleLogo aria-hidden weight="fill" size={23} />
            <span>Apple로 시작하기 <span className="rally-welcome-soon" id="apple-login-status">준비 중</span></span>
          </button>
        </div>
        <button className="rally-welcome-operator" disabled={loading} onClick={onOperator} type="button">테니스장을 운영하고 계신가요?</button>
        <p className="rally-welcome-terms">계속하면 <Link href="/terms">이용약관</Link>과 <Link href="/privacy">개인정보 처리방침</Link>에<br />동의합니다.</p>
      </div>
    </section>
  </main>;
}

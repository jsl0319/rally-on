import Link from "next/link";
import { AppleLogo, ChatCircle } from "@phosphor-icons/react/dist/ssr";

export function WelcomeScreen({ loading, onSignIn, onOperator, error }: {
  loading: boolean; onSignIn: () => void; onOperator: () => void; error?: string;
}) {
  return <main className="rally-welcome-surface text-[var(--tm-text-primary)]">
    <svg className="rally-welcome-court" viewBox="0 0 440 680" fill="none" aria-hidden="true" focusable="false">
      <g stroke="currentColor" strokeWidth="2">
        <path d="M20 20H420V660H20Z M70 20V660 M370 20V660 M20 340H420 M70 180H370 M70 500H370 M220 180V500" />
      </g>
    </svg>
    <section className="rally-welcome">
      <div className="rally-welcome-identity">
        <h1 className="rally-welcome-wordmark" aria-label="Rally On">
          <span aria-hidden="true">Rally</span>
          <span className="rally-welcome-on" aria-hidden="true">
            <svg className="rally-welcome-ball" viewBox="0 0 80 80" fill="none" focusable="false">
              <circle cx="40" cy="40" r="37" fill="currentColor" />
              <path d="M16 12C45 25 45 55 16 68M64 12C35 25 35 55 64 68" stroke="#fffef2" strokeWidth="4" strokeLinecap="round" />
            </svg>
            <span>n</span>
          </span>
        </h1>
        <p className="rally-welcome-slogan">부담 없이, 함께 테니스.</p>
        <p className="rally-welcome-purpose">나와 비슷한 메이트를 만나요.</p>
      </div>
      <div className="rally-welcome-actions">
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

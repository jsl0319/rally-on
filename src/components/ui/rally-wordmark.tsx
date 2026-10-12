/** One identity shared by the launch and sign-in screens. */
export function RallyWordmark({ className = "" }: { className?: string }) {
  return <span className={`rally-welcome-wordmark ${className}`} role="img" aria-label="Rally On">
    <span aria-hidden="true">Rally</span>
    <span className="rally-welcome-on" aria-hidden="true">
      <svg className="rally-welcome-ball" viewBox="0 0 80 80" fill="none" focusable="false">
        <circle cx="40" cy="40" r="37" fill="currentColor" />
        <path d="M16 12C45 25 45 55 16 68M64 12C35 25 35 55 64 68" stroke="#fffef2" strokeWidth="4" strokeLinecap="round" />
      </svg><span>n</span>
    </span>
  </span>;
}

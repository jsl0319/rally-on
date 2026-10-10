import type { ReactNode } from "react";

/** Position the container, not WDS's full-width button, against the viewport. */
export function BottomActionBar({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return <footer className="rally-bottom-action">
    <div className={compact ? "mx-auto w-full max-w-[390px]" : "mx-auto w-full max-w-[560px]"}>{children}</div>
  </footer>;
}

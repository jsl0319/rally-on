import type { ReactNode } from "react";
import { BackButton } from "@/components/navigation/back-button";

/** Shared hierarchy for secondary, operator, and review pages. */
export function PageHeader({ title, description, backHref, eyebrow, actions }: {
  title: ReactNode;
  description?: ReactNode;
  backHref?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return <header className="rally-page-header">
    {eyebrow ? <p className="rally-eyebrow mb-2">{eyebrow}</p> : null}
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {backHref ? <div className="-ml-2 shrink-0"><BackButton fallbackPath={backHref} /></div> : null}
        <h1 className="rally-page-title min-w-0">{title}</h1>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
    {description ? <p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">{description}</p> : null}
  </header>;
}

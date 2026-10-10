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
    {backHref ? <div className="mb-4 -ml-2"><BackButton fallbackPath={backHref} /></div> : null}
    {eyebrow ? <p className="rally-eyebrow mb-2">{eyebrow}</p> : null}
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <h1 className="rally-page-title min-w-0 flex-1">{title}</h1>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
    {description ? <p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">{description}</p> : null}
  </header>;
}

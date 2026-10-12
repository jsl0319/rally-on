import type { ReactNode } from "react";
import { BackButton } from "./back-button";

export function AccountPageHeader({ title, backHref = "/my", actions }: { title: string; backHref?: string; actions?: ReactNode }) {
  return <header className="rally-sticky-header border-b border-[var(--tm-border-subtle)]" data-sticky-page-header>
    <div className="mx-auto flex min-h-14 w-full max-w-[560px] items-center gap-2 px-4">
      <BackButton className="grid size-11 shrink-0 place-items-center rounded-full" fallbackPath={backHref} />
      <h1 className="min-w-0 flex-1 text-[16px] font-bold tracking-[-.4px]">{title}</h1>
      {actions}
    </div>
  </header>;
}

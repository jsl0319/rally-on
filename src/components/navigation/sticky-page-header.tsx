import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/page-header";

export function StickyPageHeader({ title, actions, backHref }: { title: ReactNode; actions?: ReactNode; backHref?: string }) {
  return <div className="rally-sticky-header" data-sticky-page-header>
    <div className="mx-auto w-full max-w-[560px] px-5 py-3"><PageHeader title={title} actions={actions} backHref={backHref} /></div>
  </div>;
}

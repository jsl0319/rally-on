"use client";

import { useEffect, useState } from "react";
import { EntryBrand, EntryCourt } from "@/components/ui/entry-brand";

/** Keep the sign-in layout stable while the server and session are becoming ready. */
export function BrandLaunch() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 10000);
    return () => window.clearTimeout(timer);
  }, []);
  return <main className="rally-launch rally-welcome-surface" data-brand-launch>
    <EntryCourt />
    <section className="rally-welcome">
      <EntryBrand />
      <div className="rally-welcome-actions" aria-hidden />
    </section>
    <span className="sr-only" role="status">Rally On을 준비하고 있어요.</span>
    {slow ? <div className="rally-launch-recovery" role="status"><p>연결이 평소보다 오래 걸리고 있어요.</p><button className="mt-2 min-h-11 rounded-xl border border-[var(--tm-action-primary)] px-5 font-semibold text-[var(--tm-action-primary)]" onClick={() => window.location.reload()} type="button">다시 연결</button></div> : null}
  </main>;
}

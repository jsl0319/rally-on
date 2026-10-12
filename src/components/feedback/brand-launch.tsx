"use client";

import { useEffect, useState } from "react";
import { RallyWordmark } from "@/components/ui/rally-wordmark";

/** A real loading fallback, never an artificial delay before showing usable content. */
export function BrandLaunch() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 10000);
    return () => window.clearTimeout(timer);
  }, []);
  return <main className="rally-launch rally-welcome-surface" data-brand-launch>
    <svg className="rally-welcome-court" viewBox="0 0 440 680" fill="none" aria-hidden="true" focusable="false"><path d="M20 20H420V660H20Z M70 20V660 M370 20V660 M20 340H420 M70 180H370 M70 500H370 M220 180V500" stroke="currentColor" strokeWidth="2" /></svg>
    <div className="rally-launch-identity">
      <RallyWordmark />
      <p className="mt-6 text-center text-[20px] font-bold leading-7 tracking-[-.4px]">부담 없이, 함께 테니스</p>
      <p className="mt-2 text-center text-[14px] font-medium leading-6 text-[var(--tm-text-secondary)]">나와 비슷한 메이트를 만나요</p>
    </div>
    <span className="sr-only" role="status">Rally On을 준비하고 있어요.</span>
    {slow ? <div className="rally-launch-recovery" role="status"><p>연결이 평소보다 오래 걸리고 있어요.</p><button className="mt-2 min-h-11 rounded-xl border border-[var(--tm-action-primary)] px-5 font-semibold text-[var(--tm-action-primary)]" onClick={() => window.location.reload()} type="button">다시 연결</button></div> : null}
  </main>;
}

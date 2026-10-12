"use client";

import { ArrowDown, ArrowClockwise } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

const threshold = 60;

/** Refresh only this page's reads; never reload the document or discard form state. */
export function PullToRefresh({ children, onRefresh, disabled = false }: {
  children: ReactNode;
  onRefresh: () => Promise<void>;
  disabled?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const action = useRef(onRefresh);
  const blocked = useRef(disabled);
  const busy = useRef(false);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => { action.current = onRefresh; blocked.current = disabled; }, [onRefresh, disabled]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let start: { x: number; y: number } | null = null;
    let pulled = 0;
    let mounted = true;
    const reset = () => { start = null; pulled = 0; setDistance(0); };
    const refresh = async () => {
      if (busy.current || blocked.current) return;
      busy.current = true;
      setRefreshing(true);
      setError(false);
      try { await action.current(); }
      catch { if (mounted) setError(true); }
      finally { busy.current = false; if (mounted) setRefreshing(false); }
    };
    const begin = (event: TouchEvent) => {
      reset();
      if (busy.current || blocked.current || event.touches.length !== 1 || window.scrollY > 1 || (window.visualViewport?.scale ?? 1) > 1) return;
      if ([...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].some(dialog => dialog.getClientRects().length > 0)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [data-no-pull-refresh]')) return;
      // A sheet, picker or independently scrolling region owns its own gesture.
      for (let node = target; node && node !== element; node = node.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) return;
      }
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const move = (event: TouchEvent) => {
      if (!start) return;
      if (event.touches.length !== 1 || window.scrollY > 1 || blocked.current) { reset(); return; }
      const dx = Math.abs(event.touches[0].clientX - start.x);
      const dy = event.touches[0].clientY - start.y;
      if (dy < 0 || dx > Math.max(12, dy)) { reset(); return; }
      if (dy < 8) return;
      if (!event.cancelable) { reset(); return; }
      event.preventDefault();
      pulled = Math.min(88, dy * 0.5);
      setDistance(pulled);
    };
    const end = () => {
      const ready = pulled >= threshold;
      reset();
      if (ready) void refresh();
    };
    const accessibleRefresh = () => { void refresh(); };
    element.addEventListener("touchstart", begin, { passive: true });
    element.addEventListener("touchmove", move, { passive: false });
    element.addEventListener("touchend", end);
    element.addEventListener("touchcancel", reset);
    element.addEventListener("rally-refresh", accessibleRefresh);
    document.documentElement.classList.add("rally-pull-refresh-page");
    return () => {
      mounted = false;
      element.removeEventListener("touchstart", begin);
      element.removeEventListener("touchmove", move);
      element.removeEventListener("touchend", end);
      element.removeEventListener("touchcancel", reset);
      element.removeEventListener("rally-refresh", accessibleRefresh);
      document.documentElement.classList.remove("rally-pull-refresh-page");
    };
  }, []);

  return <div ref={root} className="min-h-app" data-pull-to-refresh>
    <button type="button" disabled={disabled || refreshing} className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-[calc(var(--rally-safe-top)+72px)] focus:z-50 focus:rounded-xl focus:bg-white focus:p-3" onClick={() => root.current?.dispatchEvent(new Event("rally-refresh"))}>현재 목록 새로고침</button>
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--rally-safe-top)+72px)] z-40 flex justify-center" role="status" aria-live="polite">
      {refreshing || distance > 8 || error ? <span className="inline-flex items-center gap-2 rounded-full border border-[var(--tm-border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--tm-action-primary)] shadow-sm">
        {refreshing ? <ArrowClockwise size={16} className="animate-spin motion-reduce:animate-none" aria-hidden /> : <ArrowDown size={16} style={{ transform: distance >= threshold ? "rotate(180deg)" : undefined }} aria-hidden />}
        {refreshing ? "새로고침 중" : error ? "새로고침하지 못했어요. 다시 당겨 주세요." : distance >= threshold ? "놓으면 새로고침" : "당겨서 새로고침"}
      </span> : null}
    </div>
    {children}
  </div>;
}

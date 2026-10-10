"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiMessage } from "./partner-session";

/** Revalidate on return and business deadlines, without keeping the database awake by polling. */
export function useCourtDetail<T>(url: string, deadlines: (data: T) => (string | null | undefined)[]) {
  const [snapshot, setSnapshot] = useState<{ url: string; data: T; checkedAt: string } | null>(null);
  const [failure, setFailure] = useState<{ url: string; message: string } | null>(null);
  // App Router can reuse the component when navigating between two court matches.
  const data = snapshot?.url === url ? snapshot.data : null;
  const checkedAt = snapshot?.url === url ? snapshot.checkedAt : null;
  const error = failure?.url === url ? failure.message : "";
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    const id = ++sequence.current;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    const timeout = window.setTimeout(() => current.abort(), 20_000);
    try {
      const response = await fetch(url, { cache: "no-store", signal: current.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "최신 상태를 불러오지 못했어요."));
      if (sequence.current !== id) return;
      setSnapshot({ url, data: body as T, checkedAt: new Date().toISOString() }); setFailure(null);
    } catch (caught) {
      if (sequence.current !== id) return;
      const message = current.signal.aborted ? "응답이 늦어지고 있어요. 다시 확인해 주세요." : caught instanceof Error ? caught.message : "최신 상태를 불러오지 못했어요.";
      setFailure({ url, message });
      throw new Error(message);
    } finally { window.clearTimeout(timeout); }
  }, [url]);
  const reload = useCallback(() => { void load().catch(() => undefined); }, [load]);
  const cancelLoad = useCallback(() => { ++sequence.current; controller.current?.abort(); }, []);
  useEffect(() => {
    let timer = window.setTimeout(reload, 0);
    const resume = () => {
      if (document.visibilityState !== "visible") return;
      window.clearTimeout(timer);
      timer = window.setTimeout(reload, 200);
    };
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      cancelLoad(); window.clearTimeout(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [reload, cancelLoad]);

  const deadlineKey = JSON.stringify(data ? deadlines(data) : []);
  useEffect(() => {
    const values = (JSON.parse(deadlineKey) as (string | null | undefined)[])
      .filter((v): v is string => Boolean(v)).map((v) => Date.parse(v)).filter((v) => v > Date.now()).sort((a, b) => a - b);
    let timer: number | undefined;
    const schedule = () => {
      const next = values[0];
      if (!next) return;
      timer = window.setTimeout(() => {
        if (Date.now() >= next) {
          while (values.length && values[0] <= Date.now()) values.shift();
          if (document.visibilityState === "visible") reload();
        }
        schedule();
      }, Math.min(2_147_000_000, Math.max(0, next - Date.now() + 500)));
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [deadlineKey, reload, checkedAt]);
  return { data, error, checkedAt, load, reload };
}

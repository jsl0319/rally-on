"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { SupportInquiryView } from "@/server/domain/support-service";
import { Button } from "@/components/ui/button";
import { apiMessage } from "@/features/partner/partner-session";
import { SupportThread } from "./support-thread";

export function SupportQueue({ audience }: { audience: "reviewer" | "operator" }) {
  const [items, setItems] = useState<SupportInquiryView[]>([]);
  const [status, setStatus] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const endpoint = audience === "reviewer" ? "/api/internal/support-inquiries" : "/api/v1/operator/support-inquiries";
  const load = useCallback(async (next?: string) => {
    setBusy(true); setError("");
    try {
      const params = new URLSearchParams({ ...(status ? { status } : {}), ...(next ? { cursor: next } : {}) });
      const response = await fetch(`${endpoint}?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(apiMessage(data, "문의를 불러오지 못했어요."));
      setItems((old) => next ? [...old, ...data.items] : data.items); setCursor(data.nextCursor);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "불러오지 못했어요."); }
    finally { setBusy(false); }
  }, [endpoint, status]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  return <main className="min-h-svh bg-slate-50 px-5 py-8 text-slate-800"><div className="mx-auto max-w-[640px]">
    <Link href={audience === "reviewer" ? "/internal/operator-applications" : "/partner"} className="inline-block min-h-11 text-sm text-blue-600">← 돌아가기</Link>
    <h1 className="text-2xl font-bold">{audience === "reviewer" ? "1:1 문의 처리" : "담당자 대조 요청"}</h1>
    <label className="mt-5 block text-sm">처리 상태<select className="ml-3 rounded-xl border border-slate-200 bg-white p-3" value={status} onChange={(e) => setStatus(e.target.value)}>{[["", "전체"], ["OPEN", "접수됨"], ["IN_PROGRESS", "검토 중"], ["WAITING_OPERATOR", "운영자 확인 중"], ["ANSWERED", "답변 완료"], ["RESOLVED", "해결 완료"]].map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
    <Button className="mt-3" disabled={busy} size="medium" variant="secondary" onClick={() => void load()}>새로고침</Button>
    {error ? <p className="mt-4 text-rose-700" role="alert">{error}</p> : null}
    {!busy && !error && !items.length ? <p className="mt-6 text-sm text-slate-500">해당 상태의 문의가 없어요.</p> : null}
    {busy ? <p role="status" className="mt-4 text-sm text-slate-500">문의를 불러오고 있어요.</p> : null}
    <div className="mt-5 space-y-5">{items.map((i) => <SupportThread key={i.id} inquiry={i} audience={audience} refresh={() => load()} />)}</div>
    {cursor ? <Button className="mt-5" disabled={busy} fullWidth onClick={() => void load(cursor)}>더 보기</Button> : null}
  </div></main>;
}

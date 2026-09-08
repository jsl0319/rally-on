"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { FormControl, FormField, FormLabel, TextField } from "@wanteddev/wds";

import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { BackButton } from "@/components/navigation/back-button";
import { Button } from "@/components/ui/button";
import { bankNames } from "@/matches/bank-list";

type Court = {
  id: string;
  name: string;
  settlementAccount: { bank: string; accountNumber: string; accountHolder: string } | null;
};

function apiMessage(body: unknown, fallback: string) {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error = body.error;
    if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") return error.message;
  }
  return fallback;
}

export function OperatorSettlementAccount() {
  const [court, setCourt] = useState<Court | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ bank: "", accountNumber: "", accountHolder: "" });

  const load = useCallback(async () => {
    try {
      setLoadError("");
      const response = await fetch("/api/v1/operator/courts", { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "코트장 정보를 불러오지 못했어요."));
      const first = (body as { items: Court[] }).items[0] ?? null;
      if (!first) throw new Error("먼저 코트장을 등록해 주세요.");
      setCourt(first);
      if (first.settlementAccount) setForm(first.settlementAccount);
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "코트장 정보를 불러오지 못했어요.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const set = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  };

  const submit = async () => {
    if (!court) return;
    setError("");
    setSaved(false);
    if (!form.bank.trim()) return setError("은행을 선택해 주세요.");
    if (!/^(?=.*[0-9])[0-9-]{5,40}$/.test(form.accountNumber.trim())) return setError("계좌번호는 숫자와 하이픈으로 5~40자 입력해 주세요.");
    if (!form.accountHolder.trim()) return setError("예금주를 입력해 주세요.");

    setSaving(true);
    try {
      const response = await fetch(`/api/v1/operator/courts/${encodeURIComponent(court.id)}/settlement-account`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bank: form.bank.trim(), accountNumber: form.accountNumber.trim(), accountHolder: form.accountHolder.trim() }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "입금 계좌를 저장하지 못했어요."));
      setCourt(body as Court);
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "입금 계좌를 저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  };

  if (!court) {
    return <main className="grid min-h-svh place-items-center bg-[var(--tm-bg-page)] px-5 text-center text-[var(--tm-text-primary)]">
      {loadError
        ? <div><p className="text-lg font-bold">입금 계좌를 설정할 수 없어요</p><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">{loadError}</p><Button as={Link} className="mt-5" href="/partner" size="medium">운영 홈으로</Button></div>
        : <CourtRallyLoader label="코트장 정보를 확인하고 있어요." />}
    </main>;
  }

  return <main className="min-h-svh bg-[var(--tm-bg-page)] px-5 pb-32 pt-6 text-[var(--tm-text-primary)]">
    <section className="mx-auto max-w-[560px]">
      <BackButton className="inline-flex size-11 items-center justify-center rounded-full text-xl" fallbackPath="/partner" />
      <p className="mt-5 text-sm font-semibold text-[var(--tm-action-primary)]">입금 계좌 관리</p>
      <h1 className="mt-1 text-2xl font-bold">참가비를 받을<br />계좌를 등록해요</h1>
      <p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">{court.name}에서 여는 코트 매칭의 참가비를 받을 계좌예요. 참가자에게는 승인된 뒤에만 보여요.</p>

      <section className="mt-6 rounded-3xl bg-white p-5 shadow-[0_10px_30px_rgba(29,50,84,0.06)]">
        <div className="grid gap-4">
          <FormField>
            <FormLabel required>은행</FormLabel>
            <FormControl>
              <select className="min-h-12 w-full rounded-xl border border-[var(--tm-border-default)] bg-white px-3 text-sm" onChange={(event) => set("bank", event.target.value)} value={form.bank}>
                <option value="">은행을 선택해 주세요</option>
                {bankNames.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </FormControl>
          </FormField>
          <FormField>
            <FormLabel required>계좌번호</FormLabel>
            <FormControl><TextField autoComplete="off" inputMode="numeric" maxLength={40} onChange={(event) => set("accountNumber", event.target.value)} placeholder="숫자와 하이픈만 입력해 주세요" value={form.accountNumber} /></FormControl>
          </FormField>
          <FormField>
            <FormLabel required>예금주</FormLabel>
            <FormControl><TextField autoComplete="off" maxLength={50} onChange={(event) => set("accountHolder", event.target.value)} placeholder="예금주 이름" value={form.accountHolder} /></FormControl>
          </FormField>
        </div>
        <p className="mt-4 rounded-2xl bg-[var(--tm-bg-subtle)] px-4 py-3 text-xs leading-5 text-[var(--tm-text-secondary)]">Rally On은 참가비를 대신 받거나 입금을 확인하지 않아요. 참가자가 보낸 금액은 통장에서 직접 확인해 주세요.</p>
      </section>

      <p className="mt-4 text-xs leading-5 text-[var(--tm-text-secondary)]">계좌를 바꿔도 이미 공개한 코트 매칭의 안내 계좌는 그대로예요. 참가자가 실제로 입금한 계좌와 기록이 어긋나지 않게 하기 위해서예요.</p>

      {error ? <p className="mt-5 rounded-2xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm leading-6 text-[var(--tm-status-error-text)]" role="alert">{error}</p> : null}
      {saved ? <p className="mt-5 rounded-2xl bg-[var(--tm-bg-subtle)] px-4 py-3 text-sm leading-6 text-[var(--tm-action-primary)]" role="status">입금 계좌를 저장했어요.</p> : null}
    </section>

    <footer className="fixed inset-x-0 bottom-0 border-t border-[var(--tm-border-subtle)] bg-white/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      <div className="mx-auto max-w-[560px]"><Button className="!h-14" disabled={saving} fullWidth loading={saving} onClick={() => void submit()} size="large">저장하기</Button></div>
    </footer>
  </main>;
}

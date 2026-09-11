"use client";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MyCourtTransactions } from "@/server/domain/court-match-view";
import type { SupportInquiryView } from "@/server/domain/support-service";
import { SupportThread } from "@/features/support/support-thread";
import { apiMessage, formatStatusChangedAt } from "@/features/partner/partner-session";

const endpoint = "/api/v1/me/transactions";
const field = "mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-base";
export function AccountTransactions() {
  const [items, setItems] = useState<MyCourtTransactions["items"]>([]);
  const [inquiries, setInquiries] = useState<SupportInquiryView[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const responses = await Promise.all([fetch(endpoint, { cache: "no-store" }), fetch(`${endpoint}/inquiries`, { cache: "no-store" })]);
      const data = await Promise.all(responses.map((r) => r.json()));
      responses.forEach((r, index) => { if (!r.ok) throw new Error(apiMessage(data[index], "거래를 불러오지 못했어요.")); });
      setItems(data[0].items); setInquiries(data[1].items);
    } catch (e) { setError(e instanceof Error ? e.message : "거래를 불러오지 못했어요."); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  return <main className="min-h-svh bg-slate-50 px-5 py-8 text-slate-800"><div className="mx-auto max-w-[560px]">
    <h1 className="text-2xl font-bold">내 거래 정리</h1>
    <p className="mt-3 text-sm leading-6 text-slate-600">본인의 기존 코트 매칭 환불과 문의를 확인해요. 탈퇴·정지된 계정의 일반 서비스 이용은 재개되지 않아요.</p>
    <div className="mt-4 flex gap-3"><Button variant="secondary" size="medium" disabled={busy} onClick={() => void load()}>새로고침</Button><Button variant="secondary" size="medium" onClick={() => void signOut({ callbackUrl: "/login" })}>로그아웃</Button></div>
    {busy ? <p role="status" className="mt-5 text-sm">거래 확인 중…</p> : null}
    {error ? <p role="alert" className="mt-5 text-rose-700">{error}</p> : null}
    {!busy && !error && !items.length ? <p className="mt-8 text-sm">확인할 코트 거래가 없어요.</p> : null}
    <div className="mt-6 space-y-5">{items.map((item) => <TransactionCard key={item.id} item={item} refresh={load} />)}</div>
    <h2 className="mt-8 text-lg font-bold">거래 문의 내역</h2><div className="mt-4 space-y-4">{inquiries.map((i) => <SupportThread key={i.id} inquiry={i} audience="member" endpointOverride={`${endpoint}/inquiries`} refresh={load} />)}</div>
  </div></main>;
}
function TransactionCard({ item, refresh }: { item: MyCourtTransactions["items"][number]; refresh: () => Promise<void> }) {
  const a = item.application;
  const [bank, setBank] = useState(a?.refundAccount?.bank ?? "");
  const [accountNumber, setAccountNumber] = useState(a?.refundAccount?.accountNumber ?? "");
  const [accountHolder, setAccountHolder] = useState(a?.refundAccount?.accountHolder ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const send = async (inquiry: boolean) => {
    if (busy) return; setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(inquiry ? `${endpoint}/inquiries` : `/api/v1/court-match-applications/${a!.id}/refund-account`, { method: inquiry ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(inquiry ? { message, matchId: item.id } : { bank, accountNumber, accountHolder }) });
      const data = await response.json();
      if (!response.ok) throw new Error(apiMessage(data, "저장하지 못했어요."));
      await refresh(); setNotice(inquiry ? "문의를 접수했어요." : "환불 계좌를 저장했어요."); if (inquiry) setMessage("");
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했어요."); }
    finally { setBusy(false); }
  };
  return <article className="rounded-2xl border border-slate-200 bg-white p-5">
    <h2 className="font-bold">{item.title}</h2><p className="mt-1 text-xs text-slate-500">{formatStatusChangedAt(item.startsAt)}</p>
    {item.isHost ? <p className="mt-3 text-sm">운영 거래는 내부 담당자가 인계받아 확인해요. 원래 운영자의 거래 기록과 책임은 유지돼요.</p> : null}
    {a ? <><p className="mt-4 text-sm font-semibold text-blue-700">{a.statusLabel}</p><dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><dt>확인된 수령액</dt><dd className="text-right">{a.money.receivedKrw.toLocaleString("ko-KR")}원</dd><dt>남은 반환</dt><dd className="text-right font-bold">{a.money.outstandingKrw.toLocaleString("ko-KR")}원</dd></dl>
      {a.refundLocked ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm">송금 확인 중이에요. 금액과 계좌는 변경할 수 없어요.</p> : a.awaitingRefund ? <form className="mt-4" onSubmit={(e) => { e.preventDefault(); void send(false); }}><fieldset disabled={busy} className="space-y-3"><p className="text-xs leading-5 text-slate-500">본인 환불 계좌는 해당 운영자 또는 인계받은 내부 담당자에게 전달돼요.</p><label className="block text-sm">은행<input className={field} required maxLength={50} autoComplete="off" value={bank} onChange={(e) => setBank(e.target.value)} /></label><label className="block text-sm">계좌번호<input className={field} required pattern="[0-9-]{5,40}" inputMode="numeric" autoComplete="off" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} /></label><label className="block text-sm">예금주<input className={field} required maxLength={50} autoComplete="off" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} /></label><Button type="submit" size="medium" fullWidth>환불 계좌 저장</Button></fieldset></form> : null}
      {a.refundAttempts.map((r) => <p className="mt-2 text-xs text-slate-500" key={r.id}>{r.amountKrw.toLocaleString("ko-KR")}원 · {r.status === "PAID" ? "송금 완료 기록" : r.status === "FAILED" ? "미송금 확인" : "송금 여부 확인 중"}</p>)}
    </> : null}
    <details className="mt-4"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">입금·환불 문의</summary><form onSubmit={(e) => { e.preventDefault(); void send(true); }}><label className="text-sm">문의 내용<textarea className={field} required minLength={10} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} /></label><Button className="mt-3" type="submit" disabled={busy} fullWidth size="medium">문의 보내기</Button></form></details>
    {notice ? <p role="status" className="mt-3 text-sm text-blue-700">{notice}</p> : null}{error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}
  </article>;
}

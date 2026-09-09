"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MatchBadge } from "@/features/matches/match-presentation";
import type { CourtMatchParticipation } from "@/server/domain/court-match-view";
import { apiMessage, formatStatusChangedAt } from "./partner-session";

const inputClass = "mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export function CourtMatchPayment({ participation, onRefresh }: { participation: CourtMatchParticipation; onRefresh: () => Promise<void> }) {
  const application = participation.application;
  const [depositorName, setDepositorName] = useState(application?.depositorName ?? "");
  const [bank, setBank] = useState(application?.refundAccount?.bank ?? "");
  const [accountNumber, setAccountNumber] = useState(application?.refundAccount?.accountNumber ?? "");
  const [accountHolder, setAccountHolder] = useState(application?.refundAccount?.accountHolder ?? "");
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  if (!application) return null;

  const cancel = async () => {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/v1/court-match-applications/${application.id}/cancel`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "참가를 취소하지 못했어요."));
      await onRefresh(); setCancelOpen(false);
      setNotice(body.refundAmountKrw > 0
        ? `참가를 취소했어요. 환불 ${Number(body.refundAmountKrw).toLocaleString("ko-KR")}원은 아래에 계좌를 입력하면 운영자가 보내요.`
        : "참가를 취소했어요.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "참가를 취소하지 못했어요."); } finally { setBusy(false); }
  };

  const save = async (action: "deposit" | "refund-account") => {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/v1/court-match-applications/${application.id}/${action}`, { method: action === "deposit" ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "deposit" ? { depositorName } : { bank, accountNumber, accountHolder }) });
      const body = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "저장하지 못했어요. 입력 내용을 확인해 주세요."));
      await onRefresh(); setNotice(action === "deposit" ? "입금 알림을 보냈어요. 운영자가 통장을 확인하면 확정돼요." : "환불 계좌를 저장했어요.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "저장하지 못했어요."); } finally { setBusy(false); }
  };
  return <div>
    <MatchBadge tone={application.status === "CONFIRMED" ? "green" : application.awaitingRefund ? "amber" : "blue"}>{application.statusLabel}</MatchBadge>
    {application.status === "PENDING" ? <p className="mt-3 text-sm leading-6 text-slate-600">운영자가 신청을 검토하고 있어요. 승인되면 입금 계좌와 기한을 안내해요.</p> : null}
    {application.status === "ACCEPTED" ? <div className="mt-4">
      <div className="rounded-2xl bg-blue-50 p-4"><p className="text-sm font-semibold text-blue-800">입금할 금액</p><p className="mt-1 text-2xl font-bold tabular-nums text-blue-900">{participation.guestFeeKrw.toLocaleString("ko-KR")}원</p>{participation.settlementAccount ? <><p className="mt-4 text-sm font-semibold">{participation.settlementAccount.bank} · {participation.settlementAccount.accountHolder}</p><p className="mt-1 break-all text-lg font-semibold tabular-nums">{participation.settlementAccount.accountNumber}</p></> : <p className="mt-3 text-sm">계좌를 확인할 수 없어요. 문의해 주세요.</p>}<p className="mt-4 text-sm leading-6 text-blue-800">입금 식별코드 <strong className="text-lg">{application.depositCode}</strong><br />은행 앱의 받는 분 통장 표시를 <strong>이름{application.depositCode}</strong> 형태로 입력해 주세요.</p>{application.paymentDueAt ? <p className="mt-3 text-xs font-semibold text-blue-700">기한 · {formatStatusChangedAt(application.paymentDueAt)}</p> : null}</div>
      <form className="mt-5" onSubmit={(e) => { e.preventDefault(); void save("deposit"); }}><fieldset disabled={busy}><label className="text-sm font-semibold" htmlFor="depositor-name">실제로 보낸 입금자명</label><input className={inputClass} id="depositor-name" required maxLength={50} autoComplete="off" placeholder={`예: 홍길동${application.depositCode}`} value={depositorName} onChange={(e) => setDepositorName(e.target.value)} /><p className="mt-2 text-xs leading-5 text-slate-500">계좌이체를 마친 뒤 알려 주세요. 알림만으로 입금이 확인되지는 않아요.</p><Button className="mt-4" fullWidth type="submit" disabled={busy}>{busy ? "전송 중…" : application.depositClaimedAt ? "입금자명 수정해 알리기" : "입금했어요"}</Button></fieldset></form>
    </div> : null}
    {application.status === "CONFIRMED" ? <p className="mt-3 text-sm leading-6 text-slate-600">운영자가 입금을 확인했어요. 일정과 현장 안내를 확인해 주세요.</p> : null}
    {application.awaitingRefund ? <form className="mt-4" onSubmit={(e) => { e.preventDefault(); void save("refund-account"); }}><p className="mb-4 text-sm leading-6 text-slate-600">{application.refundAmountKrw === null ? "환불받을 계좌를 입력해 주세요." : <>환불 예정 금액은 <strong className="font-semibold">{application.refundAmountKrw.toLocaleString("ko-KR")}원</strong>이에요. 환불받을 계좌를 입력해 주세요.</>} 운영자에게만 전달돼요.</p><fieldset disabled={busy} className="space-y-4"><label className="block text-sm font-semibold">은행<input className={inputClass} required maxLength={50} autoComplete="off" value={bank} onChange={(e) => setBank(e.target.value)} /></label><label className="block text-sm font-semibold">계좌번호<input className={inputClass} required pattern="[0-9-]{5,40}" inputMode="numeric" maxLength={40} autoComplete="off" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} /></label><label className="block text-sm font-semibold">예금주<input className={inputClass} required maxLength={50} autoComplete="off" value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} /></label><Button fullWidth type="submit" disabled={busy}>{busy ? "저장 중…" : "환불 계좌 저장"}</Button></fieldset></form> : null}
    {application.refundCompletedAt ? <p className="mt-3 text-sm leading-6 text-slate-600">운영자가 {formatStatusChangedAt(application.refundCompletedAt)}에 환불 완료로 표시했어요.<br />실제 입금 여부는 통장에서 확인해 주세요.</p> : null}
    {application.status === "EXPIRED_UNPAID" ? <p className="mt-3 text-sm leading-6 text-slate-600">입금 확인 기한이 지나 자리가 반환됐어요. 이미 이체했다면 문의해 주세요.</p> : null}
    {participation.cancellation ? <div className="mt-5 rounded-2xl border border-slate-100 p-4">
      {cancelOpen ? <div>
        <p className="text-sm font-semibold">참가를 취소할까요?</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {participation.cancellation.refundAmountKrw > 0
            ? <>환불 예정 금액은 <strong className="font-semibold">{participation.cancellation.refundAmountKrw.toLocaleString("ko-KR")}원</strong>({participation.cancellation.refundPercent}%)이에요. 취소한 뒤 환불받을 계좌를 입력하면 운영자가 보내요.</>
            : participation.cancellation.paidBeforeConfirmation
              ? "아직 입금이 확인되지 않은 신청이에요. 이미 이체하셨다면 취소한 뒤 문의해 주세요."
              : "지금 취소하면 돌려받을 금액이 없어요."}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button disabled={busy} fullWidth onClick={() => setCancelOpen(false)} size="medium" variant="secondary">닫기</Button>
          <Button disabled={busy} fullWidth onClick={() => void cancel()} size="medium">참가 취소하기</Button>
        </div>
      </div> : <div className="flex items-center justify-between gap-4">
        <p className="text-xs leading-5 text-slate-500">시작일 기준 이틀 전까지 전액, 하루 전 절반,<br />당일은 환불이 없어요.</p>
        <button className="min-h-11 shrink-0 text-sm font-semibold text-slate-500 underline" disabled={busy} onClick={() => { setError(""); setNotice(""); setCancelOpen(true); }} type="button">참가 취소</button>
      </div>}
    </div> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p> : null}
    {notice ? <p role="status" className="mt-3 text-sm text-blue-700">{notice}</p> : null}
    <div className="mt-4 flex items-center justify-between gap-3 text-sm"><button className="min-h-11 font-semibold text-blue-600" disabled={busy} onClick={() => { void onRefresh().catch(() => setError("상태를 새로 불러오지 못했어요.")); }}>상태 새로고침</button><Link href="/support/inquiry" className="font-semibold text-slate-500">입금·환불 문의</Link></div>
  </div>;
}

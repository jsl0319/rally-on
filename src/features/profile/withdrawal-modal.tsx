"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Modal, ModalContainer, ModalContent, ModalContentItem, ModalHeading } from "@wanteddev/wds";
import { Button } from "@/components/ui/button";
import type { WithdrawalPreview } from "@/server/domain/account-service";
import { apiMessage, formatStatusChangedAt } from "@/features/partner/partner-session";

export function WithdrawalModal({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [preview, setPreview] = useState<WithdrawalPreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setPreview(null); setError("");
    try {
      const response = await fetch("/api/v1/me/withdrawal", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(apiMessage(data, "내역을 불러오지 못했어요."));
      setPreview(data);
    } catch (e) { setError(e instanceof Error ? e.message : "내역 확인에 실패했어요."); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const confirm = async () => {
    if (!preview || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/v1/me/withdrawal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: preview.token }) });
      const data = await response.json();
      if (!response.ok) {
        if (data.error?.code === "WITHDRAWAL_PREVIEW_CHANGED") await load();
        throw new Error(apiMessage(data, "탈퇴하지 못했어요."));
      }
      router.replace("/account/transactions");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "처리 결과를 확인해 주세요."); setBusy(false); }
  };
  return <Modal open onOpenChange={(open) => { if (!open && !busy) onCancel(); }}><ModalContainer variant="bottom"><ModalContent><ModalContentItem>
    <ModalHeading>탈퇴 전 거래 확인</ModalHeading>
    <p className="mt-3 text-sm leading-6 text-slate-600">시작 전 코트 매칭 신청은 취소돼요. 탈퇴 후에도 같은 카카오 계정으로 본인의 환불·문의만 확인할 수 있어요.</p>
    {preview ? <div className="mt-4 space-y-3 text-sm">
      {preview.items.map((a) => <div key={a.id} className="rounded-xl border border-slate-200 p-3"><p className="font-semibold">{a.title}</p><p className="mt-1 text-xs text-slate-500">{formatStatusChangedAt(a.startsAt)}</p><p className="mt-2">{a.cancel ? "참가 취소" : "기존 거래 유지"} · 남은 반환 {a.money.outstandingKrw.toLocaleString("ko-KR")}원</p>{a.awaitingReceipt ? <p className="mt-1 text-xs text-slate-500">미확인 입금은 탈퇴 후 문의할 수 있어요.</p> : null}{a.money.reservedKrw ? <p className="mt-1 text-xs text-amber-800">송금 처리 중 · 고정 금액과 계좌 유지</p> : null}</div>)}
      {!preview.items.length ? <p>정리할 코트 매칭 신청이 없어요.</p> : null}
      {preview.hosted.length ? <p className="rounded-xl bg-amber-50 p-3">운영 코트 거래 {preview.hosted.length}건은 내부 인계 목록에 남아요. 신규 모집·승인은 중단돼요.</p> : null}
      {preview.assignedCourtHandoffCount ? <p>인계받은 코트 거래 {preview.assignedCourtHandoffCount}건은 새 내부 담당자가 재배정받을 수 있어요.</p> : null}
      {preview.assignedInquiryCount ? <p>담당 문의 {preview.assignedInquiryCount}건은 다른 내부 담당자가 인계받을 수 있어요.</p> : null}
      <p className="text-xs leading-5 text-slate-500">확정 참가의 취소는 기존 날짜별 환불 기준을 적용해요. 이미 시작한 경기와 일반 매칭 이력은 유지해요.</p>
    </div> : !error ? <p className="mt-4" role="status">거래 내역 확인 중…</p> : null}
    {error ? <p className="mt-3 text-sm text-rose-700" role="alert">{error}</p> : null}
    {!preview && error ? <Button className="mt-3" onClick={() => void load()}>다시 확인</Button> : null}
    <div className="mt-6 grid grid-cols-2 gap-3"><Button disabled={busy} variant="secondary" onClick={onCancel}>돌아가기</Button><Button disabled={busy || !preview} onClick={() => void confirm()}>확인 후 탈퇴</Button></div>
  </ModalContentItem></ModalContent></ModalContainer></Modal>;
}

"use client";

import { BellSimple, CaretDown, Check, DeviceMobile, ShareNetwork } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { disablePush, enablePush, pushAction, pushEnvironment, syncPush, type PushStatus } from "./web-push-client";

type PushSettingsViewProps = {
  status: PushStatus | null;
  environment: ReturnType<typeof pushEnvironment> | null;
  busy?: boolean;
  message?: string;
  error?: string;
  onAction: (action: "on" | "off" | "test") => void;
  onRetry: () => void;
};

/** Shared with the local preview; subscription actions stay in the controller. */
export function PushSettingsView({ status, environment, busy = false, message = "", error = "", onAction, onRetry }: PushSettingsViewProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const native = environment === "native" || environment === "native-ios" || environment === "native-android";
  const appleInstall = environment === "native-ios" || environment === "install";
  const subscribed = environment === "supported" && Boolean(status?.subscriptionId);
  const canEnable = environment === "supported" && status?.enabled;
  const stateLabel = native || environment === "install" ? "설정 안내"
    : environment === "unsupported" ? "지원 안내"
    : error && !status ? "확인 필요" : !status ? "확인 중" : !status.enabled ? "준비 중" : subscribed ? "켜짐" : "꺼짐";
  const subtitle = subscribed ? "신청 결과와 경기 소식을 보내드려요"
    : appleInstall ? "홈 화면에 추가하고 소식을 받아보세요"
    : native ? "웹 브라우저에서 알림을 켤 수 있어요"
    : "신청 결과와 경기 소식을 놓치지 마세요";

  return <section className="overflow-hidden rounded-2xl bg-[var(--tm-bg-subtle)]" aria-label="푸시 알림 설정">
    <button type="button" aria-expanded={expanded} aria-controls="push-settings-detail" className="flex min-h-[76px] w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--tm-action-primary)]" onClick={() => { setExpanded(!expanded); setConfirmOff(false); }}>
      <BellSimple aria-hidden="true" className="size-5 shrink-0 text-[var(--tm-action-primary)]" />
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">푸시 알림</span><span className="mt-1 block text-xs leading-[18px] text-[var(--tm-text-secondary)]">{subtitle}</span></span>
      <span className={`shrink-0 text-xs font-semibold ${subscribed ? "text-[var(--tm-action-primary)]" : "text-[var(--tm-text-secondary)]"}`}>{stateLabel}</span>
      <CaretDown aria-hidden="true" className={`size-3.5 shrink-0 text-[var(--tm-text-secondary)] transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} />
    </button>
    {expanded ? <div id="push-settings-detail" className="border-t border-[var(--tm-action-primary)]/10 px-4 pb-4 pt-3">
      {appleInstall ? <div>
        <p className="text-sm font-semibold">아이폰·아이패드에서 알림 받기</p>
        <p className="mt-1 text-xs leading-5 text-[var(--tm-text-secondary)]">{native ? "검증 앱의 푸시는 준비 중이에요. Safari에서 랠리온 웹사이트를 열어 아래 방법으로 설정해 주세요." : "홈 화면에 추가한 랠리온에서 알림을 받을 수 있어요."}</p>
        <ol className="mt-3 space-y-2 text-[13px] leading-5">
          <li className="flex items-center gap-2"><ShareNetwork aria-hidden="true" size={16} />브라우저의 공유 → 홈 화면에 추가</li>
          <li className="flex items-center gap-2"><DeviceMobile aria-hidden="true" size={16} />새 아이콘으로 열고 알림 켜기</li>
        </ol>
        <p className="mt-3 text-[11px] leading-5 text-[var(--tm-text-secondary)]">iOS·iPadOS 16.4 이상에서 사용할 수 있어요. 추가 메뉴가 없으면 Safari에서 열어 주세요.</p>
      </div> : native ? <div>
        <p className="text-sm font-semibold">브라우저에서 알림 받기</p>
        <p className="mt-1 text-xs leading-5 text-[var(--tm-text-secondary)]">검증 앱의 푸시는 준비 중이에요. 웹 알림은 지금 설정할 수 있어요.</p>
        <ol className="mt-3 space-y-2 text-[13px] leading-5">
          <li>{environment === "native-android" ? "Chrome에서 랠리온 웹사이트를 열고 로그인" : "지원 브라우저에서 랠리온 웹사이트를 열고 로그인"}</li>
          <li>마이 → 알림 → 푸시 알림 켜기</li>
        </ol>
      </div> : environment === "unsupported" ? <p className="text-sm leading-6">이 환경에서는 웹 알림을 사용할 수 없어요. 최신 브라우저에서 랠리온을 다시 열어 주세요.</p>
        : !status ? <Button size="small" variant="neutral" disabled={busy} onClick={onRetry}>다시 확인</Button>
        : !status.enabled ? <p className="text-sm leading-6">푸시 알림을 준비하고 있어요. 지금은 알림 목록에서 소식을 확인해 주세요.</p>
        : <>
          <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">이 기기에서 받기</p><p className="mt-1 text-xs leading-5 text-[var(--tm-text-secondary)]">신청·입금 확인·취소·문의 답변</p></div>
            <button type="button" role="switch" aria-checked={subscribed} aria-label={subscribed ? "알림 끄기" : "이 기기에서 알림 켜기"} disabled={busy || !canEnable} onClick={() => subscribed ? setConfirmOff(true) : onAction("on")} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[var(--tm-action-primary)]">
              <span aria-hidden="true" className={`relative h-7 w-12 rounded-full transition-colors ${subscribed ? "bg-[var(--tm-action-primary)]" : "bg-[#bbc6bb]"}`}><span className={`absolute left-1 top-1 size-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${subscribed ? "translate-x-5" : "translate-x-0"}`} /></span>
            </button>
          </div>
          {subscribed && !confirmOff ? <button type="button" disabled={busy} onClick={() => onAction("test")} className="mt-2 min-h-11 text-xs font-semibold text-[var(--tm-action-primary)] underline underline-offset-4 disabled:opacity-50">테스트 알림 보내기</button> : null}
          {confirmOff ? <div className="mt-3 rounded-xl bg-white p-3"><p className="text-[13px] leading-5">알림을 끄면 입금·취소 소식을 놓칠 수 있어요. 끄시겠어요?</p><div className="mt-3 grid grid-cols-2 gap-2"><Button size="small" variant="neutral" disabled={busy} onClick={() => setConfirmOff(false)}>유지하기</Button><Button size="small" disabled={busy} onClick={() => { onAction("off"); setConfirmOff(false); }}>알림 끄기</Button></div></div> : null}
        </>}
      {busy ? <p className="mt-2 text-xs text-[var(--tm-text-secondary)]" role="status">설정을 저장하고 있어요</p> : null}
      <p className="mt-2 text-[11px] leading-[18px] text-[var(--tm-text-secondary)]">알림은 선택 사항이며 기기 상태에 따라 늦을 수 있어요</p>
    </div> : null}
    {message ? <p className="flex items-start gap-1.5 px-4 pb-3 text-xs leading-5 text-[var(--tm-action-primary)]" role="status"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{message}</p> : null}
    {error ? <div className="px-4 pb-3"><p className="text-xs leading-5 text-[var(--tm-status-error-text)]" role="alert">{error}</p>{!status ? <button type="button" className="min-h-11 text-xs font-semibold underline" onClick={onRetry}>다시 확인</button> : null}</div> : null}
  </section>;
}

export function WebPushSettings() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [environment, setEnvironment] = useState<ReturnType<typeof pushEnvironment> | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const nextEnvironment = pushEnvironment();
    setEnvironment(nextEnvironment);
    if (nextEnvironment !== "supported") { setStatus(null); setError(""); return; }
    try { setStatus(await syncPush()); setError(""); } catch { setError("알림 설정을 확인하지 못했어요. 다시 시도해 주세요."); }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => { void refresh(); }, 0);
    window.addEventListener("focus", refresh);
    return () => { clearTimeout(timer); window.removeEventListener("focus", refresh); };
  }, [refresh]);
  async function act(action: "on" | "off" | "test") {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (action === "on" && status?.publicKey) {
        const subscriptionId = await enablePush(status.publicKey);
        setStatus({ ...status, subscriptionId });
        setMessage("이 기기의 알림을 켰어요. 테스트 알림을 보내 확인해 보세요.");
      } else if (action === "off") {
        await disablePush(); setStatus(previous => previous && { ...previous, subscriptionId: null });
        setMessage("이 기기의 알림을 껐어요.");
      } else if (action === "test") {
        await pushAction({ action: "test" });
        setMessage("테스트 알림을 요청했어요. 잠시 앱을 나가 확인해 주세요.");
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "알림 설정을 저장하지 못했어요."); }
    finally { setBusy(false); }
  }
  return <PushSettingsView status={status} environment={environment} busy={busy} message={message} error={error} onAction={action => void act(action)} onRetry={() => void refresh()} />;
}

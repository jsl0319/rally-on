"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { disablePush, enablePush, pushAction, pushEnvironment, syncPush, type PushStatus } from "./web-push-client";

export function WebPushSettings() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [environment, setEnvironment] = useState<ReturnType<typeof pushEnvironment> | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const refresh = useCallback(async () => {
    setEnvironment(pushEnvironment());
    try { setStatus(await syncPush()); } catch { setError("알림 설정을 확인하지 못했어요. 다시 시도해 주세요."); }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => { void refresh(); }, 0);
    window.addEventListener("focus", refresh);
    return () => { clearTimeout(timer); window.removeEventListener("focus", refresh); };
  }, [refresh]);
  async function act(action: "on" | "off" | "test") {
    setBusy(true); setError(""); setMessage("");
    try {
      if (action === "on" && status?.publicKey) {
        const subscriptionId = await enablePush(status.publicKey);
        setStatus({ ...status, subscriptionId });
        setMessage("이 기기의 알림을 켰어요. 테스트 알림으로 수신을 확인해 주세요.");
      } else if (action === "off") {
        await disablePush(); setStatus(previous => previous && { ...previous, subscriptionId: null }); setConfirmOff(false);
        setMessage("이 기기의 알림을 껐어요.");
      } else if (action === "test") {
        await pushAction({ action: "test" });
        setMessage("테스트 알림을 요청했어요. 잠시 앱을 나가 도착했는지 확인해 주세요.");
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "알림 설정을 저장하지 못했어요."); }
    finally { setBusy(false); }
  }
  return <section className="rally-card mt-4 p-4" aria-labelledby="push-settings-title">
    <div className="flex items-center justify-between gap-3"><h2 id="push-settings-title" className="text-sm font-bold">앱 밖에서도 알림 받기</h2><span className="text-xs font-semibold text-[var(--tm-text-secondary)]">{status === null ? "확인 중" : status.subscriptionId ? "켜짐" : "꺼짐"}</span></div>
    <p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">신청 결과·입금 확인·경기 취소·문의 답변을 알려드려요.</p>
    {environment === "native" ? <p className="mt-2 text-sm leading-6">설치형 앱 푸시는 준비 중이에요. Safari에서 랠리온을 홈 화면에 추가하면 웹 알림을 사용할 수 있어요.</p>
      : environment === "install" ? <p className="mt-2 text-sm leading-6">아이폰은 Safari의 공유 → 홈 화면에 추가 후, 새 아이콘으로 열어 알림을 켜 주세요. iOS 16.4 이상에서 지원해요.</p>
      : environment === "unsupported" ? <p className="mt-2 text-sm leading-6">이 환경에서는 웹 알림을 지원하지 않아요. 최신 Safari 또는 Chrome에서 열어 주세요.</p>
      : !status ? <Button className="mt-3" size="small" variant="neutral" onClick={() => void refresh()}>설정 확인</Button>
      : !status.enabled ? <p className="mt-2 text-sm leading-6">외부 알림을 준비하고 있어요. 지금은 이 화면에서 소식을 확인해 주세요.</p>
      : <div className="mt-3 flex flex-wrap gap-2">{status.subscriptionId ? <><Button size="small" disabled={busy} onClick={() => void act("test")}>테스트 알림</Button><Button size="small" variant="neutral" disabled={busy} onClick={() => setConfirmOff(true)}>알림 끄기</Button></> : <Button size="small" disabled={busy} onClick={() => void act("on")}>이 기기에서 알림 켜기</Button>}</div>}
    {confirmOff ? <div className="mt-3 rounded-xl bg-[var(--tm-bg-subtle)] p-3"><p className="text-sm leading-6">앱 밖에서 입금·취소 안내를 받을 수 없어요. 진행 여부를 앱에서 직접 확인해 주세요.</p><div className="mt-3 grid grid-cols-2 gap-2"><Button size="small" variant="neutral" disabled={busy} onClick={() => setConfirmOff(false)}>유지하기</Button><Button size="small" disabled={busy} onClick={() => void act("off")}>알림 끄기</Button></div></div> : null}
    {message ? <p className="mt-3 text-sm leading-6 text-[var(--tm-action-primary)]" role="status">{message}</p> : null}
    {error ? <p className="mt-3 text-sm leading-6 text-[var(--tm-status-error-text)]" role="alert">{error}</p> : null}
    <p className="mt-3 text-xs leading-5 text-[var(--tm-text-muted)]">허용하지 않아도 이용할 수 있어요. 알림은 기기 상태에 따라 늦거나 도착하지 않을 수 있어요.</p>
  </section>;
}

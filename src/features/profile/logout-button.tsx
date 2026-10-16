"use client";

import { Alert, AlertContainer, AlertContent, AlertDescription, AlertHeading, AlertTrigger } from "@wanteddev/wds";
import { setPushBinding } from "@/features/notifications/web-push-client";
import { signOut } from "next-auth/react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { resetNavigationHistory } from "@/navigation/history";

export function LogoutButton({ className = "", onOpenChange }: { className?: string; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);

  function changeOpen(next: boolean) {
    if (pending.current) return;
    setError("");
    setOpen(next);
    onOpenChange?.(next);
  }

  async function confirm() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      // The Auth.js event also removes the server binding; a broken worker must not block logout.
      await setPushBinding(null).catch(() => undefined);
      resetNavigationHistory();
      await signOut({ callbackUrl: "/login" });
    } catch {
      pending.current = false;
      setBusy(false);
      setError("로그아웃하지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
    }
  }

  return <Alert open={open} onOpenChange={changeOpen}>
    <AlertTrigger><button type="button" className={`min-h-11 rounded-xl px-3 font-semibold text-[var(--tm-text-secondary)] ${className}`}>로그아웃</button></AlertTrigger>
    <AlertContainer disableOutsideClickClose={busy} disableEscapeKeyDownClose={busy} sx={{ width: "calc(100vw - 40px)", maxWidth: 360, borderRadius: 24 }}>
      <AlertContent>
        <AlertHeading>로그아웃할까요?</AlertHeading>
        <AlertDescription>다시 이용하려면 로그인이 필요해요.</AlertDescription>
        {error ? <p role="alert" className="mt-3 text-sm leading-6 text-[var(--tm-status-error-text)]">{error}</p> : null}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button fullWidth variant="neutral" disabled={busy} onClick={() => changeOpen(false)}>취소</Button>
          <Button fullWidth disabled={busy} loading={busy} onClick={() => void confirm()}>{busy ? "로그아웃 중…" : "로그아웃"}</Button>
        </div>
      </AlertContent>
    </AlertContainer>
  </Alert>;
}

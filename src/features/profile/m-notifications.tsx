"use client";

import { useCallback, useEffect, useState } from "react";
import { PullToRefresh } from "@/components/feedback/pull-to-refresh";
import { useActionToast } from "@/components/feedback/use-action-toast";
import { NotificationInbox, type NotificationItem, type NotificationsResponse } from "@/features/notifications/notification-inbox";
import { WebPushSettings } from "@/features/notifications/web-push-settings";

function apiMessage(body: unknown, fallback: string) {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string") return body.error.message;
  return fallback;
}

export function MNotifications({ backHref = "/my" }: { backHref?: string }) {
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [error, setError] = useState("");
  const [marking, setMarking] = useState(false);
  const notify = useActionToast();
  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetch("/api/v1/me/notifications", { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "알림을 불러오지 못했어요."));
      setData(body as NotificationsResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "알림을 불러오지 못했어요.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const markAllRead = async () => {
    if (marking) return;
    setMarking(true); setError("");
    try {
      const response = await fetch("/api/v1/me/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "읽음 처리를 하지 못했어요. 다시 시도해 주세요."));
      setData(body as NotificationsResponse);
      notify("모든 알림을 읽음으로 표시했어요.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "읽음 처리를 하지 못했어요. 다시 시도해 주세요.");
    } finally { setMarking(false); }
  };

  const openNotification = async (item: NotificationItem) => {
    if (item.read) return;
    try {
      const response = await fetch("/api/v1/me/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [item.id] }) });
      if (!response.ok) throw new Error("읽음 처리를 하지 못했어요. 다시 시도해 주세요.");
      setData(await response.json() as NotificationsResponse);
    } catch {
      // A failed read receipt must not prevent opening an important notification.
      if (!item.href) setError("읽음 처리를 하지 못했어요. 다시 시도해 주세요.");
    }
  };

  return <PullToRefresh onRefresh={load}><NotificationInbox backHref={backHref} data={data} error={error} marking={marking} settings={<WebPushSettings />} onRetry={() => void load()} onReadAll={() => void markAllRead()} onOpen={item => void openNotification(item)} /></PullToRefresh>;
}

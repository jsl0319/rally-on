"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell, CaretRight } from "@phosphor-icons/react";

import { BackButton } from "@/components/navigation/back-button";
import { Button } from "@/components/ui/button";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { relativeTime } from "@/notifications/relative-time";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  createdAt: string;
};

type NotificationsResponse = { unreadCount: number; items: NotificationItem[] };

function apiMessage(body: unknown, fallback: string) {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string") return body.error.message;
  return fallback;
}

/**
 * 무슨 일인지 한 글자로 먼저 말해 준다.
 *
 * 알림이 전부 같은 모양이면 목록을 훑을 때 제목을 다 읽어야 한다. 돈이 걸린 일과
 * 잘 풀린 일과 틀어진 일은 한눈에 갈라져야 한다.
 */
function notificationMark(type: string) {
  if (type.includes("REFUND") || type.includes("DEPOSIT")) return "💳";
  if (type.includes("CANCELLED") || type.includes("EXPIRED") || type === "APPLICATION_REJECTED") return "⚠️";
  if (type === "APPLICATION_ACCEPTED" || type === "COURT_MATCH_CONFIRMED") return "🎾";
  if (type === "APPLICATION_RECEIVED" || type === "MATCH_PARTICIPANT_LEFT") return "📩";
  return "🔔";
}

export function MNotifications() {
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [error, setError] = useState("");

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
    try {
      const response = await fetch("/api/v1/me/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body: unknown = await response.json();
      if (response.ok) setData(body as NotificationsResponse);
    } catch {
      // best-effort; leave list as-is if this fails
    }
  };

  const openNotification = async (item: NotificationItem) => {
    if (!item.read) {
      try {
        const response = await fetch("/api/v1/me/notifications/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [item.id] }) });
        const body: unknown = await response.json();
        if (response.ok) setData(body as NotificationsResponse);
      } catch {
        // ignore; navigation still proceeds below
      }
    }
  };

  return <main className="min-h-svh bg-[var(--tm-bg-page)] px-5 pb-10 pt-6 text-[var(--tm-text-primary)]">
    <div className="mx-auto max-w-[560px]">
      <BackButton ariaLabel="마이로 돌아가기" className="inline-flex size-11 items-center justify-center rounded-full text-xl" fallbackPath="/my" />
      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">알림</h1>
        {data && data.unreadCount > 0 ? <button className="text-sm font-semibold text-[var(--tm-action-primary)]" onClick={() => void markAllRead()} type="button">모두 읽음</button> : null}
      </div>

      {data === null ? error ? <section className="mt-8 rounded-3xl border border-[var(--tm-border-default)] bg-white p-5"><p className="text-sm leading-6">{error}</p><Button className="mt-4" onClick={() => void load()} size="medium">다시 불러오기</Button></section> : <CourtRallyLoader className="mt-8" label="알림을 불러오고 있어요." /> : data.items.length === 0 ? <section className="mt-10 rounded-3xl border border-dashed border-[var(--tm-border-strong)] bg-white px-5 py-10 text-center"><Bell aria-hidden="true" className="mx-auto size-8 text-[var(--tm-text-muted)]" /><h2 className="mt-4 font-bold">아직 알림이 없어요</h2><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">신청·수락·취소 소식이 오면 여기서 확인할 수 있어요.</p></section> : <ul className="mt-4 space-y-3">
        {data.items.map((item) => <li key={item.id}>
          <Link className="flex items-start gap-3 rounded-2xl border border-[var(--tm-border-default)] bg-white p-4 transition-colors hover:border-[var(--tm-border-strong)]" href={item.href ?? "/my"} onClick={() => void openNotification(item)}>
            <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-full text-base ${item.read ? "bg-[var(--tm-bg-subtle-muted)]" : "bg-[var(--tm-bg-subtle)]"}`}>{notificationMark(item.type)}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className={`text-sm ${item.read ? "font-semibold text-[var(--tm-text-secondary)]" : "font-bold"}`}>{item.title}</span>
                {!item.read ? <span aria-label="읽지 않음" className="inline-flex size-2 shrink-0 rounded-full bg-[var(--tm-action-primary)]" role="img" /> : null}
              </span>
              <span className="mt-1 block text-sm leading-6 text-[var(--tm-text-secondary)]">{item.body}</span>
              <span className="mt-2 block text-xs text-[var(--tm-text-muted)]">{relativeTime(item.createdAt)}</span>
            </span>
            {item.href ? <CaretRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-[var(--tm-text-muted)]" /> : null}
          </Link>
        </li>)}
      </ul>}
    </div>
  </main>;
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell } from "@phosphor-icons/react";

import { BackButton } from "@/components/navigation/back-button";
import { Button } from "@/components/ui/button";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";

type NotificationItem = {
  id: string;
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Seoul" }).format(new Date(value));
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

      {data === null ? error ? <section className="mt-8 rounded-3xl border border-[var(--tm-border-default)] bg-white p-5"><p className="text-sm leading-6">{error}</p><Button className="mt-4" onClick={() => void load()} size="medium">다시 불러오기</Button></section> : <CourtRallyLoader className="mt-8" label="알림을 불러오고 있어요." /> : data.items.length === 0 ? <section className="mt-10 rounded-3xl border border-dashed border-[var(--tm-border-strong)] bg-white px-5 py-10 text-center"><Bell aria-hidden="true" className="mx-auto size-8 text-[var(--tm-text-muted)]" /><h2 className="mt-4 font-bold">아직 알림이 없어요</h2><p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">신청·수락·거절 소식이 오면 여기서 확인할 수 있어요.</p></section> : <ul className="mt-4 space-y-3">
        {data.items.map((item) => <li key={item.id}>
          <Link className={`block rounded-2xl border p-4 transition-colors ${item.read ? "border-[var(--tm-border-default)] bg-white" : "border-[var(--tm-action-primary)] bg-[var(--tm-bg-subtle)]"}`} href={item.href ?? "/my"} onClick={() => void openNotification(item)}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold">{item.title}</p>
              {!item.read ? <span aria-hidden="true" className="inline-flex size-2 shrink-0 rounded-full bg-[var(--tm-action-primary)]" /> : null}
            </div>
            <p className="mt-1 text-sm leading-6 text-[var(--tm-text-secondary)]">{item.body}</p>
            <p className="mt-2 text-xs text-[var(--tm-text-muted)]">{formatDate(item.createdAt)}</p>
          </Link>
        </li>)}
      </ul>}
    </div>
  </main>;
}

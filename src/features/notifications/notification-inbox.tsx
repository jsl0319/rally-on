"use client";

import { BellSimple, CheckCircle, CreditCard, EnvelopeSimple, TennisBall, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { StickyPageHeader } from "@/components/navigation/sticky-page-header";
import { Button } from "@/components/ui/button";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { relativeTime } from "@/notifications/relative-time";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  createdAt: string;
};
export type NotificationsResponse = { unreadCount: number; items: NotificationItem[] };

function notificationAppearance(type: string) {
  if (type.startsWith("SUPPORT_")) return { label: "문의", Icon: EnvelopeSimple };
  if (type === "PUSH_TEST") return { label: "알림 확인", Icon: BellSimple };
  const label = type.startsWith("COURT_") ? "코트 매칭" : "매칭";
  if (type.includes("REFUND") || type.includes("DEPOSIT") || type === "COURT_BALLS_MISSING_RECORDED") return { label, Icon: CreditCard };
  if (type.includes("CANCELLED") || type.includes("EXPIRED") || type === "APPLICATION_REJECTED") return { label, Icon: WarningCircle };
  if (type === "APPLICATION_ACCEPTED" || type === "COURT_MATCH_CONFIRMED") return { label, Icon: CheckCircle };
  return { label, Icon: TennisBall };
}

export function NotificationInbox({ backHref = "/my", data, error = "", settings, marking = false, onRetry, onReadAll, onOpen }: {
  backHref?: string;
  data: NotificationsResponse | null;
  error?: string;
  settings: ReactNode;
  marking?: boolean;
  onRetry: () => void;
  onReadAll: () => void;
  onOpen: (item: NotificationItem) => void;
}) {
  return <main className="min-h-app bg-[var(--tm-bg-page)] pb-10 text-[var(--tm-text-primary)]">
    <StickyPageHeader backHref={backHref} title="알림" />
    <div className="mx-auto max-w-[560px] px-5 pt-1">
      {settings}
      {error ? <div className="mt-4 rounded-xl bg-[var(--tm-status-error-bg)] px-4 py-3"><p className="text-sm leading-6 text-[var(--tm-status-error-text)]" role="alert">{error}</p>{!data ? <Button className="mt-3" onClick={onRetry} size="small" variant="neutral">다시 불러오기</Button> : null}</div> : null}
      <div className="mt-4 flex min-h-11 items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold">받은 소식{data && data.unreadCount > 0 ? <span className="text-xs font-bold text-[var(--tm-action-primary)]" aria-label={`읽지 않은 알림 ${data.unreadCount}개`}>{data.unreadCount}</span> : null}</h2>
        {data && data.unreadCount > 0 ? <button type="button" disabled={marking} className="min-h-11 text-xs font-medium text-[var(--tm-text-secondary)] disabled:opacity-50" onClick={onReadAll}>{marking ? "처리 중" : "모두 읽음"}</button> : null}
      </div>
      {data === null ? !error ? <CourtRallyLoader className="mt-8" label="알림을 불러오고 있어요." /> : null : data.items.length === 0 ? <section className="py-16 text-center"><span className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--tm-bg-subtle)]"><BellSimple aria-hidden="true" className="size-6 text-[var(--tm-action-primary)]" /></span><h2 className="mt-5 text-base font-semibold">아직 알림이 없어요</h2><p className="mt-2 text-[13px] leading-6 text-[var(--tm-text-secondary)]">신청 결과와 경기 소식이 도착하면<br />여기에서 알려드릴게요</p></section> : <ul className="overflow-hidden rounded-2xl bg-white">
        {data.items.map(item => {
          const { label, Icon } = notificationAppearance(item.type);
          const content = <>
            <span aria-hidden="true" className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${item.read ? "bg-[var(--tm-bg-subtle-muted)] text-[var(--tm-text-secondary)]" : "bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]"}`}><Icon size={18} weight={item.read ? "regular" : "bold"} /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[11px] leading-4 text-[var(--tm-text-secondary)]"><span>{label}</span><span aria-hidden="true">·</span><time dateTime={item.createdAt}>{relativeTime(item.createdAt)}</time>{!item.read ? <span role="img" aria-label="읽지 않음" className="ml-auto size-1.5 rounded-full bg-[var(--tm-action-primary)]" /> : null}</span>
              <span className={`mt-1 block text-[14px] leading-[21px] tracking-[-0.2px] ${item.read ? "font-medium" : "font-semibold"}`}>{item.title}</span>
              <span className="mt-1 block break-words text-[13px] leading-5 text-[var(--tm-text-secondary)]">{item.body}</span>
            </span>
          </>;
          const rowClass = "flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--tm-bg-subtle-muted)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--tm-action-primary)]";
          return <li key={item.id} className="border-b border-[var(--tm-border-subtle)] last:border-0">{item.href ? <Link className={rowClass} href={item.href} onClick={() => onOpen(item)}>{content}</Link> : <button type="button" className={rowClass} onClick={() => onOpen(item)}>{content}</button>}</li>;
        })}
      </ul>}
    </div>
  </main>;
}

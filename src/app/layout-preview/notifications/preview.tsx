"use client";

import { useState } from "react";
import { NotificationInbox, type NotificationsResponse } from "@/features/notifications/notification-inbox";
import { PushSettingsView } from "@/features/notifications/web-push-settings";

const examples: NotificationsResponse = { unreadCount: 3, items: [
  { id: "1", type: "COURT_MATCH_CONFIRMED", title: "참가가 확정됐어요", body: "서울숲 테니스장 참가비가 확인됐어요. 당일에 만나요.", href: null, read: false, createdAt: "2026-10-14T11:00:00+09:00" },
  { id: "2", type: "APPLICATION_ACCEPTED", title: "신청이 수락됐어요", body: "이지테니스 둔촌점 모집자가 신청을 수락했어요. 채팅에서 일정을 확인해요.", href: null, read: false, createdAt: "2026-10-14T10:00:00+09:00" },
  { id: "3", type: "SUPPORT_INQUIRY_REPLIED", title: "문의에 답변이 도착했어요", body: "내 문의 내역에서 담당자의 답변을 확인해 주세요.", href: null, read: false, createdAt: "2026-10-14T09:00:00+09:00" },
  { id: "4", type: "COURT_MATCH_REFUND_COMPLETED", title: "환불 완료로 표시됐어요", body: "망원 테니스장 운영자가 환불했다고 표시했어요. 통장에서 확인해 주세요.", href: null, read: true, createdAt: "2026-10-13T10:00:00+09:00" },
] };

export function NotificationsPreview() {
  const [data, setData] = useState(examples);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [environment, setEnvironment] = useState<"supported" | "native" | "install">("supported");
  return <>
    <NotificationInbox data={data} backHref="/layout-preview/matches" settings={<PushSettingsView status={{ enabled: true, subscriptionId: enabled ? "preview" : null }} environment={environment} message={message} onRetry={() => {}} onAction={action => { if (action !== "test") setEnabled(action === "on"); setMessage("디자인 미리보기예요. 실제 설정·발송은 하지 않아요."); }} />} onRetry={() => {}} onReadAll={() => setData(previous => ({ unreadCount: 0, items: previous.items.map(item => ({ ...item, read: true })) }))} onOpen={opened => setData(previous => { const items = previous.items.map(item => item.id === opened.id ? { ...item, read: true } : item); return { unreadCount: items.filter(item => !item.read).length, items }; })} />
    <aside className="mx-auto flex max-w-[560px] flex-wrap gap-3 px-5 pb-8 text-xs text-[var(--tm-text-secondary)]" aria-label="미리보기 설정">
      <p className="w-full">디자인 예시 · 실제 설정·발송·저장 없음</p>
      <button className="min-h-11 underline" onClick={() => setEnvironment("supported")}>지원 브라우저</button><button className="min-h-11 underline" onClick={() => setEnvironment("native")}>검증 앱</button><button className="min-h-11 underline" onClick={() => setEnvironment("install")}>아이폰 Safari</button><button className="min-h-11 underline" onClick={() => setData({ unreadCount: 0, items: [] })}>빈 목록</button><button className="min-h-11 underline" onClick={() => setData(examples)}>예시 복원</button>
    </aside>
  </>;
}

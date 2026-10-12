"use client";

import { Tab, TabList, TabListItem } from "@wanteddev/wds";
import Link from "next/link";
import { ChatCircle, TennisBall } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { StickyPageHeader } from "@/components/navigation/sticky-page-header";
import { PullToRefresh } from "@/components/feedback/pull-to-refresh";
import { BottomNavigation } from "@/components/navigation/bottom-navigation";
import { Button } from "@/components/ui/button";
import { matchScheduleText } from "@/matches/schedule";

type ChatRole = "HOST" | "PARTICIPANT";

type ConversationListItem = {
  match: { id: string; title: string; startsAt: string; status: string; finished: boolean };
  status: "OPEN" | "READ_ONLY" | "ARCHIVED";
  unreadMessageCount: number;
  lastMessage: { body: string; type: "USER" | "SYSTEM"; createdAt: string } | null;
};

function apiMessage(body: unknown, fallback: string) {
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string" ? body.error.message : fallback;
}

function schedule(startsAt: string) {
  return matchScheduleText(startsAt);
}

function time(createdAt: string) {
  const date = new Date(createdAt);
  const today = new Date();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });
  return new Intl.DateTimeFormat("ko-KR", day.format(date) === day.format(today)
    ? { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Seoul" }
    : { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" }).format(date);
}

type Lists = Record<ChatRole, ConversationListItem[]>;

async function fetchRole(role: ChatRole) {
  const response = await fetch(`/api/v1/me/conversations?role=${role}`, { cache: "no-store" });
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(apiMessage(body, "채팅 목록을 불러오지 못했어요."));
  return (body as { items: ConversationListItem[] }).items;
}

function unreadRooms(items: ConversationListItem[]) {
  return items.filter((item) => item.unreadMessageCount > 0).length;
}

/**
 * 어느 쪽을 먼저 열지 정한다.
 *
 * 늘 "내가 만든 매칭"으로 열면, 신청만 해 본 사람은 하단 배지에 안 읽은 채팅이 있다고
 * 떠 있는데 화면은 비어 있는 것을 본다. 배지가 거짓말을 하는 것처럼 보인다.
 */
function initialRole(lists: Lists): ChatRole {
  if (unreadRooms(lists.HOST) > 0) return "HOST";
  if (unreadRooms(lists.PARTICIPANT) > 0) return "PARTICIPANT";
  return lists.HOST.length === 0 && lists.PARTICIPANT.length > 0 ? "PARTICIPANT" : "HOST";
}

export function MatchChatList() {
  const [role, setRole] = useState<ChatRole | null>(null);
  const [lists, setLists] = useState<Lists | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const [hosted, joined] = await Promise.all([fetchRole("HOST"), fetchRole("PARTICIPANT")]);
      const next: Lists = { HOST: hosted, PARTICIPANT: joined };
      setLists(next);
      setRole((current) => current ?? initialRole(next));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "채팅 목록을 불러오지 못했어요.");
      setLists({ HOST: [], PARTICIPANT: [] });
      setRole((current) => current ?? "HOST");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const items = lists && role ? lists[role] : null;
  const otherRole: ChatRole = role === "HOST" ? "PARTICIPANT" : "HOST";
  const otherCount = lists ? lists[otherRole].length : 0;

  return <PullToRefresh onRefresh={load}><main className="flex min-h-app flex-col bg-[var(--tm-bg-page)] pb-28 text-[var(--tm-text-primary)]">
    <StickyPageHeader title="채팅" />
    <section className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-5">
      <Tab onValueChange={(value) => setRole(value as ChatRole)} value={role ?? "HOST"}>
        <TabList aria-label="채팅 목록 구분" className="mt-1" resize="fill">
          <TabListItem value="HOST">내가 만든 매칭</TabListItem>
          <TabListItem value="PARTICIPANT">내가 신청한 매칭</TabListItem>
        </TabList>
      </Tab>
      {items === null ? <div className="grid flex-1 place-items-center"><CourtRallyLoader label="채팅을 준비하고 있어요." /></div> : error ? <LoadError error={error} onRetry={() => void load()} /> : items.length === 0 ? <EmptyChatList onSwitch={() => setRole(otherRole)} otherCount={otherCount} role={role ?? "HOST"} /> : <div className="mt-3 divide-y divide-[var(--tm-border-subtle)]">{items.map((item) => <ConversationCard item={item} key={item.match.id} />)}</div>}
    </section>
    <BottomNavigation />
  </main></PullToRefresh>;
}

function ConversationCard({ item }: { item: ConversationListItem }) {
  return <Link className="flex items-start gap-3 rounded-xl px-1 py-5 transition-colors hover:bg-[var(--tm-bg-subtle)]" href={`/chats/${item.match.id}`}>
    <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]"><TennisBall size={27} weight="duotone" /></span>
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline gap-2"><h2 className="min-w-0 flex-1 truncate text-[15px] font-bold">{item.match.title}</h2>{item.lastMessage ? <time className="shrink-0 text-[11px] text-[var(--tm-text-secondary)]">{time(item.lastMessage.createdAt)}</time> : null}</div>
      <p className="mt-1 text-[11px] text-[var(--tm-text-secondary)]">{schedule(item.match.startsAt)}{item.match.finished ? " · 지난 매칭" : ""}</p>
      <div className="mt-2 flex items-center gap-2"><p className={`min-w-0 flex-1 truncate text-[13px] ${item.unreadMessageCount > 0 ? "font-medium" : "text-[var(--tm-text-secondary)]"}`}>{item.lastMessage?.body ?? "메이트와 첫 인사를 나눠 보세요."}</p>{item.unreadMessageCount > 0 ? <span aria-label={`새 메시지 ${item.unreadMessageCount}개`} className="grid min-w-5 shrink-0 place-items-center rounded-full bg-[var(--tm-action-primary)] px-1 text-[10px] font-bold leading-5 text-white">{item.unreadMessageCount > 99 ? "99+" : item.unreadMessageCount}</span> : null}</div>
      {item.status !== "OPEN" ? <span className="mt-2 inline-block rounded bg-[var(--tm-bg-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--tm-text-secondary)]">읽기 전용</span> : null}
    </div>
  </Link>;
}

function EmptyChatList({ onSwitch, otherCount, role }: { onSwitch: () => void; otherCount: number; role: ChatRole }) {
  return <section className="mt-16 text-center"><div aria-hidden="true" className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--tm-bg-subtle)] text-4xl"><ChatCircle size={30} className="text-[var(--tm-action-primary)]" /></div><h2 className="mt-5 text-lg font-bold">아직 채팅할 매칭이 없어요</h2><p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">{role === "HOST" ? "매칭을 만들고 참가자가 수락되면 여기에서 준비를 조율할 수 있어요." : "참가가 확정되면 여기에서 준비를 조율할 수 있어요."}</p>{otherCount > 0
    ? <Button className="mt-6" onClick={onSwitch} size="medium" variant="secondary">{role === "HOST" ? `내가 신청한 매칭에 ${otherCount}개 있어요` : `내가 만든 매칭에 ${otherCount}개 있어요`}</Button>
    : <Button as={Link} className="mt-6" href="/" size="medium">매칭 찾아보기</Button>}</section>;
}

function LoadError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <section className="mt-8 rally-card p-5"><p className="text-sm leading-6">{error}</p><Button onClick={onRetry} size="medium">다시 불러오기</Button></section>;
}

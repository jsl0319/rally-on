"use client";

import { Tab, TabList, TabListItem } from "@wanteddev/wds";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { BottomNavigation } from "@/components/navigation/bottom-navigation";
import { Button } from "@/components/ui/button";

type ChatRole = "HOST" | "PARTICIPANT";

type ConversationListItem = {
  match: { id: string; title: string; startsAt: string; status: string };
  status: "OPEN" | "READ_ONLY" | "ARCHIVED";
  unreadMessageCount: number;
  lastMessage: { body: string; type: "USER" | "SYSTEM"; createdAt: string } | null;
};

function apiMessage(body: unknown, fallback: string) {
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string" ? body.error.message : fallback;
}

function schedule(startsAt: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Seoul" }).format(new Date(startsAt));
}

function time(createdAt: string) {
  return new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Seoul" }).format(new Date(createdAt));
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

  return <main className="flex min-h-svh flex-col bg-[var(--tm-bg-page)] px-5 pb-28 pt-8 text-[var(--tm-text-primary)]">
    <section className="mx-auto flex w-full max-w-[560px] flex-1 flex-col">
      <p className="text-sm font-semibold text-[var(--tm-action-primary)]">채팅</p>
      <h1 className="mt-1 text-2xl font-bold">매칭 채팅</h1>
      <p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">매칭이 성사된 뒤에만 일정과 준비를 함께 조율할 수 있어요.</p>
      <Tab onValueChange={(value) => setRole(value as ChatRole)} value={role ?? "HOST"}>
        <TabList aria-label="채팅 목록 구분" className="mt-6" resize="fill">
          <TabListItem value="HOST">내가 만든 매칭</TabListItem>
          <TabListItem value="PARTICIPANT">내가 신청한 매칭</TabListItem>
        </TabList>
      </Tab>
      {items === null ? <div className="grid flex-1 place-items-center"><CourtRallyLoader label="채팅을 준비하고 있어요." /></div> : error ? <LoadError error={error} onRetry={() => void load()} /> : items.length === 0 ? <EmptyChatList onSwitch={() => setRole(otherRole)} otherCount={otherCount} role={role ?? "HOST"} /> : <div className="mt-6 space-y-3">{items.map((item) => <ConversationCard item={item} key={item.match.id} />)}</div>}
    </section>
    <BottomNavigation />
  </main>;
}

function ConversationCard({ item }: { item: ConversationListItem }) {
  return <Link className="block rounded-3xl border border-[var(--tm-border-default)] bg-white p-5 shadow-[0_4px_14px_rgba(49,94,158,0.05)] transition-colors hover:border-[var(--tm-border-strong)]" href={`/chats/${item.match.id}`}>
    <div className="flex items-start gap-3"><span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--tm-bg-subtle)] text-xl">🎾</span><div className="min-w-0 flex-1"><div className="flex items-start gap-2"><h2 className="min-w-0 flex-1 truncate font-bold">{item.match.title}</h2>{item.lastMessage ? <time className="shrink-0 text-xs text-[var(--tm-text-secondary)]">{time(item.lastMessage.createdAt)}</time> : null}</div><p className="mt-1 text-xs text-[var(--tm-text-secondary)]">{schedule(item.match.startsAt)}</p><p className="mt-3 truncate text-sm text-[var(--tm-text-muted)]">{item.lastMessage?.body ?? "채팅을 시작해 보세요."}</p><div className="mt-3 flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === "OPEN" ? "bg-[var(--tm-bg-highlight)] text-[var(--tm-tennis-ball-muted)]" : "bg-[var(--tm-bg-subtle-muted)] text-[var(--tm-text-secondary)]"}`}>{item.status === "OPEN" ? "대화 가능" : "읽기 전용"}</span>{item.unreadMessageCount > 0 ? <span aria-label={`새 메시지 ${item.unreadMessageCount}개`} className="grid size-5 place-items-center rounded-full bg-[var(--tm-action-primary)] text-[10px] font-bold text-white">{item.unreadMessageCount > 9 ? "9+" : item.unreadMessageCount}</span> : null}</div></div></div>
  </Link>;
}

function EmptyChatList({ onSwitch, otherCount, role }: { onSwitch: () => void; otherCount: number; role: ChatRole }) {
  return <section className="mt-16 text-center"><div aria-hidden="true" className="mx-auto grid size-24 place-items-center rounded-full bg-[var(--tm-bg-subtle)] text-4xl">💬</div><h2 className="mt-6 text-xl font-bold">아직 채팅할 매칭이 없어요</h2><p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">{role === "HOST" ? "매칭을 만들고 참가자가 수락되면 여기에서 준비를 조율할 수 있어요." : "참가가 확정되면 여기에서 준비를 조율할 수 있어요."}</p>{otherCount > 0
    ? <Button className="mt-6" onClick={onSwitch} size="medium" variant="secondary">{role === "HOST" ? `내가 신청한 매칭에 ${otherCount}개 있어요` : `내가 만든 매칭에 ${otherCount}개 있어요`}</Button>
    : <Button as={Link} className="mt-6" href="/" size="medium">매칭 찾아보기</Button>}</section>;
}

function LoadError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <section className="mt-8 rounded-3xl border border-[var(--tm-border-default)] bg-white p-5"><p className="text-sm leading-6">{error}</p><Button onClick={onRetry} size="medium">다시 불러오기</Button></section>;
}

"use client";

import { Switch } from "@wanteddev/wds";
import { WithdrawalModal } from "./withdrawal-modal";
import { LogoutButton } from "./logout-button";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CaretRight, ClipboardText, FileText, Headset, Megaphone, PaperPlaneTilt, ShieldCheck, UserCircle } from "@phosphor-icons/react";

import { StickyPageHeader } from "@/components/navigation/sticky-page-header";
import { PullToRefresh } from "@/components/feedback/pull-to-refresh";
import { BottomNavigation } from "@/components/navigation/bottom-navigation";
import { Button } from "@/components/ui/button";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import type { NotificationCounts } from "@/notifications/activity";
import { notificationsChangedEvent } from "@/notifications/changed";
import { useActionToast } from "@/components/feedback/use-action-toast";

type Me = {
  canManageService: boolean;
  nickname: string;
  matchNotificationsEnabled: boolean;
  profileImageUrl: string | null;
  tennisProfile: null | {
    experienceRange: string;
    rallyLevel: string;
    gameExperience: string;
    playPurposes: string[];
  };
};

const experienceLabels: Record<string, string> = { UNDER_3_MONTHS: "3개월 미만", MONTHS_3_TO_6: "3~6개월", MONTHS_6_TO_12: "6개월~1년", YEARS_1_TO_2: "1~2년", YEARS_2_PLUS: "2년 이상" };
const rallyLabels: Record<string, string> = { STARTING: "아직 랠리가 어려워요", SHORT_RALLY: "몇 번씩 주고받을 수 있어요", COMFORTABLE_RALLY: "편하게 랠리할 수 있어요", STANDARD_RALLY: "일반적인 랠리도 가능해요" };
const gameLabels: Record<string, string> = { NONE: "아직 해보지 않았어요", KNOWS_RULES: "규칙은 알고 있어요", PLAYED_FEW: "몇 번 해봤어요", CAN_PLAY: "게임을 진행할 수 있어요" };
const purposeLabels: Record<string, string> = { CASUAL_HIT: "편하게 공 주고받기", RALLY_PRACTICE: "랠리", STROKE_PRACTICE: "스트로크 연습", GAME_INTRO: "게임 입문", GAME: "게임" };

const legalReturnTo = `?returnTo=${encodeURIComponent("/my")}`;

function getErrorMessage(body: unknown, fallback = "내 정보를 불러오지 못했어요.") {
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string" ? body.error.message : fallback;
}

/** 배지 숫자는 있으면 좋은 정보라서, 실패해도 화면 전체를 막지 않는다. */
async function fetchJsonSafe<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function M8MyPage() {
  const showComplete = useActionToast();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [notificationError, setNotificationError] = useState("");
  const [savingNotificationPref, setSavingNotificationPref] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [unreadSentCount, setUnreadSentCount] = useState(0);
  const [unreadReceivedCount, setUnreadReceivedCount] = useState(0);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const countsSequence = useRef(0);
  const applyCounts = useCallback((counts: NotificationCounts) => {
    setUnreadNotificationCount(counts.unreadCount);
    setUnreadSentCount(counts.activityUnreadCounts?.sent ?? 0);
    setUnreadReceivedCount(counts.activityUnreadCounts?.received ?? 0);
  }, []);
  const loadCounts = useCallback(async () => {
    const sequence = ++countsSequence.current;
    const counts = await fetchJsonSafe<NotificationCounts>("/api/v1/me/notifications");
    if (counts && sequence === countsSequence.current) applyCounts(counts);
  }, [applyCounts]);
  useEffect(() => {
    const onChanged = (event: Event) => {
      countsSequence.current++;
      applyCounts((event as CustomEvent<NotificationCounts>).detail);
    };
    window.addEventListener(notificationsChangedEvent, onChanged);
    return () => window.removeEventListener(notificationsChangedEvent, onChanged);
  }, [applyCounts]);

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetch("/api/v1/me", { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(body));
      setMe(body as Me);

      await loadCounts();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "내 정보를 불러오지 못했어요.");
    }
  }, [loadCounts]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const toggleMatchNotifications = async (next: boolean) => {
    if (savingNotificationPref) return;
    setMe((current) => current ? { ...current, matchNotificationsEnabled: next } : current);
    setNotificationError("");
    setSavingNotificationPref(true);
    try {
      const response = await fetch("/api/v1/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchNotificationsEnabled: next }),
      });
      if (!response.ok) throw new Error("알림 설정을 저장하지 못했어요.");
      showComplete(next ? "매칭 소식 알림을 켰습니다." : "매칭 소식 알림을 껐습니다.");
    } catch {
      setNotificationError("알림 설정을 저장하지 못했어요. 다시 시도해 주세요.");
      setMe((current) => current ? { ...current, matchNotificationsEnabled: !next } : current);
    } finally {
      setSavingNotificationPref(false);
    }
  };


  return <PullToRefresh onRefresh={load} disabled={savingNotificationPref || withdrawalOpen || logoutOpen}><main className="flex min-h-app flex-col bg-[var(--tm-bg-page)] pb-28 text-[var(--tm-text-primary)]">
    <StickyPageHeader title="마이" actions={<NotificationBell unreadCount={unreadNotificationCount} />} />
    <section className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-5">

      {me !== null && error ? <LoadError error={error} onRetry={load} /> : null}
      {me === null ? error ? <LoadError error={error} onRetry={load} /> : <div className="grid flex-1 place-items-center"><CourtRallyLoader label="내 정보를 준비하고 있어요." /></div> : <>
        <ProfileCard me={me} />

        <SectionLabel>내 활동</SectionLabel>
        <Card>
          <LinkRow
            badge={<CountBadge count={unreadReceivedCount} />}
            description="모집과 신청자 관리"
            href="/activity/received"
            icon={<IconChip><ClipboardText aria-hidden="true" className="size-5" /></IconChip>}
            title="내가 만든 매칭"
          />
          <LinkRow
            badge={<CountBadge count={unreadSentCount} />}
            description="신청 상태와 남은 할 일"
            href="/activity/sent"
            icon={<IconChip><PaperPlaneTilt aria-hidden="true" className="size-5" /></IconChip>}
            title="내가 보낸 신청"
          />
        </Card>

        <SectionLabel>알림과 고객 지원</SectionLabel>
        <Card>
          <ToggleRow
            description="새 신청 · 수락 · 거절"
            icon={<Bell aria-hidden="true" className="size-5 text-[var(--tm-text-muted)]" />}
            title="매칭 소식 알림"
            toggle={<Switch aria-label="매칭 소식 알림" checked={me.matchNotificationsEnabled} disabled={savingNotificationPref} onCheckedChange={(next) => void toggleMatchNotifications(next)} size="small" />}
          />
          {notificationError ? <p className="px-3 py-2 text-xs text-[var(--tm-status-error-text)]" role="alert">{notificationError}</p> : null}
          <p className="px-3 py-3 text-[11px] leading-5 text-[var(--tm-text-secondary)]">참가비·취소·문의 답변 안내는 알림 설정과 관계없이 전달돼요.</p>
          <LinkRow href="/notices" icon={<Megaphone aria-hidden="true" className="size-5 text-[var(--tm-text-muted)]" />} title="공지사항" />
          <LinkRow href="/support/inquiry" icon={<Headset aria-hidden="true" className="size-5 text-[var(--tm-text-muted)]" />} title="1:1 문의" />
        </Card>

        {me.canManageService ? <><SectionLabel>관리자 전용</SectionLabel><Card><LinkRow href="/internal" title="서비스 관리" description="1:1 문의 · 공지사항 · 운영 확인" icon={<ShieldCheck aria-hidden className="size-5 text-[var(--tm-action-primary)]" />} /></Card></> : null}

        <SectionLabel>약관</SectionLabel>
        <Card>
          <LinkRow href={`/terms${legalReturnTo}`} icon={<FileText aria-hidden="true" className="size-5 text-[var(--tm-text-muted)]" />} title="서비스 이용약관" />
          <LinkRow href={`/privacy${legalReturnTo}`} icon={<ShieldCheck aria-hidden="true" className="size-5 text-[var(--tm-text-muted)]" />} title="개인정보 처리방침" />
        </Card>

        <div className="mt-8 flex items-center justify-center gap-1 text-xs">
          <LogoutButton onOpenChange={setLogoutOpen} />
          <span aria-hidden="true" className="text-[var(--tm-border-strong)]">·</span>
          <button className="min-h-11 rounded-xl px-3 font-semibold text-[var(--tm-text-secondary)]" onClick={() => setWithdrawalOpen(true)} type="button">회원 탈퇴</button>
        </div>
      </>}
    </section>

    <BottomNavigation />
    {withdrawalOpen ? <WithdrawalModal onCancel={() => setWithdrawalOpen(false)} /> : null}
  </main></PullToRefresh>;
}

function NotificationBell({ unreadCount }: { unreadCount: number }) {
  return <Link
    aria-label={unreadCount > 0 ? `알림, 읽지 않은 알림 ${unreadCount}개` : "알림"}
    className="relative -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--tm-text-primary)] transition-colors hover:bg-[var(--tm-bg-subtle)]"
    href="/my/notifications"
  >
    <Bell aria-hidden="true" className="size-6" />
    {unreadCount > 0 ? <span aria-hidden="true" className="absolute right-1 top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-[var(--tm-status-error-text)] px-1 text-[10px] font-bold leading-[18px] text-white">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
  </Link>;
}

function LoadError({ error, onRetry }: { error: string; onRetry: () => Promise<void> }) {
  return <section className="mt-8 rally-card p-5"><p className="text-sm leading-6">{error}</p><Button className="mt-4" onClick={() => void onRetry()} size="medium">다시 불러오기</Button></section>;
}

/** 프로필 카드 전체가 프로필 수정(닉네임 포함)으로 가는 입구다. */
function ProfileCard({ me }: { me: Me }) {
  const profile = me.tennisProfile;
  return <section className="py-6">
    <Link className="flex items-center gap-4" href={profile ? "/my/profile" : "/"}>
      <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]">{me.profileImageUrl ? <Image alt="" className="size-full object-cover" height={64} src={me.profileImageUrl} unoptimized width={64} /> : <UserCircle aria-hidden="true" className="size-12" weight="fill" />}</span>
      <span className="min-w-0 flex-1"><span className="block break-words text-[22px] font-bold tracking-[-.7px]">{me.nickname}</span><span className="mt-1 block text-xs text-[var(--tm-text-secondary)]">{profile ? `테니스 경력 ${experienceLabels[profile.experienceRange]}` : "테니스 프로필을 만들어 주세요"}</span></span>
      <span className="flex min-h-11 shrink-0 items-center gap-1 text-xs font-semibold text-[var(--tm-action-primary)]">{profile ? "프로필 수정" : "만들기"}<CaretRight size={14} aria-hidden /></span>
    </Link>
    {profile ? <div className="mt-5 border-l-2 border-[var(--tm-action-primary)] pl-3"><p className="text-[13px] font-medium">{rallyLabels[profile.rallyLevel]}</p><p className="mt-1 text-xs text-[var(--tm-text-secondary)]">게임 경험 · {gameLabels[profile.gameExperience]}</p><div className="mt-3 flex flex-wrap gap-1.5">{profile.playPurposes.map(purpose => <span key={purpose} className="rounded-md bg-[var(--tm-bg-subtle)] px-2 py-1 text-[11px] text-[var(--tm-action-primary)]">{purposeLabels[purpose]}</span>)}</div></div> : null}
  </section>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-5 px-1 text-xs font-semibold text-[var(--tm-text-secondary)]">{children}</h2>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="mt-2 rounded-2xl bg-white px-3 py-1">
    <div className="divide-y divide-[var(--tm-border-subtle)]">{children}</div>
  </section>;
}

/** 내 활동처럼 자주 누르는 줄에만 쓰는 강조용 아이콘 배경. */
function IconChip({ children }: { children: React.ReactNode }) {
  return <span className="grid size-9 place-items-center rounded-xl bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]">{children}</span>;
}

function RowInner({ badge, description, icon, title, trailing }: { badge?: React.ReactNode; description?: string; icon: React.ReactNode; title: string; trailing: React.ReactNode }) {
  return <>
    <span className="grid size-10 shrink-0 place-items-center">{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold">{title}</span>
      {description ? <span className="mt-0.5 block text-xs leading-5 text-[var(--tm-text-secondary)]">{description}</span> : null}
    </span>
    {badge}
    {trailing}
  </>;
}

const rowClassName = "flex w-full items-center gap-2 rounded-xl px-1 py-3 text-left";

function LinkRow({ badge, description, href, icon, title }: { badge?: React.ReactNode; description?: string; href: string; icon: React.ReactNode; title: string }) {
  return <Link className={`${rowClassName} transition-colors hover:bg-[var(--tm-bg-subtle-muted)]`} href={href}>
    <RowInner badge={badge} description={description} icon={icon} title={title} trailing={<CaretRight aria-hidden="true" className="size-4 shrink-0 text-[var(--tm-text-muted)]" />} />
  </Link>;
}

/** 스위치가 들어가는 줄은 컨테이너를 버튼으로 만들면 안 된다(중첩 인터랙티브). */
function ToggleRow({ description, icon, title, toggle }: { description?: string; icon: React.ReactNode; title: string; toggle: React.ReactNode }) {
  return <div className={rowClassName}>
    <RowInner description={description} icon={icon} title={title} trailing={toggle} />
  </div>;
}

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span aria-label={`새 소식 ${count}개`} className="inline-flex min-h-6 shrink-0 items-center rounded-full bg-[var(--tm-status-error-text)] px-2 text-xs font-bold text-white">{count > 9 ? "9+" : count}</span>;
}

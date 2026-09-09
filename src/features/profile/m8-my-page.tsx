"use client";

import { ActionArea, ActionAreaButton, Modal, ModalContainer, ModalContent, ModalContentItem, ModalDescription, ModalHeading, ModalSummary, Switch } from "@wanteddev/wds";
import { signOut } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell, CaretRight, ClipboardText, FileText, Headset, Megaphone, PaperPlaneTilt, ShieldCheck, UserCircle } from "@phosphor-icons/react";

import { BottomNavigation } from "@/components/navigation/bottom-navigation";
import { Button } from "@/components/ui/button";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";

type Me = {
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

type SentApplicationSummary = {
  status: string;
  courtMatch: { depositClaimedAt: string | null; awaitingRefund: boolean; refundRequested: boolean } | null;
};

/**
 * 배지는 "내가 손대야 할 신청" 수다. 일반 매칭은 모집자의 검토를 기다리는 것뿐이지만,
 * 코트 매칭은 승인 뒤에 입금이, 취소 뒤에 환불 계좌 입력이 남는다.
 */
function needsMyAction(application: SentApplicationSummary) {
  if (application.status === "PENDING") return true;
  const courtMatch = application.courtMatch;
  if (!courtMatch) return false;
  if (courtMatch.awaitingRefund) return !courtMatch.refundRequested;
  return application.status === "ACCEPTED" && !courtMatch.depositClaimedAt;
}

export function M8MyPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [savingNotificationPref, setSavingNotificationPref] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [pendingSentCount, setPendingSentCount] = useState(0);
  const [pendingReceivedCount, setPendingReceivedCount] = useState(0);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawalError, setWithdrawalError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetch("/api/v1/me", { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(body));
      setMe(body as Me);

      const [notifications, sentApplications, hostedMatches] = await Promise.all([
        fetchJsonSafe<{ unreadCount: number }>("/api/v1/me/notifications"),
        fetchJsonSafe<{ items: SentApplicationSummary[] }>("/api/v1/me/applications"),
        fetchJsonSafe<{ items: Array<{ pendingApplicationCount: number }> }>("/api/v1/me/hosted-matches"),
      ]);
      setUnreadNotificationCount(notifications?.unreadCount ?? 0);
      setPendingSentCount(sentApplications?.items.filter(needsMyAction).length ?? 0);
      setPendingReceivedCount(hostedMatches?.items.reduce((sum, item) => sum + item.pendingApplicationCount, 0) ?? 0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "내 정보를 불러오지 못했어요.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const toggleMatchNotifications = async (next: boolean) => {
    setMe((current) => current ? { ...current, matchNotificationsEnabled: next } : current);
    setSavingNotificationPref(true);
    try {
      const response = await fetch("/api/v1/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchNotificationsEnabled: next }),
      });
      if (!response.ok) throw new Error("알림 설정을 저장하지 못했어요.");
    } catch {
      setMe((current) => current ? { ...current, matchNotificationsEnabled: !next } : current);
    } finally {
      setSavingNotificationPref(false);
    }
  };

  const withdraw = async () => {
    setWithdrawing(true);
    setWithdrawalError("");
    try {
      const response = await fetch("/api/v1/me/withdrawal", { method: "POST" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(body, "회원 탈퇴를 처리하지 못했어요."));
      await signOut({ callbackUrl: "/login" });
    } catch (caught) {
      setWithdrawalError(caught instanceof Error ? caught.message : "회원 탈퇴를 처리하지 못했어요.");
      setWithdrawing(false);
    }
  };

  return <main className="flex min-h-svh flex-col bg-[var(--tm-bg-page)] px-5 pb-28 pt-8 text-[var(--tm-text-primary)]">
    <section className="mx-auto flex w-full max-w-[560px] flex-1 flex-col">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">내 테니스 이야기</h1>
        <NotificationBell unreadCount={unreadNotificationCount} />
      </header>

      {me === null ? error ? <LoadError error={error} onRetry={load} /> : <div className="grid flex-1 place-items-center"><CourtRallyLoader label="내 정보를 준비하고 있어요." /></div> : <>
        <ProfileCard me={me} />

        <SectionLabel>내 활동</SectionLabel>
        <Card>
          <LinkRow
            badge={<CountBadge count={pendingReceivedCount} />}
            description="내가 만든 매칭과 새로 들어온 신청을 확인해요"
            href="/activity/received"
            icon={<IconChip><ClipboardText aria-hidden="true" className="size-5" /></IconChip>}
            title="내가 만든 매칭 · 받은 신청"
          />
          <LinkRow
            badge={<CountBadge count={pendingSentCount} />}
            description="내가 신청한 매칭의 진행 상황과 남은 할 일을 확인해요"
            href="/activity/sent"
            icon={<IconChip><PaperPlaneTilt aria-hidden="true" className="size-5" /></IconChip>}
            title="보낸 신청"
          />
        </Card>

        <SectionLabel>설정</SectionLabel>
        <Card>
          <ToggleRow
            description="신청 · 수락 · 거절 소식을 알림으로 받아요"
            icon={<Bell aria-hidden="true" className="size-5 text-[var(--tm-text-muted)]" />}
            title="매칭 알림"
            toggle={<Switch checked={me.matchNotificationsEnabled} disabled={savingNotificationPref} onCheckedChange={(next) => void toggleMatchNotifications(next)} size="small" />}
          />
          <LinkRow href="/notices" icon={<Megaphone aria-hidden="true" className="size-5 text-[var(--tm-text-muted)]" />} title="공지사항" />
          <LinkRow href="/support/inquiry" icon={<Headset aria-hidden="true" className="size-5 text-[var(--tm-text-muted)]" />} title="1:1 문의" />
        </Card>

        <SectionLabel>약관</SectionLabel>
        <Card>
          <LinkRow href={`/terms${legalReturnTo}`} icon={<FileText aria-hidden="true" className="size-5 text-[var(--tm-text-muted)]" />} title="서비스 이용약관" />
          <LinkRow href={`/privacy${legalReturnTo}`} icon={<ShieldCheck aria-hidden="true" className="size-5 text-[var(--tm-text-muted)]" />} title="개인정보 처리방침" />
        </Card>

        <div className="mt-8 flex items-center justify-center gap-1 text-xs">
          <button className="min-h-11 rounded-xl px-3 font-semibold text-[var(--tm-text-secondary)]" onClick={() => void signOut({ callbackUrl: "/login" })} type="button">로그아웃</button>
          <span aria-hidden="true" className="text-[var(--tm-border-strong)]">·</span>
          <button className="min-h-11 rounded-xl px-3 font-semibold text-[var(--tm-text-secondary)]" onClick={() => setWithdrawalOpen(true)} type="button">회원 탈퇴</button>
        </div>
      </>}
    </section>

    <BottomNavigation />
    {withdrawalOpen ? <WithdrawalModal busy={withdrawing} error={withdrawalError} onCancel={() => { setWithdrawalOpen(false); setWithdrawalError(""); }} onConfirm={() => void withdraw()} /> : null}
  </main>;
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
  return <section className="mt-8 rounded-3xl border border-[var(--tm-border-default)] bg-white p-5"><p className="text-sm leading-6">{error}</p><Button className="mt-4" onClick={() => void onRetry()} size="medium">다시 불러오기</Button></section>;
}

/** 프로필 카드 전체가 프로필 수정(닉네임 포함)으로 가는 입구다. */
function ProfileCard({ me }: { me: Me }) {
  const profile = me.tennisProfile;
  const meta = profile
    ? [experienceLabels[profile.experienceRange], gameLabels[profile.gameExperience], profile.playPurposes.map((purpose) => purposeLabels[purpose]).filter(Boolean).join(" · ")].filter(Boolean).join(" · ")
    : "내게 잘 맞는 메이트를 찾기 위한 정보예요.";

  return <Link
    className="mt-5 flex items-center gap-4 rounded-3xl border border-[var(--tm-border-default)] bg-white p-5 shadow-[0_4px_14px_rgba(49,94,158,0.05)] transition-colors hover:bg-[var(--tm-bg-subtle-muted)]"
    href={profile ? "/my/profile" : "/"}
  >
    <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]">
      {me.profileImageUrl
        ? <Image alt="" className="size-full object-cover" height={56} src={me.profileImageUrl} unoptimized width={56} />
        : <UserCircle aria-hidden="true" className="size-9" weight="fill" />}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-lg font-bold">{me.nickname}</span>
      <span className="mt-1 block text-sm font-semibold text-[var(--tm-action-primary)]">{profile ? rallyLabels[profile.rallyLevel] : "테니스 프로필을 만들어 볼까요?"}</span>
      <span className="mt-1 block text-xs leading-5 text-[var(--tm-text-secondary)]">{meta}</span>
    </span>
    <CaretRight aria-hidden="true" className="size-5 shrink-0 text-[var(--tm-text-muted)]" />
  </Link>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-7 px-1 text-sm font-semibold text-[var(--tm-text-secondary)]">{children}</h2>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="mt-2 rounded-3xl border border-[var(--tm-border-default)] bg-white px-3 py-1 shadow-[0_4px_14px_rgba(49,94,158,0.05)]">
    <div className="divide-y divide-[var(--tm-border-subtle)]">{children}</div>
  </section>;
}

/** 내 활동처럼 자주 누르는 줄에만 쓰는 강조용 아이콘 배경. */
function IconChip({ children }: { children: React.ReactNode }) {
  return <span className="grid size-10 place-items-center rounded-full bg-[var(--tm-bg-subtle)] text-[var(--tm-action-primary)]">{children}</span>;
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

const rowClassName = "flex w-full items-center gap-3 rounded-2xl px-1 py-3.5 text-left";

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
  return <span className="inline-flex min-h-6 shrink-0 items-center rounded-full bg-[var(--tm-action-primary)] px-2 text-xs font-bold text-white">{count}</span>;
}

function WithdrawalModal({ busy, error, onCancel, onConfirm }: { busy: boolean; error: string; onCancel: () => void; onConfirm: () => void }) {
  return <Modal open onOpenChange={(next) => { if (!next) onCancel(); }}>
    <ModalContainer variant="bottom">
      <ModalContent>
        <ModalContentItem>
          <ModalSummary>한 번만 확인해요</ModalSummary>
          <ModalHeading>정말 탈퇴할까요?</ModalHeading>
          <ModalDescription>탈퇴하면 더 이상 로그인할 수 없고, 만든 매칭과 신청 내역에도 접근할 수 없어요.</ModalDescription>
        </ModalContentItem>
        {error ? <p className="px-1 pb-2 text-sm text-[var(--tm-status-error-text)]">{error}</p> : null}
      </ModalContent>
      <ActionArea variant="strong">
        <ActionAreaButton disabled={busy} loading={busy} onClick={onConfirm} variant="main">네, 탈퇴할게요</ActionAreaButton>
        <ActionAreaButton buttonColor="assistive" disabled={busy} onClick={onCancel} variant="alternative">돌아가기</ActionAreaButton>
      </ActionArea>
    </ModalContainer>
  </Modal>;
}

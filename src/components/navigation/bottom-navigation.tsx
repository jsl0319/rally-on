"use client";

import { ChatCircleDots, TennisBall, UserCircle, UsersThree } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Badges = { notifications: number; chats: number };

type NavigationItem = {
  value: string;
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
  icon: React.ReactNode;
  /** 이 항목에 붙일 미읽음 수. 0이면 배지를 그리지 않는다. */
  badge?: (badges: Badges) => number;
};

const iconClassName = "size-[22px] shrink-0";

/**
 * 안 읽은 것이 있다는 사실은 하단 메뉴에서 보여야 한다. 알림이 마이 탭 안쪽 종
 * 아이콘에만 있으면 수락·취소 같은 소식을 한참 뒤에 알게 된다.
 *
 * 화면을 옮길 때마다 다시 세고, 한 화면에 머무를 때는 1분에 한 번만 확인한다.
 * 탭이 화면 밖에 있으면 세지 않는다. 배지 하나 때문에 요청을 계속 보내지 않기 위해서다.
 */
function useBadges() {
  const pathname = usePathname();
  const [badges, setBadges] = useState<Badges>({ notifications: 0, chats: 0 });

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/me/badges", { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json() as Partial<Badges>;
      setBadges({ notifications: Number(body.notifications ?? 0), chats: Number(body.chats ?? 0) });
    } catch {
      // 배지는 보조 정보다. 실패해도 화면을 막지 않는다.
    }
  }, []);

  useEffect(() => {
    // 첫 조회는 렌더 밖으로 미룬다. 효과 본문에서 바로 상태를 바꾸면 연쇄 렌더가 된다.
    const initial = window.setTimeout(() => { void load(); }, 0);
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 60_000);
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, pathname]);

  return badges;
}

function BadgedIcon({ count, children, label }: { count: number; children: React.ReactNode; label: string }) {
  if (count <= 0) return <>{children}</>;
  return <span className="relative inline-flex">
    {children}
    <span className="absolute -right-2 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--tm-status-error-text)] px-1 text-[9px] font-bold leading-4 text-white" role="status">
      <span className="sr-only">{label} </span>{count > 9 ? "9+" : count}
    </span>
  </span>;
}

const navigationItems: NavigationItem[] = [
  { value: "matches", href: "/", label: "매칭", isActive: (pathname) => pathname === "/", icon: <UsersThree aria-hidden="true" className={iconClassName} weight="fill" /> },
  { value: "partner-sessions", href: "/partner-sessions", label: "코트 매칭", isActive: (pathname) => pathname.startsWith("/partner-sessions"), icon: <TennisBall aria-hidden="true" className={iconClassName} weight="fill" /> },
  { value: "chats", href: "/chats", label: "채팅", isActive: (pathname) => pathname.startsWith("/chats"), icon: <ChatCircleDots aria-hidden="true" className={iconClassName} weight="fill" />, badge: (badges) => badges.chats },
  { value: "my", href: "/my", label: "마이", isActive: (pathname) => pathname === "/my", icon: <UserCircle aria-hidden="true" className={iconClassName} weight="fill" />, badge: (badges) => badges.notifications },
];

export function BottomNavigation() {
  const pathname = usePathname();
  const badges = useBadges();
  const activeValue = navigationItems.find((item) => item.isActive(pathname))?.value;

  return <nav aria-label="주요 메뉴" className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--tm-border-default)] bg-white/95 backdrop-blur"><div className="rally-navigation">{navigationItems.map((item) => <Link href={item.href} key={item.value} aria-current={activeValue === item.value ? "page" : undefined}><span><BadgedIcon count={item.badge?.(badges) ?? 0} label={`${item.label} 새 소식`}>{item.icon}</BadgedIcon></span><span>{item.label}</span></Link>)}</div></nav>;
}

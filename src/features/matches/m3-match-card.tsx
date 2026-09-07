import Link from "next/link";

import { CourtMedia, type CourtImageView } from "./court-media";

export type MatchCardData = {
  id: string;
  title: string;
  recruitment?: { maleRemaining: number; femaleRemaining: number } | null;
  gameType?: { code: string; label: string } | null;
  statusLabel: string;
  startsAt: string;
  endsAt: string;
  court: { sourceLabel: string; name: string | null; image: CourtImageView };
  playPurposes: Array<{ code: string; label: string }>;
  beginnerWelcome: boolean;
  remainingSpots: number;
  estimatedFeePerPersonKrw: number | null;
  recommendationReasons: Array<{ code: string; label: string }>;
  isHost: boolean;
};

function formatSchedule(startsAt: string, endsAt: string) {
  const date = new Date(startsAt);
  const end = new Date(endsAt);
  const day = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Seoul" }).format(date);
  const time = new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Seoul" });
  return `${day} · ${time.format(date)}–${time.format(end)}`;
}

export function MatchCard({ match, returnTo = "/" }: { match: MatchCardData; returnTo?: string }) {
  return (
    <Link
      className="flex min-h-[218px] w-full gap-4 rounded-3xl border border-[var(--tm-border-default)] bg-white p-5 shadow-sm transition hover:border-[var(--tm-border-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tm-action-primary)]"
      href={`/matches/${match.id}?returnTo=${encodeURIComponent(returnTo)}`}
    >
      <CourtMedia alt={match.court.name ? `${match.court.name} 코트 사진` : "코트 정보"} className="h-[178px] w-28 shrink-0" fallbackLabel={match.court.name ? "코트 사진 없음" : "코트 미정"} image={match.court.image} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-5 items-center gap-1 overflow-hidden text-[11px] font-semibold leading-4">
          <span className="shrink-0 text-[var(--tm-action-primary)]">{match.statusLabel}</span>
          {match.isHost ? <span className="truncate font-bold text-[var(--tm-text-secondary)]">· 내가 만든 매칭</span> : null}
          {match.beginnerWelcome ? <span className="truncate text-[var(--tm-tennis-ball-muted)]">· 🌱 초보자 환영</span> : null}
        </div>
        <h2 className="line-clamp-2 min-h-[52px] text-lg font-medium leading-[26px]">{match.court.name ?? "코트 미정"}</h2>
        <p className="min-h-5 truncate text-sm leading-5 text-[var(--tm-action-primary)]">
          {match.recommendationReasons[0]?.label ?? <span aria-hidden>&nbsp;</span>}
        </p>
        <p className="text-sm leading-5 text-[var(--tm-text-secondary)]">
          {match.gameType ? <>{match.gameType.label}<br /></> : null}
          {formatSchedule(match.startsAt, match.endsAt)}<br />
          <span className="text-[var(--tm-text-secondary)]">{match.court.sourceLabel}</span><br />
          {match.estimatedFeePerPersonKrw === null ? "비용 협의 필요" : `1인 약 ${match.estimatedFeePerPersonKrw.toLocaleString("ko-KR")}원`} · {match.recruitment ? `남자 ${match.recruitment.maleRemaining}명 · 여자 ${match.recruitment.femaleRemaining}명 남음` : `남은 자리 ${match.remainingSpots}명`}
        </p>
      </div>
    </Link>
  );
}

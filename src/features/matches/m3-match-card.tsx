import Link from "next/link";
import { matchCardSchedule } from "@/matches/schedule";
import { Clock, MapPin, Users, PencilSimple } from "@phosphor-icons/react/dist/ssr";
import { displayCourtImage, MatchBadge, PlayPurposeBadge } from "./match-presentation";

import { CourtMedia, type CourtImageView } from "./court-media";

export type MatchCardData = {
  id: string;
  title: string;
  recruitment?: { maleRemaining: number; femaleRemaining: number } | null;
  gameType?: { code: string; label: string } | null;
  statusLabel: string;
  startsAt: string;
  endsAt: string;
  court: { source?: string; address?: string | null; sourceLabel: string; name: string | null; image: CourtImageView };
  playPurposes: Array<{ code: string; label: string }>;
  beginnerWelcome: boolean;
  remainingSpots: number;
  estimatedFeePerPersonKrw: number | null;
  recommendationReasons: Array<{ code: string; label: string }>;
  isHost: boolean;
  canApply?: boolean;
  host?: { nickname: string; experienceLabel: string | null } | null;
  introduction?: string | null;
};

export function MatchCard({ match, returnTo = "/" }: { match: MatchCardData; returnTo?: string }) {
  const date = matchCardSchedule(match.startsAt, match.endsAt);
  const region = match.court.address?.split(" ").slice(0, 3).join(" ");
  const image = displayCourtImage(match.court);
  const open = match.statusLabel === "모집 중" && match.remainingSpots > 0;
  const remaining = match.recruitment
    ? `남 ${match.recruitment.maleRemaining}명 · 여 ${match.recruitment.femaleRemaining}명 남음`
    : `성별 무관 ${match.remainingSpots}명 남음`;
  return <Link className="rally-card rally-discovery-card group transition-colors hover:border-[var(--tm-border-strong)]" href={`/matches/${match.id}?returnTo=${encodeURIComponent(returnTo)}`}>
    <div className="min-w-0 px-3 py-2">
      <h2 className="line-clamp-2 text-[16px] font-bold leading-5 tracking-tight">{match.court.name ?? "코트 미정"}</h2>
      <p className="mt-1 flex items-start gap-1 text-xs font-semibold leading-[18px] text-[var(--tm-action-primary)]"><Clock size={13} className="mt-0.5 shrink-0" aria-hidden /><span className="tabular-nums">{date}</span></p>
      {region ? <p className="flex items-center gap-1 text-xs leading-4 text-[var(--tm-text-secondary)]"><MapPin size={13} className="shrink-0" aria-hidden /><span className="truncate">{region}</span></p> : null}
      <div className="rally-card-badges mt-1 flex flex-wrap gap-1">{match.gameType ? <MatchBadge>{match.gameType.label}</MatchBadge> : null}{match.playPurposes.map((purpose) => <PlayPurposeBadge key={purpose.code} purpose={purpose} />)}{match.beginnerWelcome ? <MatchBadge tone="green">초보 환영</MatchBadge> : null}</div>
    </div>
    <CourtMedia alt={image.sourceLabel === "견본 이미지" ? "실제 장소와 다른 테니스장 견본 사진" : `${match.court.name ?? "코트"} 사진`} className="rally-card-photo" sizes="(max-width: 560px) 26vw, 128px" fallbackLabel={match.court.name ? "사진 없음" : "코트 미정"} image={image} />
    <div className="rally-card-footer px-3 py-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${open ? "text-[var(--tm-action-primary)]" : "text-[var(--tm-text-secondary)]"}`}><Users size={13} weight="bold" aria-hidden />{open ? remaining : match.statusLabel}</span>

      </div>
      {match.isHost ? <p className="mt-0.5 flex items-center gap-1 text-[10px] text-[var(--tm-text-secondary)]"><PencilSimple size={11} aria-hidden />내가 개설</p> : match.recommendationReasons[0] ? <p className="mt-0.5 text-[11px] leading-4 text-[var(--tm-text-secondary)]">{match.recommendationReasons[0].label}</p> : null}
    </div>
  </Link>;
}

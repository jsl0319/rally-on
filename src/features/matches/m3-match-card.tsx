import Link from "next/link";
import { Clock, MapPin, Users, PencilSimple } from "@phosphor-icons/react/dist/ssr";
import { displayCourtImage, matchSchedule, MatchBadge, PlayPurposeBadge } from "./match-presentation";

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
  host?: { nickname: string; experienceLabel: string | null } | null;
  introduction?: string | null;
};

export function MatchCard({ match, returnTo = "/" }: { match: MatchCardData; returnTo?: string }) {
  const date = matchSchedule(match.startsAt, match.endsAt);
  const region = match.court.address?.split(" ").slice(0, 3).join(" ");
  const image = displayCourtImage(match.court);
  const open = match.statusLabel === "모집 중" && match.remainingSpots > 0;
  return <Link className="rally-card group block p-4 transition-colors hover:border-[var(--tm-border-strong)]" href={`/matches/${match.id}?returnTo=${encodeURIComponent(returnTo)}`}>
    <div className="mb-3 flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--tm-action-primary)]"><Clock size={14} aria-hidden /><span className="tabular-nums">{date.day} <span className="ml-1">{date.time}</span></span></span>{match.isHost ? <span className="flex shrink-0 items-center gap-1 text-[11px] text-[var(--tm-text-secondary)]"><PencilSimple size={12} aria-hidden />내가 개설</span> : null}</div>
    <div className="flex gap-3.5"><div className="min-w-0 flex-1"><h2 className="line-clamp-2 text-[17px] font-bold leading-6 tracking-tight">{match.court.name ?? "코트 미정"}</h2>{region ? <p className="mt-1.5 flex items-center gap-1 text-xs text-[var(--tm-text-secondary)]"><MapPin size={13} className="shrink-0" aria-hidden /><span className="truncate">{region}</span></p> : null}<div className="mt-3 flex flex-wrap gap-1">{match.gameType ? <MatchBadge>{match.gameType.label}</MatchBadge> : null}{match.playPurposes.map((purpose) => <PlayPurposeBadge key={purpose.code} purpose={purpose} />)}{match.beginnerWelcome ? <MatchBadge tone="green">초보 환영</MatchBadge> : null}</div></div><CourtMedia alt={image.sourceLabel === "견본 이미지" ? "실제 장소와 다른 테니스장 견본 사진" : `${match.court.name ?? "코트"} 사진`} className="h-[90px] w-[86px] shrink-0" fallbackLabel={match.court.name ? "사진 없음" : "코트 미정"} image={image} /></div>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--tm-border-subtle)] pt-3"><span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${open ? "text-[var(--tm-action-primary)]" : "text-[var(--tm-text-secondary)]"}`}><Users size={15} weight="bold" aria-hidden />{!open ? match.statusLabel : match.recruitment ? `남 ${match.recruitment.maleRemaining}명 · 여 ${match.recruitment.femaleRemaining}명 남음` : `${match.remainingSpots}명 더 함께해요`}</span><span className="text-[15px] font-bold tabular-nums">{match.estimatedFeePerPersonKrw === null ? "비용 미정" : <><span className="mr-1 text-[11px] font-normal text-[var(--tm-text-secondary)]">{match.court.source === "EXTERNAL_RESERVED" ? "참가비" : "1인 약"}</span>{match.estimatedFeePerPersonKrw.toLocaleString("ko-KR")}원</>}</span></div>
    {!match.isHost && match.recommendationReasons[0] ? <p className="mt-2 text-xs leading-5 text-[var(--tm-action-primary)]">{match.recommendationReasons[0].label}</p> : null}
  </Link>;
}

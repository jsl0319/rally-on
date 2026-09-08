import Link from "next/link";
import { Clock, MapPin } from "@phosphor-icons/react/dist/ssr";
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
};

export function MatchCard({ match, returnTo = "/" }: { match: MatchCardData; returnTo?: string }) {
  const date = matchSchedule(match.startsAt, match.endsAt);
  const region = match.court.address?.split(" ").slice(0, 3).join(" ");
  const image = displayCourtImage(match.court);
  return <Link className="group block overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-[0_4px_20px_rgba(30,42,64,0.04)] transition hover:border-blue-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600" href={`/matches/${match.id}?returnTo=${encodeURIComponent(returnTo)}`}>
    <div className="flex gap-3 p-3 sm:gap-4">
      <CourtMedia alt={image.sourceLabel === "견본 이미지" ? "실제 장소와 다른 테니스장 견본 사진" : `${match.court.name ?? "코트"} 사진`} className="w-[88px] shrink-0 self-stretch min-[390px]:w-[100px] sm:w-[116px]" fallbackLabel={match.court.name ? "코트 사진 없음" : "코트 미정"} image={image} />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5"><MatchBadge tone={match.remainingSpots > 0 ? "blue" : "neutral"}>{match.statusLabel}</MatchBadge>{match.gameType ? <MatchBadge>{match.gameType.label}</MatchBadge> : null}{match.isHost ? <MatchBadge>내 매칭</MatchBadge> : null}{match.beginnerWelcome ? <MatchBadge tone="green">초보자 환영</MatchBadge> : null}</div>
        {region ? <p className="mb-1 flex items-center gap-1 text-[11px] text-slate-500"><MapPin size={13} className="shrink-0" aria-hidden /><span className="truncate">{region}</span></p> : null}
        <h2 className="line-clamp-2 text-[15px] font-bold leading-[1.45] tracking-tight sm:text-lg">{match.court.name ?? "코트 미정"}</h2>
        <p className="mt-2 flex items-start gap-1.5 text-xs font-medium leading-5 text-slate-600"><Clock size={14} className="mt-0.5 shrink-0" aria-hidden /><span className="flex flex-wrap gap-x-1.5 tabular-nums"><span>{date.day}</span><span>{date.time}</span></span></p>
        <div className="mt-1.5 flex flex-wrap gap-1">{match.playPurposes.map((purpose) => <PlayPurposeBadge key={purpose.code} purpose={purpose} />)}</div>
      </div>
    </div>
    <div className="border-t border-slate-100 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-medium text-slate-500">{match.recruitment ? `남자 ${match.recruitment.maleRemaining} · 여자 ${match.recruitment.femaleRemaining}명 남음` : `${match.remainingSpots}자리 남음`}</span><span className="font-bold text-slate-800">{match.estimatedFeePerPersonKrw === null ? "비용 미정" : `${match.court.source === "EXTERNAL_RESERVED" ? "참가비" : "1인 약"} ${match.estimatedFeePerPersonKrw.toLocaleString("ko-KR")}원`}</span></div>
      {match.recommendationReasons[0] ? <p className="mt-1.5 text-[11px] leading-4 text-blue-700">{match.recommendationReasons[0].label}</p> : null}
    </div>
  </Link>;
}

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
  return <Link className="group block overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-[0_4px_20px_rgba(30,42,64,0.04)] transition hover:border-blue-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600" href={`/matches/${match.id}?returnTo=${encodeURIComponent(returnTo)}`}>
    <div className="flex gap-3 p-3 sm:gap-4">
      <CourtMedia alt={image.sourceLabel === "견본 이미지" ? "실제 장소와 다른 테니스장 견본 사진" : `${match.court.name ?? "코트"} 사진`} className="w-[88px] shrink-0 self-stretch min-[390px]:w-[100px] sm:w-[116px]" fallbackLabel={match.court.name ? "코트 사진 없음" : "코트 미정"} image={image} />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-start justify-between gap-2"><div className="flex flex-wrap gap-1.5"><MatchBadge tone={match.statusLabel === "모집 중" ? "blue" : "neutral"}>{match.statusLabel}</MatchBadge>{match.beginnerWelcome ? <MatchBadge tone="green">초보자 환영</MatchBadge> : null}</div>{match.isHost ? <span className="inline-flex shrink-0 items-center gap-1 py-1 text-[10px] font-medium text-slate-500"><PencilSimple size={12} aria-hidden />내가 개설</span> : null}</div>
        {region ? <p className="mb-1 flex items-center gap-1 text-[11px] text-slate-500"><MapPin size={13} className="shrink-0" aria-hidden /><span className="truncate">{region}</span></p> : null}
        <h2 className="line-clamp-2 text-[15px] font-bold leading-[1.45] tracking-tight sm:text-lg">{match.court.name ?? "코트 미정"}</h2>
        <p className="mt-2 flex items-start gap-1.5 text-xs font-medium leading-5 text-slate-600"><Clock size={14} className="mt-0.5 shrink-0" aria-hidden /><span className="flex flex-wrap gap-x-1.5 tabular-nums"><span>{date.day}</span><span>{date.time}</span></span></p>
        <div className="mt-1.5 flex flex-wrap gap-1">{match.gameType ? <MatchBadge>{match.gameType.label}</MatchBadge> : null}{match.playPurposes.map((purpose) => <PlayPurposeBadge key={purpose.code} purpose={purpose} />)}</div>
      </div>
    </div>
    <HostLine introduction={match.introduction ?? null} isHost={match.isHost} host={match.host ?? null} />
    <div className="border-t border-slate-100 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-bold ${match.statusLabel === "모집 중" && match.remainingSpots > 0 ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}><Users size={15} weight="bold" aria-hidden />{match.statusLabel !== "모집 중" ? match.statusLabel : match.recruitment ? `남 ${match.recruitment.maleRemaining}명 · 여 ${match.recruitment.femaleRemaining}명 남음` : `남은 자리 ${match.remainingSpots}명`}</span><span className="font-bold text-slate-800">{match.estimatedFeePerPersonKrw === null ? "비용 미정" : `${match.court.source === "EXTERNAL_RESERVED" ? "참가비" : "1인 약"} ${match.estimatedFeePerPersonKrw.toLocaleString("ko-KR")}원`}</span></div>
      {!match.isHost && match.recommendationReasons[0] ? <p className="mt-1.5 text-[11px] leading-4 text-blue-700">{match.recommendationReasons[0].label}</p> : null}
    </div>
  </Link>;
}

/**
 * 누가 부르는 매칭인지, 그 사람이 뭐라고 썼는지 보여 준다.
 *
 * 소개글이 없을 때 랠리 수준으로 채워 봤더니 아래 추천 이유("랠리 수준이 비슷해요")와
 * 같은 말을 두 번 하게 됐다. 모집자의 말이 없으면 그 줄은 비워 두고 추천 이유에 맡긴다.
 */
function HostLine({ host, introduction, isHost }: { host: MatchCardData["host"]; introduction: string | null; isHost: boolean }) {
  if (!host) return null;
  return <div className="border-t border-slate-100 px-3 py-2.5">
    <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs">
      <span className="font-bold text-slate-800">{isHost ? "내 매칭" : host.nickname}</span>
      {host.experienceLabel ? <span className="text-slate-500">테니스 {host.experienceLabel}</span> : null}
    </p>
    {introduction ? <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-slate-600">{introduction}</p> : null}
  </div>;
}

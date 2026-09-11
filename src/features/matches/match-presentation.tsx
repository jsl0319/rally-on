import type { ReactNode } from "react";

import { matchScheduleParts } from "@/matches/schedule";
import type { CourtImageView } from "./court-media";

const courtSamples = ["aerial", "blue-stadium", "clay", "indoor", "blue-outdoor"] as const;

export function displayCourtImage(court: { source?: string; name: string | null; address?: string | null; image: CourtImageView }): CourtImageView {
  if (court.source !== "EXTERNAL_RESERVED") return court.image;
  const key = `${court.name ?? ""}|${court.address ?? ""}`;
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return { url: `/images/court-samples/${courtSamples[hash % courtSamples.length]}.jpg`, sourceLabel: "견본 이미지", fallback: "TENNIS_COURT_ILLUSTRATION" };
}

export function matchSchedule(startsAt: string, endsAt: string) {
  return matchScheduleParts(startsAt, endsAt);
}

export function MatchBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "blue" | "green" | "violet" | "amber" | "rose" }) {
  const colors = { neutral: "bg-slate-100 text-slate-600", blue: "bg-blue-50 text-blue-700", green: "bg-emerald-50 text-emerald-700", violet: "bg-violet-50 text-violet-700", amber: "bg-amber-50 text-amber-800", rose: "bg-rose-50 text-rose-700" };
  return <span className={`inline-flex items-center rounded-lg px-2 py-1 text-[11px] font-semibold leading-4 ${colors[tone]}`}>{children}</span>;
}

export function PlayPurposeBadge({ purpose }: { purpose: { code: string; label: string } }) {
  const tones = { CASUAL_HIT: "green", RALLY_PRACTICE: "blue", STROKE_PRACTICE: "violet", GAME_INTRO: "amber", GAME: "rose" } as const;
  return <MatchBadge tone={tones[purpose.code as keyof typeof tones] ?? "neutral"}>{purpose.label}</MatchBadge>;
}

import type { CourtImageView } from "@/features/matches/court-media";

export type PublicCourtSlot = {
  id: string;
  status: "AVAILABLE" | "ALLOCATED" | "ENDED" | "BLOCKED" | "CANCELLED";
  statusLabel: string;
  statusChangedAt: string;
  startsAt: string;
  endsAt: string;
  guestFeeKrw: number;
  maxParticipantCount: number;
  minParticipantCount: number;
  gameType: { code: string; label: string } | null;
  genderCapacity: { male: number; female: number } | null;
  approvalMode: "AUTO" | "OPERATOR";
  usageNote: string | null;
  durationMinutes: number;
  court: {
    name: string;
    address: string;
    courtNumber: string;
    region: { code: string; name: string };
    image: CourtImageView;
  };
  session: {
    matchId: string;
    status: string;
    statusLabel: string;
    title: string;
    hostNickname: string;
    recruitCount: number;
    acceptedCount: number;
    remainingSpots: number;
    beginnerWelcome: boolean;
    playPurposes: Array<{ code: string; label: string }>;
  } | null;
  availableAction: "APPLY" | "VIEW_SESSION" | "READ_ONLY";
};

export function formatPartnerSchedule(startsAt: string, endsAt: string) {
  const date = new Date(startsAt);
  const end = new Date(endsAt);
  const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  });
  const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Seoul",
  });
  return `${dateFormatter.format(date)} · ${timeFormatter.format(date)}–${timeFormatter.format(end)}`;
}

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours}시간 ${rest}분`;
  if (hours) return `${hours}시간`;
  return `${rest}분`;
}

/** 모집 중인 세션 카드의 남은 자리 문구. 마감·취소는 세션 상태 문구를 그대로 쓴다. */
export function formatSessionCapacity(session: NonNullable<PublicCourtSlot["session"]>) {
  if (session.status !== "OPEN") return session.statusLabel;
  return session.remainingSpots > 0 ? `${session.remainingSpots}명 더 함께할 수 있어요` : "자리가 다 찼어요";
}

export function formatStatusChangedAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export function apiMessage(body: unknown, fallback: string) {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error = body.error;
    if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") return error.message;
  }
  return fallback;
}

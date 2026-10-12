"use client";

import { ActionArea, ActionAreaButton, Modal, ModalClose, ModalContainer, ModalNavigation } from "@wanteddev/wds";
import Link from "next/link";
import { CalendarBlank, CaretDown, MapPin, Users, UserCircle } from "@phosphor-icons/react";
import { displayCourtImage, matchSchedule, MatchBadge, PlayPurposeBadge } from "./match-presentation";
import { use, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { CourtDirectionsButton } from "./court-directions-button";
import { BackButton } from "@/components/navigation/back-button";
import { CourtRallyLoader } from "@/components/feedback/court-rally-loader";
import { Button } from "@/components/ui/button";
import { getSafeReturnTo } from "@/navigation/return-to";

import { CourtMedia, type CourtImageView } from "./court-media";

type ProfileSummary = {
  experienceLabel: string;
  rallyLevelLabel: string;
  gameExperienceLabel: string;
  playPurposes: Array<{ code: string; label: string }>;
};

export type Detail = {
  id: string;
  title: string;
  recruitment: { maleCount: number; femaleCount: number; maleRemaining: number; femaleRemaining: number } | null;
  gameType: { code: string; label: string } | null;
  settlementAccount: { bank: string; accountNumber: string; accountHolder: string } | null;
  statusLabel: string;
  startsAt: string;
  endsAt: string;
  court: { source: "EXTERNAL_RESERVED" | "COURT_TBD" | "PARTNER_COURT"; sourceLabel: string; participationNote: string | null; usageNote: string | null; name: string | null; address: string | null; courtNumber: string | null; image: CourtImageView };
  playPurposes: Array<{ code: string; label: string }>;
  beginnerWelcome: boolean;
  remainingSpots: number;
  estimatedFeePerPersonKrw: number | null;
  totalCourtFeeKrw: number | null;
  additionalCostNote: string | null;
  introduction: string | null;
  partnerPreferenceLabel: string;
  recommendationReasons: Array<{ code: string; label: string }>;
  host: { nickname: string; tennisProfile: ProfileSummary | null };
  contact: { conversationStatus: "OPEN" | "READ_ONLY" | "ARCHIVED" | "NOT_CREATED"; href: string | null; label: string } | null;
  supplyNotice: { code: "COURT_SUPPLY_WITHDRAWN"; message: string; occurredAt: string; delivery: "IN_APP" } | null;
  viewer: { relation: "NONE" | "HOST" | "APPLICANT"; canApply: boolean; applyBlockedReason: string | null; applicationId: string | null; applicationStatus: "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "CANCELLED" | null; tennisProfile: ProfileSummary | null };
};

function blockedMessage(reason: string | null) {
  return ({ OWN_MATCH: "내가 만든 매칭이에요.", ALREADY_APPLIED: "이미 신청한 매칭이에요.", MATCH_NOT_OPEN: "모집이 마감됐어요.", MATCH_STARTED: "이미 시작된 일정이에요.", NO_REMAINING_SPOTS: "남은 자리가 없어요.", PROFILE_GENDER_REQUIRED: "프로필에서 성별을 입력한 뒤 신청해 주세요.", GENDER_QUOTA_FULL: "해당 성별의 모집 인원이 모두 찼어요." } as Record<string, string>)[reason ?? ""] ?? "신청 가능 여부를 확인해 주세요.";
}

function apiMessage(body: unknown, fallback: string) {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "message" in body.error && typeof body.error.message === "string") return body.error.message;
  return fallback;
}

export function M3MatchDetail({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = use(params);
  const searchParams = useSearchParams();
  const returnTo = getSafeReturnTo(searchParams.get("returnTo"));
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [applyError, setApplyError] = useState("");
  const [alreadyApplied, setAlreadyApplied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetch(`/api/v1/matches/${encodeURIComponent(matchId)}`, { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(apiMessage(body, "매칭을 불러오지 못했어요."));
      setDetail(body as Detail);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "매칭을 불러오지 못했어요."); }
  }, [matchId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const openSheet = () => {
    setApplyError("");
    setAlreadyApplied(false);
    setSheetOpen(true);
  };

  const submitApplication = async () => {
    setIsSubmitting(true);
    setApplyError("");
    setAlreadyApplied(false);
    try {
      const response = await fetch(`/api/v1/matches/${encodeURIComponent(matchId)}/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const code = typeof body === "object" && body !== null && "error" in body && typeof body.error === "object" && body.error !== null && "code" in body.error && typeof body.error.code === "string" ? body.error.code : "";
        if (code === "APPLICATION_ALREADY_EXISTS") setAlreadyApplied(true);
        throw new Error(apiMessage(body, "신청을 보내지 못했어요."));
      }
      setSheetOpen(false);
      setSubmitted(true);
    } catch (caught) {
      setApplyError(caught instanceof Error ? caught.message : "신청을 보내지 못했어요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!detail) return <main className="grid min-h-app place-items-center bg-[var(--tm-bg-page)] px-5 text-center">{error ? <div><p>{error}</p><Button className="mt-4" onClick={() => void load()}>다시 불러오기</Button><Link className="ml-3 text-sm underline" href="/">홈으로</Link></div> : <CourtRallyLoader label="매칭 정보를 준비하고 있어요." />}</main>;

  if (submitted) return <ApplicationSuccess title={detail.court.name ?? "코트 미정"} />;

  const fee = detail.estimatedFeePerPersonKrw;
  return <main className="min-h-app bg-[var(--tm-bg-page)] pb-32 text-[var(--tm-text-primary)]">
    <MatchDetailArticle detail={detail} returnTo={returnTo} />
    <div aria-label="매칭 참여" className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--tm-border-subtle)] bg-white px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3"><div className="mx-auto flex max-w-[520px] items-center gap-5">{detail.viewer.canApply && fee !== null ? <div className="shrink-0"><p className="text-[11px] text-[var(--tm-text-secondary)]">1인 참가비</p><p className="mt-0.5 text-xl font-bold tracking-tight tabular-nums">{fee.toLocaleString("ko-KR")}원</p></div> : null}<div className="min-w-0 flex-1"><DetailAction detail={detail} onApply={openSheet} /></div></div></div>
    {sheetOpen ? <ApplicationSheet detail={detail} message={message} applyError={applyError} alreadyApplied={alreadyApplied} isSubmitting={isSubmitting} onClose={() => setSheetOpen(false)} onMessageChange={setMessage} onSubmit={() => void submitApplication()} /> : null}
  </main>;
}

export function MatchDetailArticle({ detail, returnTo }: { detail: Detail; returnTo: string }) {
  const hostProfile = detail.host.tennisProfile;
  const courtImage = displayCourtImage(detail.court);
  const date = matchSchedule(detail.startsAt, detail.endsAt);
  const fee = detail.estimatedFeePerPersonKrw;
  const remaining = detail.recruitment
    ? `남자 ${detail.recruitment.maleRemaining}명 · 여자 ${detail.recruitment.femaleRemaining}명`
    : `${detail.remainingSpots}명`;
  return <article className="mx-auto max-w-[560px] bg-white">
      <div className="rally-sticky-header grid h-14 grid-cols-[44px_1fr_44px] items-center px-3">
        <BackButton fallbackPath={returnTo} />
        <p className="text-center text-sm font-semibold">매칭 상세</p>
      </div>
      <CourtMedia alt={courtImage.sourceLabel === "견본 이미지" ? "실제 장소와 다른 테니스장 견본 사진" : `${detail.court.name ?? "코트"} 사진`} className="aspect-[2.2/1] w-full !rounded-none" fallbackLabel={detail.court.source === "COURT_TBD" ? "코트 미정" : "코트 사진 없음"} image={courtImage} priority />
      <header className="px-5 py-5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <MatchBadge tone={detail.statusLabel === "모집 중" ? "green" : "neutral"}>{detail.statusLabel}</MatchBadge>
          {detail.gameType ? <span className="font-medium text-[var(--tm-text-secondary)]">{detail.gameType.label}</span> : null}
          {detail.beginnerWelcome ? <span className="font-medium text-[var(--tm-action-primary)]">초보자 환영</span> : null}
        </div>
        <h1 className="mt-2 break-words text-[26px] font-bold leading-[34px] tracking-tight">{detail.court.name ?? "코트 미정"}</h1>
        {detail.court.address ? <p className="mt-1 break-words text-[13px] leading-5 text-[var(--tm-text-secondary)]">{detail.court.address}</p> : null}
        <dl className="mt-5 space-y-3 border-y border-[var(--tm-border-subtle)] py-4">
          <div className="flex gap-3">
            <dt><span className="sr-only">일시</span><CalendarBlank size={21} className="mt-0.5 text-[var(--tm-text-secondary)]" aria-hidden /></dt>
            <dd><p className="text-sm font-semibold tabular-nums">{date.day}</p><p className="mt-1 text-[17px] font-semibold tracking-tight tabular-nums">{date.time}</p></dd>
          </div>
          <div className="flex items-start gap-3">
            <dt><span className="sr-only">남은 자리</span><Users size={21} className="text-[var(--tm-text-secondary)]" aria-hidden /></dt>
            <dd className="text-[13px] font-semibold leading-5">{remaining} 남음</dd>
          </div>
        </dl>
        <div aria-label="참가비" className="pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm text-[var(--tm-text-secondary)]">1인 참가비</p>
            <p className="text-[26px] font-bold leading-8 tracking-tight tabular-nums">{fee === null ? "미정" : <>{fee.toLocaleString("ko-KR")}<span className="ml-0.5 text-base font-semibold">원</span></>}</p>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--tm-text-secondary)]">비용은 참가자끼리 별도로 정산해요.</p>
          {detail.additionalCostNote ? <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-5 text-[var(--tm-text-muted)]">{detail.additionalCostNote}</p> : null}
        </div>
      </header>
      {detail.supplyNotice ? <div role="status" className="mx-5 mb-5 rounded-xl bg-[var(--tm-status-error-bg)] p-4 text-sm leading-6 text-[var(--tm-status-error-text)]"><p className="font-semibold">코트 매칭 안내</p><p>{detail.supplyNotice.message}</p></div> : null}
      <Section title="함께하고 싶은 플레이">
        <div className="flex flex-wrap gap-1.5">{detail.playPurposes.map((purpose) => <PlayPurposeBadge key={purpose.code} purpose={purpose} />)}</div>
        <p className="mt-3 text-sm leading-6 text-[var(--tm-text-muted)]">{detail.partnerPreferenceLabel}</p>
        {detail.introduction ? <div className="mt-4"><h3 className="text-[13px] font-semibold">매칭 소개글</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--tm-text-muted)]">{detail.introduction}</p></div> : null}
      </Section>
      <Section title="모집자 정보">
        <div className="flex items-center gap-3">
          <UserCircle className="shrink-0 text-[var(--tm-border-strong)]" size={48} weight="fill" aria-hidden />
          <div className="min-w-0"><p className="break-words font-semibold">{detail.host.nickname}</p>{hostProfile ? <p className="mt-1 text-[13px] text-[var(--tm-text-secondary)]">테니스 구력 {hostProfile.experienceLabel}</p> : null}</div>
        </div>
        {hostProfile ? <dl className="mt-4 space-y-2.5 text-[13px] leading-5">
          <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3"><dt className="text-[var(--tm-text-secondary)]">랠리 수준</dt><dd className="break-words font-medium">{hostProfile.rallyLevelLabel}</dd></div>
          <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3"><dt className="text-[var(--tm-text-secondary)]">게임 경험</dt><dd className="break-words font-medium">{hostProfile.gameExperienceLabel}</dd></div>
        </dl> : <p className="mt-3 text-[13px] text-[var(--tm-text-secondary)]">등록된 테니스 프로필이 없어요.</p>}
        {detail.recommendationReasons.length > 0 ? <details className="group mt-4 border-t border-[var(--tm-border-subtle)] pt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-medium text-[var(--tm-action-primary)] [&::-webkit-details-marker]:hidden">나와 잘 맞는 점<CaretDown size={16} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden /></summary>
          <ul className="space-y-1 pb-1 text-[13px] leading-6 text-[var(--tm-text-secondary)]">{detail.recommendationReasons.map((reason) => <li key={reason.code}>{reason.label}</li>)}</ul>
        </details> : null}
      </Section>
      <Section title="찾아오는 길">
        {detail.court.source === "COURT_TBD" ? <p className="text-sm leading-6 text-[var(--tm-text-secondary)]">아직 정해진 코트가 없어요. 기존 참가자와 함께 확인해 주세요.</p> : <>
          <p className="break-words text-sm font-semibold leading-6">{detail.court.name}{detail.court.courtNumber ? <> · {detail.court.courtNumber}</> : null}</p>
          <p className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-5 text-[var(--tm-text-secondary)]"><MapPin size={16} className="mt-0.5 shrink-0" aria-hidden /><span className="min-w-0 break-words">{detail.court.address}</span></p>
        </>}
        {detail.court.source !== "COURT_TBD" && detail.court.name && detail.court.address ? <CourtDirectionsButton matchId={detail.id} name={detail.court.name} address={detail.court.address} /> : null}
        {detail.court.usageNote ? <div className="mt-4"><h3 className="text-[13px] font-semibold">현장 이용 안내</h3><p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-6 text-[var(--tm-text-muted)]">{detail.court.usageNote}</p></div> : null}
        {detail.court.participationNote ? <p className="mt-3 text-xs leading-5 text-[var(--tm-text-secondary)]">{detail.court.participationNote}</p> : null}
      </Section>
      {detail.settlementAccount ? <Section title="정산 정보"><div className="rounded-xl border border-[var(--tm-border-default)] p-4"><p className="text-[13px] text-[var(--tm-text-secondary)]">{detail.settlementAccount.bank}</p><p className="mt-1.5 break-all font-semibold tabular-nums">{detail.settlementAccount.accountNumber}</p><p className="mt-1.5 text-[13px]">예금주 {detail.settlementAccount.accountHolder}</p></div><p className="mt-3 text-xs leading-5 text-[var(--tm-text-secondary)]">모집자와 수락된 참가자에게만 보이는 정보예요. Rally On은 계좌 검증이나 입금 확인을 하지 않아요.</p></Section> : null}
    </article>;
}

function DetailAction({ detail, onApply }: { detail: Detail; onApply: () => void }) {
  if (detail.viewer.applyBlockedReason === "PROFILE_GENDER_REQUIRED") return <Button as={Link} fullWidth href={`/my/profile?returnTo=${encodeURIComponent(`/matches/${detail.id}`)}`}>프로필 성별 입력하기</Button>;
  if (detail.viewer.canApply) return <Button fullWidth onClick={onApply}>{detail.viewer.applicationStatus === "WITHDRAWN" ? "다시 신청하기" : "같이 치기"}</Button>;
  if ((detail.viewer.relation === "HOST" || detail.viewer.applicationStatus === "ACCEPTED") && detail.contact) return <ContactAction contact={detail.contact} />;
  if (detail.viewer.relation === "APPLICANT") return <Button as={Link} fullWidth href="/activity/sent" variant="secondary">{detail.viewer.applicationStatus === "PENDING" ? "검토 중 · 신청 내역 보기" : "신청 내역 보기"}</Button>;
  return <p className="py-4 text-center text-sm font-medium text-[var(--tm-text-secondary)]">{blockedMessage(detail.viewer.applyBlockedReason)}</p>;
}

function ContactAction({ contact }: { contact: NonNullable<Detail["contact"]> }) {
  if (!contact.href) return <p className="py-4 text-center text-sm font-medium text-[var(--tm-text-secondary)]">참가자가 수락되면 채팅방이 열려요.</p>;
  return <Button as={Link} fullWidth href={contact.href}>{contact.label}</Button>;
}

export function ApplicationSheet({ detail, message, applyError, alreadyApplied, isSubmitting, onClose, onMessageChange, onSubmit }: { detail: Detail; message: string; applyError: string; alreadyApplied: boolean; isSubmitting: boolean; onClose: () => void; onMessageChange: (value: string) => void; onSubmit: () => void }) {
  const date = matchSchedule(detail.startsAt, detail.endsAt);
  return <Modal open onOpenChange={(next) => { if (!next && !isSubmitting) onClose(); }}>
    <ModalContainer variant="bottom" size="large" sx={{ width: "100%", maxWidth: 560, maxHeight: "calc(100dvh - var(--rally-safe-top) - 12px)", padding: 0, borderRadius: "24px 24px 0 0", overflow: "hidden" }}>
      <ModalNavigation trailingContent={<ModalClose aria-label="신청 창 닫기" disabled={isSubmitting} />}>
        같이 치기
      </ModalNavigation>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-4">
          <div className="pb-2 pt-1">
            <p className="break-words text-lg font-bold leading-7 tracking-tight">{detail.court.name ?? "코트 미정"}</p>
            <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-[var(--tm-text-muted)]"><CalendarBlank size={18} className="mt-0.5 shrink-0" aria-hidden /><span className="flex flex-wrap gap-x-2 tabular-nums"><span>{date.day}</span><span>{date.time}</span></span></p>
            {detail.court.address ? <p className="mt-1.5 flex items-start gap-2 text-sm leading-6 text-[var(--tm-text-secondary)]"><MapPin size={18} className="mt-0.5 shrink-0" aria-hidden /><span className="break-words">{detail.court.address}</span></p> : null}
            <div className="mt-4 flex items-center justify-between gap-4 border-t border-[var(--tm-border-subtle)] pt-4 text-sm">
              <span className="text-[var(--tm-text-secondary)]">1인 참가비 <span className="text-xs">· 별도 정산</span></span>
              <span className="font-semibold tabular-nums">{detail.estimatedFeePerPersonKrw === null ? "미정" : `${detail.estimatedFeePerPersonKrw.toLocaleString("ko-KR")}원`}</span>
            </div>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--tm-text-secondary)]">모집자가 신청을 수락하면 함께 칠 수 있어요.</p>
          <label className="mt-6 block text-sm font-semibold" htmlFor="application-message">모집자에게 보낼 자기소개 <span className="ml-1 text-xs font-normal text-[var(--tm-text-secondary)]">선택</span></label>
          <textarea className="rally-input mt-3 block min-h-32 w-full resize-y rounded-xl border border-[var(--tm-border-default)] bg-[var(--tm-bg-subtle-muted)] p-4 text-sm leading-6 outline-none placeholder:text-[var(--tm-text-secondary)] focus:border-[var(--tm-action-primary)] focus:ring-2 focus:ring-[var(--tm-bg-subtle)] disabled:opacity-60" id="application-message" aria-describedby="application-message-count" autoComplete="off" disabled={isSubmitting} maxLength={200} onChange={(event) => onMessageChange(event.target.value)} placeholder="테니스 경험이나 함께하고 싶은 플레이를 적어 주세요." value={message} />
          <p id="application-message-count" className="mt-2 text-right text-xs tabular-nums text-[var(--tm-text-secondary)]">{message.length}/200</p>
          {applyError ? <div role="alert" className="mt-3 rounded-2xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm text-[var(--tm-status-error-text)]"><p>{applyError}</p>{alreadyApplied ? <Link className="mt-2 inline-block font-semibold underline" href="/activity/sent">신청 내역 보기</Link> : null}</div> : null}
      </div>
      <ActionArea variant="neutral">
        <ActionAreaButton sx={{ borderRadius: 14, minHeight: 48 }} buttonColor="assistive" disabled={isSubmitting} onClick={onClose} variant="alternative">취소</ActionAreaButton>
        <ActionAreaButton sx={{ borderRadius: 14, minHeight: 48 }} disabled={isSubmitting} loading={isSubmitting} onClick={onSubmit} variant="main">신청 보내기</ActionAreaButton>
      </ActionArea>
    </ModalContainer>
  </Modal>;
}

export function ApplicationSuccess({ title }: { title: string }) {
  return <main className="grid min-h-app place-items-center bg-[var(--tm-bg-page)] px-5 text-[var(--tm-text-primary)]"><section className="w-full max-w-[390px] rounded-[20px] bg-white p-6 text-center shadow-[var(--tm-shadow-card)]"><p className="text-4xl">🎾</p><h1 className="mt-4 text-2xl font-bold">신청을 보냈어요</h1><p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]"><strong className="font-semibold text-[var(--tm-text-primary)]">{title}</strong><br />모집자가 프로필을 확인하면 결과를 알려드릴게요.</p><Button as={Link} className="mt-6" fullWidth href="/activity/sent">신청 내역 보기</Button></section></main>;
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return <section className="mx-5 border-t border-[var(--tm-border-subtle)] py-5"><h2 className="text-[17px] font-bold tracking-tight">{title}</h2><div className="mt-3">{children}</div></section>;
}

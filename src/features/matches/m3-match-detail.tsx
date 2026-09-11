"use client";

import { ActionArea, ActionAreaButton, Modal, ModalClose, ModalContainer, ModalContent, ModalContentItem, ModalNavigation } from "@wanteddev/wds";
import Link from "next/link";
import { CalendarBlank, MapPin, Users, TennisBall, Hash, UserCircle } from "@phosphor-icons/react";
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

type Detail = {
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

  if (!detail) return <main className="grid min-h-svh place-items-center bg-[var(--tm-bg-page)] px-5 text-center">{error ? <div><p>{error}</p><Button className="mt-4" onClick={() => void load()}>다시 불러오기</Button><Link className="ml-3 text-sm underline" href="/">홈으로</Link></div> : <CourtRallyLoader label="매칭 정보를 준비하고 있어요." />}</main>;

  if (submitted) return <ApplicationSuccess title={detail.court.name ?? "코트 미정"} />;

  const hostProfile = detail.host.tennisProfile;
  const courtImage = displayCourtImage(detail.court);
  const date = matchSchedule(detail.startsAt, detail.endsAt);
  const fee = detail.estimatedFeePerPersonKrw;
  return <main className="min-h-svh bg-slate-50 pb-32 text-[var(--tm-text-primary)]">
    <article className="mx-auto max-w-[560px] overflow-hidden bg-white sm:shadow-sm">
      <div className="relative">
        <CourtMedia alt={courtImage.sourceLabel === "견본 이미지" ? "실제 장소와 다른 테니스장 견본 사진" : `${detail.court.name ?? "코트"} 사진`} className="aspect-[4/3] w-full !rounded-none sm:aspect-[7/4]" fallbackLabel={detail.court.source === "COURT_TBD" ? "코트 미정" : "코트 사진 없음"} image={courtImage} priority />
        <div className="absolute left-5 top-5 flex size-11 items-center justify-center rounded-full bg-white/95 shadow-sm backdrop-blur"><BackButton fallbackPath={returnTo} /></div>
      </div>
      <header className="px-5 py-6 sm:px-7">
        <div className="flex flex-wrap gap-2"><MatchBadge tone="blue">{detail.statusLabel}</MatchBadge>{detail.gameType ? <MatchBadge>{detail.gameType.label}</MatchBadge> : null}{detail.beginnerWelcome ? <MatchBadge tone="green">초보자 환영</MatchBadge> : null}</div>
        <h1 className="mt-4 break-words text-[26px] font-bold leading-snug tracking-tight">{detail.court.name ?? "코트 미정"}</h1>
        {detail.court.address ? <p className="mt-2 flex items-start gap-1.5 text-sm leading-6 text-slate-500"><MapPin size={18} className="mt-0.5 shrink-0" aria-hidden />{detail.court.address}</p> : null}
        {detail.introduction ? <div className="mt-5"><h2 className="text-xs font-semibold text-slate-500">매칭 소개글</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{detail.introduction}</p></div> : null}
      </header>
      {detail.supplyNotice ? <div className="mx-5 mb-6 rounded-2xl bg-[var(--tm-status-error-bg)] p-4 text-sm leading-6 text-[var(--tm-status-error-text)]"><p className="font-bold">코트 매칭 안내</p><p>{detail.supplyNotice.message}</p></div> : null}
      <Section title="기본 정보"><dl className="divide-y divide-slate-100">
        <InfoRow icon={<CalendarBlank size={20} />} label="일시"><span className="inline-flex flex-wrap justify-end gap-x-2 tabular-nums"><span>{date.day}</span><span>{date.time}</span></span></InfoRow>
        {detail.gameType ? <InfoRow icon={<TennisBall size={20} />} label="게임 유형">{detail.gameType.label}</InfoRow> : null}
        <InfoRow icon={<Users size={20} />} label="남은 자리">{detail.recruitment ? `남자 ${detail.recruitment.maleRemaining}명 · 여자 ${detail.recruitment.femaleRemaining}명` : `${detail.remainingSpots}명`}</InfoRow>
        {detail.court.courtNumber ? <InfoRow icon={<Hash size={20} />} label="코트 번호">{detail.court.courtNumber}</InfoRow> : null}
      </dl></Section>
      {detail.recommendationReasons.length > 0 ? <Section title="이런 점이 잘 맞아요"><ul className="space-y-2 rounded-2xl bg-blue-50 p-4 text-sm leading-6 text-blue-700">{detail.recommendationReasons.map((reason) => <li key={reason.code}>{reason.label}</li>)}</ul></Section> : null}
      <Section title="함께하고 싶은 플레이"><div className="flex flex-wrap gap-2">{detail.playPurposes.map((purpose) => <PlayPurposeBadge key={purpose.code} purpose={purpose} />)}</div><p className="mt-3 text-sm leading-6 text-slate-500">{detail.partnerPreferenceLabel}</p></Section>
      <Section title="모집자 정보"><div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4"><UserCircle className="shrink-0 text-blue-200" size={52} weight="fill" aria-hidden /><div className="min-w-0"><p className="break-words font-bold">{detail.host.nickname}</p>{hostProfile ? <><p className="mt-1 text-xs leading-5 text-slate-500">구력 · {hostProfile.experienceLabel}</p><p className="mt-1 text-xs leading-5 text-slate-500">랠리 수준 · {hostProfile.rallyLevelLabel}</p><p className="mt-1 text-xs leading-5 text-slate-500">게임 경험 · {hostProfile.gameExperienceLabel}</p></> : null}</div></div></Section>
      <Section title="위치 정보">{detail.court.source === "COURT_TBD" ? <p className="text-sm leading-6 text-slate-500">아직 정해진 코트가 없어요. 기존 참가자와 함께 확인해 주세요.</p> : <div className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4"><MapPin className="mt-0.5 shrink-0 text-blue-600" size={22} aria-hidden /><div className="min-w-0"><p className="break-words text-sm font-semibold leading-6">{detail.court.name}</p><p className="mt-1 break-words text-sm leading-6 text-slate-500">{detail.court.address}</p></div></div>}{detail.court.usageNote ? <div className="mt-3 rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">현장 이용 안내</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{detail.court.usageNote}</p></div> : null}{detail.court.source !== "COURT_TBD" && detail.court.name && detail.court.address ? <CourtDirectionsButton matchId={detail.id} name={detail.court.name} address={detail.court.address} /> : null}{detail.court.participationNote ? <p className="mt-3 text-xs leading-6 text-blue-700">{detail.court.participationNote}</p> : null}</Section>
      <Section title="참가 비용"><dl><div className="flex items-center justify-between gap-4"><dt className="text-sm text-slate-500">게스트 참가비용</dt><dd className="text-xl font-bold tracking-tight">{fee === null ? "미정" : `${fee.toLocaleString("ko-KR")}원`}</dd></div></dl>{detail.additionalCostNote ? <p className="mt-3 text-sm leading-6 text-slate-500">{detail.additionalCostNote}</p> : null}<p className="mt-3 text-xs leading-5 text-slate-500">비용은 참가자끼리 별도로 정산해요.</p></Section>
      {detail.settlementAccount ? <Section title="정산 정보"><div className="rounded-2xl bg-slate-50 p-4"><p className="text-sm text-slate-500">{detail.settlementAccount.bank}</p><p className="mt-2 break-all font-semibold tabular-nums">{detail.settlementAccount.accountNumber}</p><p className="mt-2 text-sm">예금주 {detail.settlementAccount.accountHolder}</p></div><p className="mt-3 text-xs leading-6 text-slate-500">모집자와 수락된 참가자에게만 보이는 정보예요. Rally On은 계좌 검증이나 입금 확인을 하지 않아요.</p></Section> : null}
    </article>
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-100 bg-white/95 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-4 backdrop-blur"><div className="mx-auto flex max-w-[520px] items-center gap-5">{detail.viewer.canApply && fee !== null ? <div className="shrink-0"><p className="text-[11px] text-slate-500">게스트 참가비</p><p className="mt-1 text-lg font-bold tabular-nums">{fee.toLocaleString("ko-KR")}원</p></div> : null}<div className="min-w-0 flex-1"><DetailAction detail={detail} onApply={openSheet} /></div></div></div>
    {sheetOpen ? <ApplicationSheet detail={detail} message={message} applyError={applyError} alreadyApplied={alreadyApplied} isSubmitting={isSubmitting} onClose={() => setSheetOpen(false)} onMessageChange={setMessage} onSubmit={() => void submitApplication()} /> : null}
  </main>;
}

function InfoRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[104px_minmax(0,1fr)] items-start gap-3 py-4 text-sm leading-6"><dt className="flex items-center gap-2 text-slate-500"><span aria-hidden className="text-slate-400">{icon}</span>{label}</dt><dd className="break-words text-right font-semibold">{children}</dd></div>;
}

function DetailAction({ detail, onApply }: { detail: Detail; onApply: () => void }) {
  if (detail.viewer.applyBlockedReason === "PROFILE_GENDER_REQUIRED") return <Button as={Link} fullWidth href={`/my/profile?returnTo=${encodeURIComponent(`/matches/${detail.id}`)}`}>프로필 성별 입력하기</Button>;
  if (detail.viewer.canApply) return <Button fullWidth onClick={onApply}>같이 치기</Button>;
  if ((detail.viewer.relation === "HOST" || detail.viewer.applicationStatus === "ACCEPTED") && detail.contact) return <ContactAction contact={detail.contact} />;
  if (detail.viewer.relation === "APPLICANT") return <Button as={Link} fullWidth href="/activity/sent" variant="secondary">검토 중이에요 · 신청 내역 보기</Button>;
  return <p className="py-4 text-center text-sm font-medium text-[var(--tm-text-secondary)]">{blockedMessage(detail.viewer.applyBlockedReason)}</p>;
}

function ContactAction({ contact }: { contact: NonNullable<Detail["contact"]> }) {
  if (!contact.href) return <p className="py-4 text-center text-sm font-medium text-[var(--tm-text-secondary)]">참가자가 수락되면 채팅방이 열려요.</p>;
  return <Button as={Link} fullWidth href={contact.href}>{contact.label}</Button>;
}

function ApplicationSheet({ detail, message, applyError, alreadyApplied, isSubmitting, onClose, onMessageChange, onSubmit }: { detail: Detail; message: string; applyError: string; alreadyApplied: boolean; isSubmitting: boolean; onClose: () => void; onMessageChange: (value: string) => void; onSubmit: () => void }) {
  const date = matchSchedule(detail.startsAt, detail.endsAt);
  return <Modal open onOpenChange={(next) => { if (!next && !isSubmitting) onClose(); }}>
    <ModalContainer variant="bottom" size="large">
      <ModalNavigation trailingContent={<ModalClose aria-label="신청 창 닫기" disabled={isSubmitting} />}>
        같이 치기
      </ModalNavigation>
      <ModalContent>
        <ModalContentItem>
          <div className="pb-2 pt-1">
            <p className="break-words text-lg font-bold leading-7 tracking-tight">{detail.court.name ?? "코트 미정"}</p>
            <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-slate-600"><CalendarBlank size={18} className="mt-0.5 shrink-0" aria-hidden /><span className="flex flex-wrap gap-x-2 tabular-nums"><span>{date.day}</span><span>{date.time}</span></span></p>
            {detail.court.address ? <p className="mt-1.5 flex items-start gap-2 text-sm leading-6 text-slate-500"><MapPin size={18} className="mt-0.5 shrink-0" aria-hidden /><span className="break-words">{detail.court.address}</span></p> : null}
            <div className="mt-4 flex items-center justify-between gap-4 border-t border-slate-100 pt-4 text-sm">
              <span className="text-slate-500">참가비 <span className="text-xs">· 별도 정산</span></span>
              <span className="font-semibold tabular-nums">{detail.estimatedFeePerPersonKrw === null ? "미정" : `${detail.estimatedFeePerPersonKrw.toLocaleString("ko-KR")}원`}</span>
            </div>
          </div>
        </ModalContentItem>
        <ModalContentItem>
          <label className="block text-base font-semibold" htmlFor="application-message">모집자에게 보낼 자기소개 <span className="ml-1 text-sm font-normal text-slate-400">선택</span></label>
          <textarea className="mt-3 block min-h-40 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60" id="application-message" aria-describedby="application-message-count" autoComplete="off" disabled={isSubmitting} maxLength={200} onChange={(event) => onMessageChange(event.target.value)} placeholder="테니스 경험이나 함께하고 싶은 플레이를 간단히 적어 주세요." value={message} />
          <p id="application-message-count" className="mt-2 text-right text-xs tabular-nums text-slate-400">{message.length}/200</p>
          {applyError ? <div role="alert" className="mt-3 rounded-2xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm text-[var(--tm-status-error-text)]"><p>{applyError}</p>{alreadyApplied ? <Link className="mt-2 inline-block font-semibold underline" href="/activity/sent">신청 내역 보기</Link> : null}</div> : null}
        </ModalContentItem>
      </ModalContent>
      <ActionArea variant="neutral">
        <ActionAreaButton buttonColor="assistive" disabled={isSubmitting} onClick={onClose} variant="alternative">취소</ActionAreaButton>
        <ActionAreaButton disabled={isSubmitting} loading={isSubmitting} onClick={onSubmit} variant="main">신청 보내기</ActionAreaButton>
      </ActionArea>
    </ModalContainer>
  </Modal>;
}

function ApplicationSuccess({ title }: { title: string }) {
  return <main className="grid min-h-svh place-items-center bg-[var(--tm-bg-page)] px-5 text-[var(--tm-text-primary)]"><section className="w-full max-w-[390px] rounded-[28px] bg-white p-6 text-center shadow-[0_10px_40px_rgba(49,94,158,0.09)]"><p className="text-4xl">🎾</p><h1 className="mt-4 text-2xl font-bold">신청을 보냈어요</h1><p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]"><strong className="font-semibold text-[var(--tm-text-primary)]">{title}</strong><br />모집자가 프로필을 확인하면 결과를 알려드릴게요.</p><Button as={Link} className="mt-6" fullWidth href="/activity/sent">신청 내역 보기</Button></section></main>;
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return <section className="border-t-[8px] border-slate-50 px-5 py-6 sm:px-7"><h2 className="text-lg font-bold tracking-tight">{title}</h2><div className="mt-4">{children}</div></section>;
}

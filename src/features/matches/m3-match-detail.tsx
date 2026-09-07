"use client";

import { ActionArea, ActionAreaButton, Modal, ModalClose, ModalContainer, ModalContent, ModalContentItem, ModalHeading, ModalNavigation, ModalSummary } from "@wanteddev/wds";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

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
  court: { source: "EXTERNAL_RESERVED" | "COURT_TBD" | "PARTNER_COURT"; sourceLabel: string; participationNote: string | null; name: string | null; address: string | null; courtNumber: string | null; image: CourtImageView };
  playPurposes: Array<{ code: string; label: string }>;
  beginnerWelcome: boolean;
  remainingSpots: number;
  estimatedFeePerPersonKrw: number | null;
  estimatedTotalParticipants: number;
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

function schedule(startsAt: string, endsAt: string) {
  const formatter = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Seoul" });
  return `${formatter.format(new Date(startsAt))}–${new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Seoul" }).format(new Date(endsAt))}`;
}

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
  return <main className="min-h-svh bg-[var(--tm-bg-page)] px-5 pb-28 pt-6 text-[var(--tm-text-primary)]"><article className="mx-auto max-w-[560px]"><BackButton className="inline-flex size-11 items-center justify-center rounded-full text-xl" fallbackPath={returnTo} /><CourtMedia alt={detail.court.name ? `${detail.court.name} 코트 사진` : "코트 정보"} className="mt-4 aspect-[7/4] w-full" fallbackLabel={detail.court.source === "COURT_TBD" ? "코트 미정" : "코트 사진 없음"} image={detail.court.image} priority /><div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-[var(--tm-bg-subtle)] px-2.5 py-1 text-[var(--tm-action-primary)]">{detail.statusLabel}</span>{detail.beginnerWelcome ? <span className="rounded-full bg-[var(--tm-bg-highlight)] px-2.5 py-1 text-[var(--tm-tennis-ball-muted)]">🌱 초보자 환영</span> : null}</div><h1 className="mt-4 text-2xl font-bold leading-snug">{detail.court.name ?? "코트 미정"}</h1><p className="mt-3 text-sm text-[var(--tm-text-muted)]">🗓 {schedule(detail.startsAt, detail.endsAt)}</p><p className="mt-2 text-sm text-[var(--tm-text-muted)]">남은 자리 {detail.remainingSpots}명</p>{detail.supplyNotice ? <section className="mt-4 rounded-3xl bg-[var(--tm-status-error-bg)] p-5"><p className="text-sm font-bold text-[var(--tm-status-error-text)]">코트 매칭 안내</p><p className="mt-2 text-sm leading-6 text-[var(--tm-status-error-text)]">{detail.supplyNotice.message}</p><p className="mt-2 text-xs text-[var(--tm-status-error-text)]">앱 안에서 안내드렸어요 · {new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(detail.supplyNotice.occurredAt))}</p></section> : null}

    {detail.recommendationReasons.length > 0 ? <section className="mt-4 flex min-h-[140px] flex-col rounded-3xl bg-[var(--tm-bg-subtle)] p-5"><h2 className="font-bold">왜 잘 맞나요?</h2><ul className="mt-4 space-y-2 text-sm text-[var(--tm-action-hover)]">{detail.recommendationReasons.map((reason) => <li key={reason.code}>• {reason.label}</li>)}</ul></section> : null}

    <Section title="코트와 비용"><p className="text-sm font-semibold text-[var(--tm-action-primary)]">{detail.court.sourceLabel}</p>{detail.court.source === "COURT_TBD" ? <p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]">아직 정해진 코트와 비용이 없어요. 수락된 참가자와 함께 편하게 정해요.</p> : <><p className="mt-3 font-semibold">{detail.court.name}</p><p className="mt-1 text-sm text-[var(--tm-text-secondary)]">{detail.court.address}{detail.court.courtNumber ? ` · ${detail.court.courtNumber}` : ""}</p><dl className="mt-5 space-y-2 text-sm">{detail.court.source === "EXTERNAL_RESERVED" ? <div className="flex justify-between gap-4 font-semibold"><dt>게스트 참가비용</dt><dd>{detail.totalCourtFeeKrw?.toLocaleString("ko-KR")}원</dd></div> : <><div className="flex justify-between gap-4"><dt>전체 코트 비용</dt><dd>{detail.totalCourtFeeKrw?.toLocaleString("ko-KR")}원</dd></div><div className="flex justify-between gap-4 font-semibold"><dt>예상 1인 비용</dt><dd>약 {detail.estimatedFeePerPersonKrw?.toLocaleString("ko-KR")}원</dd></div></>}</dl>{detail.additionalCostNote ? <p className="mt-3 text-sm text-[var(--tm-text-secondary)]">{detail.additionalCostNote}</p> : null}{detail.court.source !== "EXTERNAL_RESERVED" ? <p className="mt-3 text-xs leading-5 text-[var(--tm-text-secondary)]">예상 총 {detail.estimatedTotalParticipants}명 기준이에요. 최종 인원에 따라 실제 비용이 달라질 수 있어요.</p> : null}{detail.court.participationNote ? <p className="mt-3 rounded-2xl bg-[var(--tm-bg-subtle)] px-3 py-2 text-sm font-medium leading-6 text-[var(--tm-action-primary)]">{detail.court.participationNote}</p> : null}</>}</Section>

    {detail.settlementAccount ? <Section title="정산 정보"><p className="text-sm">{detail.settlementAccount.bank}</p><p className="mt-2 break-all font-semibold">{detail.settlementAccount.accountNumber}</p><p className="mt-2 text-sm">예금주 {detail.settlementAccount.accountHolder}</p><p className="mt-3 text-xs leading-5 text-[var(--tm-text-secondary)]">모집자와 수락된 참가자에게만 보이는 정보예요. 참가자끼리 별도로 정산하며 Rally On은 계좌 검증이나 입금 확인을 하지 않아요.</p></Section> : null}
    <Section title="게임 설정">{detail.recruitment ? <p className="mb-3 text-sm">남자 {detail.recruitment.maleRemaining}명 · 여자 {detail.recruitment.femaleRemaining}명 남았어요</p> : null}{detail.gameType ? <p className="mb-2 font-semibold">{detail.gameType.label}</p> : null}<p className="text-sm">{detail.playPurposes.map((purpose) => purpose.label).join(" · ")}</p><p className="mt-2 text-sm text-[var(--tm-text-secondary)]">{detail.partnerPreferenceLabel}</p></Section>
    <Section title="모집자 프로필"><p className="font-semibold">{detail.host.nickname}</p>{hostProfile ? <p className="mt-2 text-sm leading-6 text-[var(--tm-text-secondary)]">{hostProfile.experienceLabel}<br />{hostProfile.rallyLevelLabel} · {hostProfile.gameExperienceLabel}</p> : null}</Section>
    {detail.introduction ? <Section title="매칭 소개글"><p className="whitespace-pre-wrap break-words text-sm leading-6 text-[var(--tm-text-muted)]">{detail.introduction}</p></Section> : null}
  </article><div className="fixed inset-x-0 bottom-0 border-t border-[var(--tm-border-default)] bg-white/95 px-5 py-4 backdrop-blur"><div className="mx-auto max-w-[560px]"><DetailAction detail={detail} onApply={openSheet} /></div></div>
  {sheetOpen ? <ApplicationSheet detail={detail} message={message} applyError={applyError} alreadyApplied={alreadyApplied} isSubmitting={isSubmitting} onClose={() => setSheetOpen(false)} onMessageChange={setMessage} onSubmit={() => void submitApplication()} /> : null}
  </main>;
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
  const profile = detail.viewer.tennisProfile;
  return <Modal open onOpenChange={(next) => { if (!next) onClose(); }}>
    <ModalContainer variant="bottom" size="large">
      <ModalNavigation trailingContent={<ModalClose aria-label="신청 창 닫기" />} />
      <ModalContent>
        <ModalContentItem>
          <ModalSummary>같이 치기 신청</ModalSummary>
          <ModalHeading>신청 전에 한 번만 확인해요</ModalHeading>
        </ModalContentItem>
        <ModalContentItem>
          <div className="space-y-3"><SummaryCard title="일정과 장소"><p>{schedule(detail.startsAt, detail.endsAt)}</p><p className="mt-1 text-sm text-[var(--tm-text-secondary)]">{detail.court.name ?? "코트는 함께 정해요"}</p></SummaryCard><SummaryCard title={detail.court.source === "EXTERNAL_RESERVED" ? "게스트 참가비용" : "예상 비용"}><p>{detail.estimatedFeePerPersonKrw === null ? "코트를 정한 뒤 함께 확인해요" : detail.court.source === "EXTERNAL_RESERVED" ? `${detail.estimatedFeePerPersonKrw.toLocaleString("ko-KR")}원` : `약 ${detail.estimatedFeePerPersonKrw.toLocaleString("ko-KR")}원`}</p><p className="mt-1 text-sm text-[var(--tm-text-secondary)]">비용은 참가자끼리 별도로 정산해요.</p></SummaryCard><SummaryCard title="내 테니스 프로필"><p>{profile?.experienceLabel ?? "테니스 프로필"} · {profile?.rallyLevelLabel ?? ""}</p><p className="mt-1 text-sm text-[var(--tm-text-secondary)]">{profile?.playPurposes.map((purpose) => purpose.label).join(" · ") ?? ""}</p></SummaryCard></div>
        </ModalContentItem>
        <ModalContentItem>
          <label className="block text-sm font-semibold" htmlFor="application-message">모집자에게 한마디 <span className="font-normal text-[var(--tm-text-secondary)]">(선택)</span></label>
          <textarea className="mt-2 min-h-24 w-full resize-none rounded-2xl border border-[var(--tm-border-default)] bg-white p-3 text-sm leading-6 outline-none placeholder:text-[var(--tm-text-placeholder)] focus:border-[var(--tm-action-primary)] focus:ring-2 focus:ring-[var(--tm-action-primary)]" id="application-message" maxLength={200} onChange={(event) => onMessageChange(event.target.value)} placeholder="예: 천천히 랠리하며 같이 연습하고 싶어요." value={message} />
          <p className="mt-1 text-right text-xs text-[var(--tm-text-secondary)]">{message.length}/200</p>
          {applyError ? <div className="mt-3 rounded-2xl bg-[var(--tm-status-error-bg)] px-4 py-3 text-sm text-[var(--tm-status-error-text)]"><p>{applyError}</p>{alreadyApplied ? <Link className="mt-2 inline-block font-semibold underline" href="/activity/sent">신청 내역 보기</Link> : null}</div> : null}
        </ModalContentItem>
      </ModalContent>
      <ActionArea variant="neutral">
        <ActionAreaButton buttonColor="assistive" disabled={isSubmitting} onClick={onClose} variant="alternative">생각해볼게요</ActionAreaButton>
        <ActionAreaButton disabled={isSubmitting} loading={isSubmitting} onClick={onSubmit} variant="main">신청하기</ActionAreaButton>
      </ActionArea>
    </ModalContainer>
  </Modal>;
}

function SummaryCard({ children, title }: { children: React.ReactNode; title: string }) {
  return <section className="rounded-2xl border border-[var(--tm-border-default)] bg-white px-4 py-3"><h3 className="text-xs font-semibold text-[var(--tm-text-secondary)]">{title}</h3><div className="mt-1.5 text-sm font-semibold leading-6 text-[var(--tm-text-primary)]">{children}</div></section>;
}

function ApplicationSuccess({ title }: { title: string }) {
  return <main className="grid min-h-svh place-items-center bg-[var(--tm-bg-page)] px-5 text-[var(--tm-text-primary)]"><section className="w-full max-w-[390px] rounded-[28px] bg-white p-6 text-center shadow-[0_10px_40px_rgba(49,94,158,0.09)]"><p className="text-4xl">🎾</p><h1 className="mt-4 text-2xl font-bold">신청을 보냈어요</h1><p className="mt-3 text-sm leading-6 text-[var(--tm-text-secondary)]"><strong className="font-semibold text-[var(--tm-text-primary)]">{title}</strong><br />모집자가 프로필을 확인하면 결과를 알려드릴게요.</p><Button as={Link} className="mt-6" fullWidth href="/activity/sent">신청 내역 보기</Button></section></main>;
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return <section className="mt-4 flex min-h-[140px] flex-col rounded-3xl border border-[var(--tm-border-default)] bg-white p-5"><h2 className="font-bold">{title}</h2><div className="mt-4">{children}</div></section>;
}

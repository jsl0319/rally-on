import { notFound } from "next/navigation";
import { CourtApplicationNoticeContent } from "@/features/partner/court-application-notice";
import { buildCourtApplicationNotice } from "@/server/domain/court-application-notice";
import { CourtCompositionNotice } from "@/features/partner/court-composition-notice";
import { describeCourtComposition } from "@/server/domain/court-match-composition";
import { getApplicationDeadline, getJudgementAt, getLateConfirmationDeadline } from "@/server/domain/court-match";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  const match = {
    id: "notice-preview", hostUserId: "preview", title: "코트 매칭",
    startsAt: new Date("2030-01-05T14:00:00+09:00"), endsAt: new Date("2030-01-05T16:00:00+09:00"),
    gameType: "MIXED_DOUBLES" as const, recruitCount: 4, totalCourtFeeKrw: 20000,
    maleRecruitCount: 2, femaleRecruitCount: 2, courtCompositionPolicyVersion: 1,
    courtSlot: { minParticipantCount: 4, approvalMode: "AUTO", usageNote: null, ballDiscountEnabled: true,
      courtUnit: { name: "1번 코트", court: { name: "랠리온 테니스장", address: "서울" } } },
  };
  const notice = buildCourtApplicationNotice(match);
  return <main className="min-h-app bg-[var(--tm-bg-page)] px-5 py-8 text-[var(--tm-text-primary)]">
    <div className="mx-auto max-w-[520px]">
      <p className="mb-4 text-xs text-[var(--tm-text-secondary)]">코트 매칭 · 안내 미리보기</p>
      <section className="rounded-2xl bg-white p-5">
        <h1 className="mb-4 text-[17px] font-bold">참가 전 알아두세요</h1>
        <CourtCompositionNotice match={{
          composition: describeCourtComposition({ ...match, status: "OPEN", courtCompositionPassedAt: null, applications: [] }, new Date("2030-01-01")),
          judgementAt: getJudgementAt(match.startsAt).toISOString(),
          applicationDeadline: getApplicationDeadline(match.startsAt).toISOString(),
          lateConfirmationDeadline: getLateConfirmationDeadline(match.startsAt).toISOString(),
        }} />
        <CourtApplicationNoticeContent notice={notice} compact hideProgress hideUsageNote />
      </section>
    </div>
  </main>;
}

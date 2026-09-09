import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { getDatabaseUrl } from "../src/server/env";

config({ path: ".env.local" });
config();

/**
 * 코트 매칭(운영자 주최) 흐름을 브라우저에서 클릭해 보기 위한 시드.
 *
 * 개발 DB에 upsert로만 쓰고 아무것도 지우지 않는다. 이 저장소의 개발 DB는 실서비스와
 * 같은 인스턴스를 쓰므로(README 참고) TRUNCATE 계열을 쓰지 않는다.
 *
 *   npm run db:seed:court-match
 *     시드 운영자가 코트 매칭을 연다. 내 계정으로 로그인해 **참가 신청**을 확인한다.
 *
 *   SEED_OPERATOR_USER_ID=<내 user id> npm run db:seed:court-match
 *     내 계정이 운영자가 된다. **운영자 화면**(승인·입금 확인·환불)을 확인한다.
 *     이때 신청은 시드 참가자들이 이미 여러 상태로 넣어 둔다.
 */

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: getDatabaseUrl() }) });

const seedOperatorId = "30000000-0000-4000-8000-000000000001";
const applicants = [
  { id: "30000000-0000-4000-8000-000000000011", nickname: "시드민지", gender: "FEMALE" as const, state: "PENDING" as const },
  { id: "30000000-0000-4000-8000-000000000012", nickname: "시드수아", gender: "FEMALE" as const, state: "DEPOSIT_CLAIMED" as const },
  { id: "30000000-0000-4000-8000-000000000013", nickname: "시드지훈", gender: "MALE" as const, state: "CONFIRMED" as const },
];

const venueKey = "seed-court-match-venue";
const slotClientRequestId = "30000000-0000-4000-8000-0000000000aa";

async function upsertUser(user: { id: string; nickname: string; gender?: "MALE" | "FEMALE" }) {
  await prisma.user.upsert({
    where: { id: user.id },
    update: { nickname: user.nickname, nicknameConfirmedAt: new Date(), onboardingCompletedAt: new Date() },
    create: { id: user.id, nickname: user.nickname, nicknameConfirmedAt: new Date(), onboardingCompletedAt: new Date() },
  });
  await prisma.tennisProfile.upsert({
    where: { userId: user.id },
    update: { gender: user.gender ?? null },
    create: {
      userId: user.id,
      experienceRange: "MONTHS_6_TO_12",
      rallyLevel: "SHORT_RALLY",
      gameExperience: "KNOWS_RULES",
      gender: user.gender ?? null,
      purposes: { create: { purpose: "RALLY_PRACTICE" } },
    },
  });
}

async function resolveOperatorId() {
  const chosen = process.env.SEED_OPERATOR_USER_ID?.trim();
  if (!chosen) {
    await upsertUser({ id: seedOperatorId, nickname: "시드운영자", gender: "MALE" });
    return seedOperatorId;
  }
  const user = await prisma.user.findUnique({ where: { id: chosen }, select: { id: true, nickname: true } });
  if (!user) throw new Error(`SEED_OPERATOR_USER_ID(${chosen})에 해당하는 사용자가 없어요.`);
  console.info(`운영자로 지정: ${user.nickname}`);
  return user.id;
}

async function seedOperatorAndCourt(operatorUserId: string) {
  const now = new Date();
  const existing = await prisma.courtOperatorApplication.findFirst({
    where: { applicantUserId: operatorUserId, normalizedVenueKey: venueKey },
    select: { id: true },
  });
  const application = existing
    ? await prisma.courtOperatorApplication.update({ where: { id: existing.id }, data: { status: "PUBLISH_APPROVED" } })
    : await prisma.courtOperatorApplication.create({
        data: {
          applicantUserId: operatorUserId,
          status: "PUBLISH_APPROVED",
          businessName: "시드 테니스 운영",
          businessRegistrationNumberHash: "seed-court-match-business-hash",
          businessVerificationStatus: "VERIFIED",
          venueVerificationStatus: "MATCHED",
          venueName: "시드 테니스파크",
          venueAddress: "서울특별시 마포구 시드로 1",
          normalizedVenueKey: venueKey,
          submittedAt: now,
          verifiedAt: now,
          publishApprovedAt: now,
        },
      });

  const region = await prisma.region.findFirst({ where: { type: "DISTRICT", active: true }, select: { code: true } });
  if (!region) throw new Error("활성화된 시·군·구가 없어요. 먼저 npm run db:seed로 지역을 넣어 주세요.");

  const court = await prisma.court.upsert({
    where: { operatorApplicationId: application.id },
    update: { settlementBank: "시드은행", settlementAccountNumber: "110-222-333444", settlementAccountHolder: "시드테니스파크" },
    create: {
      operatorApplicationId: application.id,
      regionCode: region.code,
      name: "시드 테니스파크",
      address: "서울특별시 마포구 시드로 1",
      normalizedVenueKey: venueKey,
      settlementBank: "시드은행",
      settlementAccountNumber: "110-222-333444",
      settlementAccountHolder: "시드테니스파크",
    },
  });

  const unit = await prisma.courtUnit.upsert({
    where: { courtId_name: { courtId: court.id, name: "1번 코트" } },
    update: {},
    create: { courtId: court.id, name: "1번 코트" },
  });
  return { court, unit };
}

/** 공개 = 모집 시작. 운영자가 호스트인 코트 매칭을 붙이고 계좌를 스냅샷한다. */
async function seedPublishedCourtMatch(operatorUserId: string, court: { id: string; name: string; settlementBank: string | null; settlementAccountNumber: string | null; settlementAccountHolder: string | null }, unitId: string) {
  const now = new Date();
  const startsAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);

  const existing = await prisma.match.findUnique({
    where: { hostUserId_clientRequestId: { hostUserId: operatorUserId, clientRequestId: slotClientRequestId } },
    select: { id: true, courtSlotId: true },
  });
  if (existing?.courtSlotId) {
    await prisma.matchApplication.deleteMany({ where: { matchId: existing.id } });
    await prisma.courtSlot.update({
      where: { id: existing.courtSlotId },
      data: { startsAt, endsAt, status: "AVAILABLE", visibility: "PUBLIC", statusChangedAt: now },
    });
    await prisma.match.update({ where: { id: existing.id }, data: { startsAt, endsAt, status: "OPEN", cancelledAt: null, closedAt: null } });
    return { matchId: existing.id, slotId: existing.courtSlotId };
  }

  const slot = await prisma.courtSlot.create({
    data: {
      courtUnitId: unitId,
      startsAt,
      endsAt,
      priceKrw: 18_000,
      maxParticipantCount: 4,
      minParticipantCount: 2,
      gameType: "MIXED_DOUBLES",
      maleCapacity: 2,
      femaleCapacity: 2,
      approvalMode: "OPERATOR",
      visibility: "PUBLIC",
      status: "AVAILABLE",
      publishedAt: now,
      statusChangedAt: now,
      usageNote: "실내 전용 테니스화를 준비해 주세요. 공은 코트에 준비돼 있어요.",
    },
  });
  const match = await prisma.match.create({
    data: {
      hostUserId: operatorUserId,
      clientRequestId: slotClientRequestId,
      title: `${court.name} 1번 코트`,
      startsAt,
      endsAt,
      courtSource: "PARTNER_COURT",
      courtSlotId: slot.id,
      recruitCount: 4,
      maleRecruitCount: 2,
      femaleRecruitCount: 2,
      gameType: "MIXED_DOUBLES",
      partnerPreference: "COMPLETE_BEGINNER_WELCOME",
      totalCourtFeeKrw: slot.priceKrw,
      settlementBank: court.settlementBank,
      settlementAccountNumber: court.settlementAccountNumber,
      settlementAccountHolder: court.settlementAccountHolder,
    },
  });
  return { matchId: match.id, slotId: slot.id };
}

/** 운영자 화면이 비어 있지 않도록 신청을 여러 상태로 만들어 둔다. */
async function seedApplications(matchId: string, startsAt: Date) {
  const now = new Date();
  const paymentDueAt = new Date(Math.min(now.getTime() + 6 * 60 * 60 * 1000, startsAt.getTime() - 3 * 60 * 60 * 1000));
  let code = 741;

  for (const applicant of applicants) {
    await upsertUser(applicant);
    const base = {
      matchId,
      applicantUserId: applicant.id,
      applicantGender: applicant.gender,
      profileSnapshot: { source: "seed-court-match" },
      profileSnapshotVersion: 1,
      message: applicant.state === "PENDING" ? "천천히 랠리하면서 배우고 싶어요." : null,
    };
    const state = applicant.state === "PENDING"
      ? { status: "PENDING" as const }
      : applicant.state === "DEPOSIT_CLAIMED"
        ? { status: "ACCEPTED" as const, decidedAt: now, depositCode: String(code++), paymentDueAt, depositorName: `${applicant.nickname}${code - 1}`, depositClaimedAt: now }
        : { status: "CONFIRMED" as const, decidedAt: now, depositCode: String(code++), paymentDueAt, depositorName: applicant.nickname, depositClaimedAt: now, confirmedAt: now };

    await prisma.matchApplication.create({ data: { ...base, ...state } });
  }
}

async function main() {
  const operatorUserId = await resolveOperatorId();
  const { court, unit } = await seedOperatorAndCourt(operatorUserId);
  const { matchId, slotId } = await seedPublishedCourtMatch(operatorUserId, court, unit.id);
  const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId }, select: { startsAt: true } });
  await seedApplications(matchId, match.startsAt);

  console.info("코트 매칭 시드를 준비했어요.");
  console.info(`  참가자 화면  /partner-sessions/${slotId}`);
  console.info(`  운영자 화면  /partner/court-matches/${matchId}`);
  console.info("  승인 방식은 '직접 승인'이라 신청이 승인 대기로 쌓여요.");
}

main().finally(async () => prisma.$disconnect());

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

import { requireE2eDatabaseUrl } from "./e2e-environment";

export const e2eUsers = {
  host: { id: "20000000-0000-4000-8000-000000000001", nickname: "E2E모집자", gender: "MALE" },
  applicant: { id: "20000000-0000-4000-8000-000000000002", nickname: "E2E참가자", gender: "FEMALE" },
  outsider: { id: "20000000-0000-4000-8000-000000000003", nickname: "E2E외부인", gender: "MALE" },
  operator: { id: "20000000-0000-4000-8000-000000000004", nickname: "E2E운영자", gender: "MALE" },
} as const;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: requireE2eDatabaseUrl() }) });

export type E2eFixture = {
  matchTitle: string;
  partnerMatchTitle: string;
  partnerSlotId: string;
  partnerMatchId: string;
  legacyMatchId: string;
  legacyMatchTitle: string;
};

async function createOnboardedUser({ id, nickname, gender }: { id: string; nickname: string; gender: "MALE" | "FEMALE" }) {
  return prisma.user.create({
    data: {
      id,
      nickname,
      nicknameConfirmedAt: new Date(),
      onboardingCompletedAt: new Date(),
      tennisProfile: {
        create: {
          experienceRange: "MONTHS_6_TO_12",
          rallyLevel: "SHORT_RALLY",
          gameExperience: "KNOWS_RULES",
          gender,
          purposes: { create: { purpose: "RALLY_PRACTICE" } },
        },
      },
    },
  });
}

export async function resetE2eDatabase(): Promise<E2eFixture> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "users", "regions" RESTART IDENTITY CASCADE');

  await prisma.region.create({ data: { code: "E2E-SEOUL", name: "E2E 서울", shortName: "E2E서울", type: "CITY", active: true } });
  await prisma.region.create({ data: { code: "E2E-SEOUL-001", name: "E2E 마포구", parentCode: "E2E-SEOUL", type: "DISTRICT", active: true } });

  await createOnboardedUser(e2eUsers.host);
  await createOnboardedUser(e2eUsers.applicant);
  await createOnboardedUser(e2eUsers.outsider);
  await createOnboardedUser(e2eUsers.operator);

  const matchTitle = "E2E 주말 랠리 연습";
  const partnerMatchTitle = "E2E 준비된 코트 랠리";
  const legacyMatchTitle = "E2E 과거 코트 미정 매칭";
  const now = new Date();
  const partnerStartsAt = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
  const partnerEndsAt = new Date(partnerStartsAt.getTime() + 2 * 60 * 60 * 1000);

  const operatorApplication = await prisma.courtOperatorApplication.create({
    data: {
      applicantUserId: e2eUsers.operator.id,
      status: "PUBLISH_APPROVED",
      businessName: "E2E 테니스 운영",
      businessRegistrationNumberHash: "e2e-business-registration-hash",
      businessVerificationStatus: "VERIFIED",
      venueVerificationStatus: "MATCHED",
      venueName: "E2E 준비된 테니스장",
      venueAddress: "서울시 E2E 마포구 2",
      normalizedVenueKey: "e2e-prepared-tennis-court",
      submittedAt: now,
      verifiedAt: now,
      publishApprovedAt: now,
    },
  });
  const court = await prisma.court.create({
    data: {
      operatorApplicationId: operatorApplication.id,
      regionCode: "E2E-SEOUL-001",
      name: "E2E 준비된 테니스장",
      address: "서울시 E2E 마포구 2",
      normalizedVenueKey: "e2e-prepared-tennis-court",
      settlementBank: "E2E은행",
      settlementAccountNumber: "111-222-333",
      settlementAccountHolder: "E2E테니스장",
    },
  });
  const courtUnit = await prisma.courtUnit.create({ data: { courtId: court.id, name: "1번 코트" } });
  const partnerSlot = await prisma.courtSlot.create({
    data: {
      courtUnitId: courtUnit.id,
      startsAt: partnerStartsAt,
      endsAt: partnerEndsAt,
      priceKrw: 36_000,
      maxParticipantCount: 2,
      minParticipantCount: 2,
      gameType: "MIXED_DOUBLES",
      maleCapacity: 1,
      femaleCapacity: 1,
      approvalMode: "AUTO",
      visibility: "PUBLIC",
      status: "AVAILABLE",
      publishedAt: now,
      statusChangedAt: now,
      usageNote: "테니스공은 모집자와 참가자가 서비스 내 채팅에서 확인해요.",
    },
  });

  const partnerMatch = await prisma.match.create({
    data: {
      hostUserId: e2eUsers.operator.id,
      clientRequestId: partnerSlot.id,
      title: partnerMatchTitle,
      startsAt: partnerStartsAt,
      endsAt: partnerEndsAt,
      courtSource: "PARTNER_COURT",
      courtSlotId: partnerSlot.id,
      recruitCount: 2,
      maleRecruitCount: 1,
      femaleRecruitCount: 1,
      gameType: "MIXED_DOUBLES",
      partnerPreference: "COMPLETE_BEGINNER_WELCOME",
      totalCourtFeeKrw: 36_000,
      settlementBank: "E2E은행",
      settlementAccountNumber: "111-222-333",
      settlementAccountHolder: "E2E테니스장",
    },
  });

  const legacyStartsAt = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const legacyEndsAt = new Date(now.getTime() - 60 * 60 * 1000);
  const legacyMatch = await prisma.match.create({
    data: {
      hostUserId: e2eUsers.host.id,
      clientRequestId: "20000000-0000-4000-8000-000000000005",
      title: legacyMatchTitle,
      startsAt: legacyStartsAt,
      endsAt: legacyEndsAt,
      courtSource: "COURT_TBD",
      recruitCount: 1,
      partnerPreference: "COMPLETE_BEGINNER_WELCOME",
      status: "CLOSED",
      closedAt: now,
      purposes: { create: { purpose: "RALLY_PRACTICE" } },
    },
  });
  await prisma.matchApplication.create({
    data: {
      matchId: legacyMatch.id,
      applicantUserId: e2eUsers.applicant.id,
      status: "ACCEPTED",
      profileSnapshot: { source: "E2E legacy fixture" },
      decidedAt: now,
    },
  });
  await prisma.matchConversation.create({
    data: {
      matchId: legacyMatch.id,
      members: {
        create: [
          { userId: e2eUsers.host.id, role: "HOST" },
          { userId: e2eUsers.applicant.id, role: "PARTICIPANT" },
        ],
      },
      messages: { create: { type: "SYSTEM", body: "과거 매칭 기록이에요." } },
    },
  });

  return { matchTitle, partnerMatchTitle, partnerSlotId: partnerSlot.id, partnerMatchId: partnerMatch.id, legacyMatchId: legacyMatch.id, legacyMatchTitle };
}

export async function disconnectE2eDatabase() {
  await prisma.$disconnect();
}

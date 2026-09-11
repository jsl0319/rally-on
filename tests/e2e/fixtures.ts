import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

import { requireE2eDatabaseUrl } from "./e2e-environment";

export const e2eUsers = {
  reviewer: { id: "20000000-0000-4000-8000-000000000005", nickname: "E2E담당자", gender: "FEMALE" },
  host: { id: "20000000-0000-4000-8000-000000000001", nickname: "E2E모집자", gender: "MALE" },
  applicant: { id: "20000000-0000-4000-8000-000000000002", nickname: "E2E참가자", gender: "FEMALE" },
  outsider: { id: "20000000-0000-4000-8000-000000000003", nickname: "E2E외부인", gender: "MALE" },
  operator: { id: "20000000-0000-4000-8000-000000000004", nickname: "E2E운영자", gender: "MALE" },
} as const;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: requireE2eDatabaseUrl() }) });

export type E2eFixture = {
  matchTitle: string;
  /** 정원이 차서 마감된 일반 매칭. 참가 취소와 다시 모집을 화면에서 확인한다. */
  fullMatchId: string;
  fullMatchApplicationId: string;
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

/**
 * 화면을 닫아도 그 화면이 마지막으로 보낸 요청은 서버에서 아직 끝나지 않았을 수 있다.
 * 하단 배지와 채팅은 주기적으로 다시 불러오므로 그런 요청이 늘 떠 있다. 그 트랜잭션이
 * users를 참조하는 동안 TRUNCATE가 들어가면 교착이 난다(40P01). 실제로 테스트 하나가
 * 그렇게 깨졌다. 잠깐 기다렸다 다시 한다.
 */
async function truncateUsers(attempts = 5) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await prisma.$executeRawUnsafe('TRUNCATE TABLE "users", "regions" RESTART IDENTITY CASCADE');
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= attempts || !/deadlock|lock timeout/i.test(message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
}

export async function resetE2eDatabase(): Promise<E2eFixture> {
  await truncateUsers();

  await prisma.region.create({ data: { code: "E2E-SEOUL", name: "E2E 서울", shortName: "E2E서울", type: "CITY", active: true } });
  await prisma.region.create({ data: { code: "E2E-SEOUL-001", name: "E2E 마포구", parentCode: "E2E-SEOUL", type: "DISTRICT", active: true } });

  await createOnboardedUser(e2eUsers.host);
  await createOnboardedUser(e2eUsers.applicant);
  await createOnboardedUser(e2eUsers.outsider);
  await createOnboardedUser(e2eUsers.operator);
  await createOnboardedUser(e2eUsers.reviewer);
  await prisma.user.update({ where: { id: e2eUsers.reviewer.id }, data: { role: "INTERNAL_REVIEWER" } });

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

  // 정원이 차서 마감된 일반 매칭. 참가자가 취소하면 자리가 비고 모집자가 다시 열 수 있다.
  const fullStartsAt = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
  const fullMatch = await prisma.match.create({
    data: {
      hostUserId: e2eUsers.host.id,
      clientRequestId: "20000000-0000-4000-8000-000000000006",
      title: "E2E 자리가 찬 매칭",
      startsAt: fullStartsAt,
      endsAt: new Date(fullStartsAt.getTime() + 2 * 60 * 60 * 1000),
      courtSource: "EXTERNAL_RESERVED",
      externalCourtName: "E2E 마감 테니스장",
      externalCourtAddress: "서울시 E2E 마포구 3",
      recruitCount: 1,
      partnerPreference: "COMPLETE_BEGINNER_WELCOME",
      totalCourtFeeKrw: 24_000,
      status: "CLOSED",
      closedAt: now,
      purposes: { create: { purpose: "RALLY_PRACTICE" } },
    },
  });
  const fullMatchApplication = await prisma.matchApplication.create({
    data: {
      matchId: fullMatch.id,
      applicantUserId: e2eUsers.applicant.id,
      applicantGender: "FEMALE",
      status: "ACCEPTED",
      profileSnapshot: { source: "E2E full match fixture" },
      decidedAt: now,
    },
  });
  await prisma.matchConversation.create({
    data: {
      matchId: fullMatch.id,
      members: {
        create: [
          { userId: e2eUsers.host.id, role: "HOST" },
          { userId: e2eUsers.applicant.id, role: "PARTICIPANT" },
        ],
      },
      messages: { create: { type: "SYSTEM", body: "매칭이 성사됐어요. 당일 준비를 편하게 조율해 보세요." } },
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

  return { matchTitle, fullMatchId: fullMatch.id, fullMatchApplicationId: fullMatchApplication.id, partnerMatchTitle, partnerSlotId: partnerSlot.id, partnerMatchId: partnerMatch.id, legacyMatchId: legacyMatch.id, legacyMatchTitle };
}

export async function disconnectE2eDatabase() {
  await prisma.$disconnect();
}

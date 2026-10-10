import { config } from "dotenv";
import { createPrismaPg } from "../src/server/db/prisma-adapter";

import { PrismaClient } from "../src/generated/prisma/client";
import { getDatabaseUrl } from "../src/server/env";

config({ path: ".env.local" });
config();

const prisma = new PrismaClient({ adapter: createPrismaPg(getDatabaseUrl()) });

const hosts = [
  { id: "10000000-0000-4000-8000-000000000001", nickname: "랠리민지", rallyLevel: "SHORT_RALLY", gameExperience: "NONE", purposes: ["RALLY_PRACTICE"] },
  { id: "10000000-0000-4000-8000-000000000002", nickname: "테니스수아", rallyLevel: "COMFORTABLE_RALLY", gameExperience: "KNOWS_RULES", purposes: ["CASUAL_HIT", "RALLY_PRACTICE"] },
  { id: "10000000-0000-4000-8000-000000000003", nickname: "초록라켓", rallyLevel: "STARTING", gameExperience: "NONE", purposes: ["CASUAL_HIT"] },
  { id: "10000000-0000-4000-8000-000000000004", nickname: "주말테니스", rallyLevel: "SHORT_RALLY", gameExperience: "PLAYED_FEW", purposes: ["GAME_INTRO"] },
] as const;

async function seedHosts() {
  for (const host of hosts) {
    await prisma.user.upsert({
      where: { id: host.id },
      update: { nickname: host.nickname, nicknameConfirmedAt: new Date(), onboardingCompletedAt: new Date() },
      create: { id: host.id, nickname: host.nickname, nicknameConfirmedAt: new Date(), onboardingCompletedAt: new Date() },
    });
    await prisma.tennisProfile.upsert({
      where: { userId: host.id },
      update: {
        experienceRange: "MONTHS_6_TO_12", rallyLevel: host.rallyLevel, gameExperience: host.gameExperience,
        purposes: { deleteMany: {}, create: host.purposes.map((purpose) => ({ purpose })) },
      },
      create: {
        userId: host.id, experienceRange: "MONTHS_6_TO_12", rallyLevel: host.rallyLevel, gameExperience: host.gameExperience,
        purposes: { create: host.purposes.map((purpose) => ({ purpose })) },
      },
    });
  }
}

async function seedMatches() {
  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + 2);
  startsAt.setHours(10, 0, 0, 0);
  const fixtures = [
    ["천천히 랠리 연습해요", "마포 테니스장", "서울 마포구 월드컵로 25", "RALLY_PRACTICE", "COMPLETE_BEGINNER_WELCOME", 40_000],
    ["주말에 편하게 공 주고받아요", "용산 가족공원 테니스장", "서울 용산구 서빙고로 137", "CASUAL_HIT", "COMPLETE_BEGINNER_WELCOME", 30_000],
    ["첫 게임 입문, 같이 해봐요", "성동 테니스장", "서울 성동구 살곶이길 200", "GAME_INTRO", "SIMILAR_LEVEL", 36_000],
    ["가벼운 랠리로 주말 시작", "광진 테니스장", "서울 광진구 아차산로 549", "RALLY_PRACTICE", "SIMILAR_LEVEL", 32_000],
  ] as const;

  for (const [index, fixture] of fixtures.entries()) {
    const [title, courtName, address, purpose, partnerPreference, fee] = fixture;
    const start = new Date(startsAt);
    start.setDate(startsAt.getDate() + index);
    const end = new Date(start);
    end.setHours(end.getHours() + 2);
    const host = hosts[index];
    await prisma.match.upsert({
      where: { hostUserId_clientRequestId: { hostUserId: host.id, clientRequestId: `20000000-0000-4000-8000-00000000000${index + 1}` } },
      update: { title, startsAt: start, endsAt: end, status: "OPEN" },
      create: {
        hostUserId: host.id, clientRequestId: `20000000-0000-4000-8000-00000000000${index + 1}`,
        title, startsAt: start, endsAt: end,
        externalCourtName: courtName, externalCourtAddress: address, recruitCount: 2,
        partnerPreference, totalCourtFeeKrw: fee, introduction: "처음 만나는 메이트와도 천천히, 편하게 쳐요.",
        purposes: { create: { purpose } },
      },
    });
  }

  const tbdStart = new Date(startsAt);
  tbdStart.setDate(tbdStart.getDate() + fixtures.length);
  const tbdEnd = new Date(tbdStart);
  tbdEnd.setHours(tbdEnd.getHours() + 2);
  await prisma.match.upsert({
    where: { hostUserId_clientRequestId: { hostUserId: hosts[0].id, clientRequestId: "20000000-0000-4000-8000-000000000005" } },
    update: { title: "주말 코트, 같이 정해요", startsAt: tbdStart, endsAt: tbdEnd, status: "OPEN", courtSource: "COURT_TBD", externalCourtName: null, externalCourtAddress: null, externalCourtNumber: null, totalCourtFeeKrw: null, additionalCostNote: null },
    create: {
      hostUserId: hosts[0].id, clientRequestId: "20000000-0000-4000-8000-000000000005",
      title: "주말 코트, 같이 정해요", startsAt: tbdStart, endsAt: tbdEnd, courtSource: "COURT_TBD", recruitCount: 2,
      partnerPreference: "COMPLETE_BEGINNER_WELCOME", introduction: "코트와 비용은 수락 후 서비스 내 채팅에서 함께 정해요.",
      purposes: { create: { purpose: "RALLY_PRACTICE" } },
    },
  });
}

seedHosts()
  .then(seedMatches)
  .then(() => console.info("M3 테스트 매치 4개를 준비했어요."))
  .finally(async () => prisma.$disconnect());

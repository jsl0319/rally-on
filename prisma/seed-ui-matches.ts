import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { getDatabaseUrl } from "../src/server/env";
import { matchCreateInputSchema } from "../src/server/domain/match";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: getDatabaseUrl() }) });
const fixtures = [
  { name: "[테스트] 한강 블루 테니스장", address: "서울 마포구 월드컵로 25", gameType: "OTHER", male: null, female: null, count: 3, time: "10:00", end: "12:00", fee: 12000, purposes: ["RALLY_PRACTICE", "GAME_INTRO"], level: "COMFORTABLE_RALLY", game: "PLAYED_FEW", gender: "MALE", welcome: true, intro: "천천히 랠리하고 게임 규칙도 함께 익혀요." },
  { name: "[테스트] 서울숲 테니스코트", address: "서울 성동구 살곶이길 200", gameType: "MIXED_DOUBLES", male: 1, female: 2, count: 3, time: "18:30", end: "20:30", fee: 15000, purposes: ["GAME_INTRO", "GAME"], level: "SHORT_RALLY", game: "KNOWS_RULES", gender: "FEMALE", welcome: true, intro: "혼합 복식을 처음 해보는 분도 환영해요. 점수는 천천히 함께 세요." },
  { name: "[테스트] 잠실 실내 테니스장", address: "서울 송파구 올림픽로 25", gameType: "MENS_DOUBLES", male: 1, female: 0, count: 1, time: "20:00", end: "22:00", fee: 20000, purposes: ["GAME"], level: "STANDARD_RALLY", game: "CAN_PLAY", gender: "MALE", welcome: false, intro: "남자 복식 게임을 함께할 한 분을 모집해요. 서비스와 리턴을 연습해요." },
  { name: "[테스트] 분당 그린 테니스파크", address: "경기 성남시 분당구 중앙공원로 35", gameType: "WOMENS_DOUBLES", male: 0, female: 3, count: 3, time: "09:30", end: "11:00", fee: 8000, purposes: ["STROKE_PRACTICE", "RALLY_PRACTICE"], level: "SHORT_RALLY", game: "PLAYED_FEW", gender: "FEMALE", welcome: false, intro: "스트로크와 짧은 랠리로 몸을 풀고 여자 복식을 연습해요." },
  { name: "[테스트] 하남 리버사이드 코트", address: "경기 하남시 감북동 368-40", gameType: "OTHER", male: null, female: null, count: 2, time: "14:00", end: "17:00", fee: 0, purposes: ["CASUAL_HIT", "STROKE_PRACTICE"], level: "STARTING", game: "NONE", gender: "FEMALE", welcome: true, intro: "공을 주고받는 것부터 편하게 시작해요. 쉬는 시간을 충분히 가져요." },
] as const;

const nextTwoDays = process.argv.includes("--next-two-days");

async function main() {
  const results = await prisma.$transaction(async (tx) => {
    const results = [];
    const entries = nextTwoDays ? [...fixtures, ...fixtures] : [...fixtures];
    for (const [i, original] of entries.entries()) {
      const slot = i % fixtures.length;
      const f = nextTwoDays ? {
        ...original,
        time: ["08:00", "11:30", "15:00", "18:30", "21:00"][slot],
        end: ["09:30", "13:30", "17:00", "20:30", "23:00"][slot],
        fee: (i < 5 ? [5000, 10000, 18000, 12000, 0] : [0, 15000, 20000, 8000, 6000])[slot],
        count: slot === 0 ? (i < 5 ? 2 : 4) : original.count,
      } : original;
      const id = nextTwoDays ? `8afee608-0909-4000-8000-${String(i + 1).padStart(12, "0")}` : `8afee608-0908-4000-8000-00000000000${i + 1}`;
      const existing = await tx.match.findUnique({ where: { id }, select: { id: true, externalCourtName: true } });
      if (existing) { results.push({ ...existing, action: "already-exists" }); continue; }
      const day = new Date(Date.now() + (nextTwoDays ? Math.floor(i / 5) + 1 : i + 1) * 86400000 + 9 * 3600000).toISOString().slice(0, 10);
      const input = matchCreateInputSchema.parse({
        clientRequestId: id, courtSource: "EXTERNAL_RESERVED", externalCourt: { name: f.name, address: f.address, courtNumber: `${i + 1}번 코트` },
        startsAt: `${day}T${f.time}:00+09:00`, endsAt: `${day}T${f.end}:00+09:00`, gameType: f.gameType,
        recruitCount: f.count, maleRecruitCount: f.male, femaleRecruitCount: f.female, playPurposes: [...f.purposes],
        partnerPreference: f.welcome ? "COMPLETE_BEGINNER_WELCOME" : "SIMILAR_LEVEL", totalCourtFeeKrw: f.fee,
        introduction: `[UI 테스트용] 실제 모집이나 코트 예약이 아닙니다.\n${f.intro}`,
      });
      if (input.courtSource !== "EXTERNAL_RESERVED") throw new Error("Unexpected court source");
      const previous = nextTwoDays ? await tx.match.findUnique({ where: { id: `8afee608-0908-4000-8000-00000000000${slot + 1}` }, select: { hostUserId: true } }) : null;
      const host = previous ? { id: previous.hostUserId } : await tx.user.create({ data: {
        nickname: `[테스트] ${["블루라켓", "혼복메이트", "나이트테니스", "그린볼", "새싹라켓"][slot]}`,
        nicknameConfirmedAt: new Date(), onboardingCompletedAt: new Date(),
        tennisProfile: { create: { gender: f.gender, experienceRange: slot === 4 ? "UNDER_3_MONTHS" : "YEARS_1_TO_2", rallyLevel: f.level, gameExperience: f.game, purposes: { create: f.purposes.map(purpose => ({ purpose })) } } },
      } });
      const match = await tx.match.create({ data: {
        id, hostUserId: host.id, clientRequestId: id, title: f.name, courtSource: "EXTERNAL_RESERVED",
        externalCourtName: f.name, externalCourtAddress: f.address, externalCourtNumber: `${i + 1}번 코트`,
        startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), gameType: f.gameType,
        recruitCount: f.count, maleRecruitCount: f.male, femaleRecruitCount: f.female,
        partnerPreference: input.partnerPreference, totalCourtFeeKrw: f.fee, introduction: input.introduction,
        purposes: { create: f.purposes.map(purpose => ({ purpose })) },
      }, select: { id: true, externalCourtName: true, gameType: true, startsAt: true, recruitCount: true } });
      results.push({ ...match, action: "created" });
    }
    return results;
  }, { timeout: 30000 });
  console.info(JSON.stringify(results, null, 2));
}
main().catch(() => { console.error("테스트 매칭 생성 실패: 트랜잭션을 롤백했습니다."); process.exitCode = 1; }).finally(() => prisma.$disconnect());

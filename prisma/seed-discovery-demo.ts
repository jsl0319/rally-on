/**
 * Discovery fixtures with an optional, guarded replacement of known old test matches. No dotenv: the caller must inject the intended DB.
 * Default: validate and preview. --apply inserts one atomic batch; reruns are no-ops.
 * Requires --date=YYYY-MM-DD and --expected-host=<database hostname>. --count=6 adds a sixth pair (default 5).
 * All accounts, courts, contact/settlement details are explicitly fictional test data.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import type { Prisma } from "../src/generated/prisma/client";
import { createPrismaPg } from "../src/server/db/prisma-adapter";
import { getDatabaseUrl } from "../src/server/env";
import { matchCreateInputSchema } from "../src/server/domain/match";
import { courtSlotCreateInputSchema, courtSettlementAccountInputSchema } from "../src/server/domain/court-slot";
import { courtContactInputSchema } from "../src/matches/court-contact";
import { courtCompositionPolicyVersion } from "../src/matches/court-composition";

const option = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
const date = option("date");
const countOption = option("count") ?? "5";
if (countOption !== "5" && countOption !== "6") throw new Error("--count must be 5 or 6.");
const fixtureCount = Number(countOption);
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
  throw new Error("A valid --date=YYYY-MM-DD is required.");
}
const databaseUrl = getDatabaseUrl();
if (new URL(databaseUrl).hostname !== option("expected-host")) throw new Error("Database target does not match --expected-host.");
const batch = date.replaceAll("-", "");
const id = (group: number, index = 1) => `${batch}-${String(group).padStart(4, "0")}-4000-8000-${String(index).padStart(12, "0")}`;
const testNote = "[화면 테스트용] 가상의 코트·일정입니다. 실제 예약·참가·입금·전화는 하지 마세요.";
const now = new Date();
const operatorId = id(3);
const fixtures = [
  { name: "망원 모닝코트", district: "마포구", city: "SEOUL", day: 1, time: "09:00", end: "11:00", courtTime: "10:00", courtEnd: "12:00", type: "OTHER", male: null, female: null, count: 3, capacity: 4, courtMale: null, courtFemale: null, minimum: 2, fee: 0, courtFee: 10000, approval: "AUTO", purposes: ["CASUAL_HIT", "RALLY_PRACTICE"], gender: "FEMALE", experience: "UNDER_3_MONTHS", rally: "STARTING", game: "NONE", welcome: true, intro: "공을 천천히 주고받으며 기본 자세부터 익혀요.", balls: true, equipment: true, facilitator: false },
  { name: "서울숲 믹스코트", district: "성동구", city: "SEOUL", day: 1, time: "16:30", end: "18:30", courtTime: "17:00", courtEnd: "19:00", type: "MIXED_DOUBLES", male: 1, female: 2, count: 3, capacity: 4, courtMale: 2, courtFemale: 2, minimum: 4, fee: 12000, courtFee: 15000, approval: "OPERATOR", purposes: ["GAME_INTRO", "RALLY_PRACTICE"], gender: "MALE", experience: "MONTHS_6_TO_12", rally: "SHORT_RALLY", game: "KNOWS_RULES", welcome: true, intro: "처음 하는 혼합 복식도 괜찮아요. 점수부터 함께 익혀요.", balls: true, equipment: false, facilitator: true },
  { name: "잠실 나이트코트", district: "송파구", city: "SEOUL", day: 2, time: "20:00", end: "22:00", courtTime: "19:30", courtEnd: "21:30", type: "MENS_DOUBLES", male: 1, female: 0, count: 1, capacity: 4, courtMale: 4, courtFemale: 0, minimum: 4, fee: 20000, courtFee: 22000, approval: "AUTO", purposes: ["GAME"], gender: "MALE", experience: "YEARS_1_TO_2", rally: "STANDARD_RALLY", game: "CAN_PLAY", welcome: false, intro: "퇴근 후 남자 복식 게임을 함께할 한 분을 찾아요.", balls: true, equipment: false, facilitator: false },
  { name: "분당 그린코트", district: "성남시", city: "GYEONGGI", day: 2, time: "10:30", end: "12:00", courtTime: "11:00", courtEnd: "13:00", type: "WOMENS_DOUBLES", male: 0, female: 3, count: 3, capacity: 6, courtMale: 0, courtFemale: 6, minimum: 4, fee: 8000, courtFee: 18000, approval: "OPERATOR", purposes: ["STROKE_PRACTICE", "GAME_INTRO"], gender: "FEMALE", experience: "YEARS_1_TO_2", rally: "COMFORTABLE_RALLY", game: "PLAYED_FEW", welcome: true, intro: "스트로크 연습 후 여자 복식을 번갈아 즐겨요.", balls: false, equipment: false, facilitator: true },
  { name: "하남 리버코트", district: "하남시", city: "GYEONGGI", day: 3, time: "18:00", end: "20:30", courtTime: "18:30", courtEnd: "21:00", type: "MIXED_DOUBLES", male: 1, female: 1, count: 2, capacity: 6, courtMale: 3, courtFemale: 3, minimum: 4, fee: 15000, courtFee: 12000, approval: "OPERATOR", purposes: ["RALLY_PRACTICE", "GAME"], gender: "FEMALE", experience: "YEARS_1_TO_2", rally: "COMFORTABLE_RALLY", game: "PLAYED_FEW", welcome: false, intro: "가볍게 랠리하고 혼복을 돌아가며 즐기는 저녁이에요.", balls: true, equipment: false, facilitator: false },
  { name: "연남 위켄드코트", district: "마포구", city: "SEOUL", day: 3, time: "09:30", end: "12:00", courtTime: "10:00", courtEnd: "12:30", type: "OTHER", male: null, female: null, count: 5, capacity: 6, courtMale: null, courtFemale: null, minimum: 2, fee: 30000, courtFee: 8000, approval: "AUTO", purposes: ["CASUAL_HIT", "STROKE_PRACTICE"], gender: "MALE", experience: "MONTHS_3_TO_6", rally: "SHORT_RALLY", game: "NONE", welcome: true, intro: "주말 아침, 성별과 게임 경험에 상관없이 번갈아 공을 쳐요. 처음 오시는 분도 환영해요.", balls: false, equipment: false, facilitator: false },
] as const;
const selectedFixtures = fixtures.slice(0, fixtureCount);

function at(day: number, time: string) {
  const target = new Date(`${date}T00:00:00Z`);
  target.setUTCDate(target.getUTCDate() + day);
  return `${target.toISOString().slice(0, 10)}T${time}:00+09:00`;
}

const entries = selectedFixtures.map((fixture, index) => {
  const name = `[테스트] ${fixture.name}`;
  const address = `${fixture.city === "SEOUL" ? "서울" : "경기"} ${fixture.district} (가상 코트)`;
  const general = matchCreateInputSchema.parse({
    clientRequestId: id(1, index + 1), courtSource: "EXTERNAL_RESERVED",
    externalCourt: { name, address, courtNumber: `${index + 1}번 코트` },
    startsAt: at(fixture.day, fixture.time), endsAt: at(fixture.day, fixture.end),
    recruitCount: fixture.count, maleRecruitCount: fixture.male, femaleRecruitCount: fixture.female,
    gameType: fixture.type, playPurposes: [...fixture.purposes], totalCourtFeeKrw: fixture.fee,
    partnerPreference: fixture.welcome ? "COMPLETE_BEGINNER_WELCOME" : "SIMILAR_LEVEL",
    introduction: `${testNote}\n${fixture.intro}`,
  });
  const slot = courtSlotCreateInputSchema.parse({
    courtUnitName: `${index + 1}번 코트`, startsAt: at(fixture.day, fixture.courtTime), endsAt: at(fixture.day, fixture.courtEnd),
    priceKrw: fixture.courtFee, maxParticipantCount: fixture.capacity, minParticipantCount: fixture.minimum,
    gameType: fixture.type, maleCapacity: fixture.courtMale, femaleCapacity: fixture.courtFemale,
    approvalMode: fixture.approval,
    serviceScope: { balls: false, equipment: fixture.equipment, lesson: false, facilitator: fixture.facilitator },
    usageNote: `${testNote}\n${fixture.intro}`,
  });
  if (new Date(slot.startsAt).getTime() - now.getTime() < 4 * 60 * 60_000) throw new Error("Court fixtures must start at least 4 hours later.");
  return { fixture, index: index + 1, name, address, general, slot };
});

// Deliberately non-bank test values; never copy a real person's account or phone.
const settlement = courtSettlementAccountInputSchema.parse({ bank: "테스트용 · 송금 금지", accountNumber: "00000", accountHolder: "실제 송금 금지" });
const contact = courtContactInputSchema.parse({ phone: "01000000000", hours: "테스트 연락처 · 실제 전화 금지", publicationAgreed: true, expectedVersion: 0 });
const matchIds = entries.flatMap(({ index }) => [id(1, index), id(8, index)]);

// Only repository-owned fixture identities qualify. A label alone is never enough.
const oldUiIds = [
  ...Array.from({ length: 5 }, (_, i) => `8afee608-0908-4000-8000-${String(i + 1).padStart(12, "0")}`),
  ...Array.from({ length: 10 }, (_, i) => `8afee608-0909-4000-8000-${String(i + 1).padStart(12, "0")}`),
];
const oldDemoIds = [1, 8].flatMap((group) => Array.from({ length: 5 }, (_, i) =>
  `20261010-${String(group).padStart(4, "0")}-4000-8000-${String(i + 1).padStart(12, "0")}`));
const oldSeedHosts = Array.from({ length: 4 }, (_, i) => `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
const knownOldFixtures: Prisma.MatchWhereInput = { OR: [
  { id: { in: [...oldUiIds, ...oldDemoIds].filter((value) => !matchIds.includes(value)) }, title: { startsWith: "[테스트]" } },
  { hostUserId: { in: oldSeedHosts }, clientRequestId: { in: Array.from({ length: 5 }, (_, i) => `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`) } },
] };
const safeToRemove: Prisma.MatchWhereInput = {
  ...knownOldFixtures,
  applications: { none: {} }, conversation: { is: null }, supportInquiries: { none: {} },
  supplyIncidents: { none: {} }, transactionHandoff: { is: null }, compositionCancellation: { is: null },
};
async function replaceOldFixtures(tx: Prisma.TransactionClient) {
  // Row locks also block a concurrent application FK insertion. Recheck after locks.
  const candidates = await tx.match.findMany({ where: knownOldFixtures, select: { id: true } });
  for (const { id: oldId } of candidates.sort((a, b) => a.id.localeCompare(b.id))) {
    await tx.$queryRaw`SELECT id FROM matches WHERE id = ${oldId}::uuid FOR UPDATE`;
  }
  const removable = await tx.match.findMany({ where: safeToRemove, select: { id: true, courtSlotId: true } });
  const deleted = await tx.match.deleteMany({ where: { ...safeToRemove, id: { in: removable.map((m) => m.id) } } });
  const deletedSlots = await tx.courtSlot.deleteMany({ where: {
    id: { in: removable.flatMap((m) => m.courtSlotId ? [m.courtSlotId] : []) },
    match: { is: null }, supplyIncidents: { none: {} },
  } });
  return { matches: deleted.count, slots: deletedSlots.count, retainedHistory: candidates.length - deleted.count };
}

async function main() {
  const prisma = new PrismaClient({ adapter: createPrismaPg(databaseUrl) });
  try {
    const regions = await prisma.region.findMany({ where: { active: true, type: "DISTRICT", OR: selectedFixtures.map((f) => ({ name: f.district, parentCode: f.city })) }, select: { code: true, name: true, parentCode: true } });
    const regionFor = (f: typeof fixtures[number]) => {
      const region = regions.find((r) => r.name === f.district && r.parentCode === f.city);
      if (!region) throw new Error(`Missing fixture region: ${f.district}`);
      return region.code;
    };
    entries.forEach(({ fixture }) => regionFor(fixture));
    const existing = await prisma.match.findMany({ where: { id: { in: matchIds } }, select: { id: true, hostUserId: true } });
    if (existing.length !== 0 && existing.length !== matchIds.length) throw new Error("Partial batch exists; refusing to change existing records.");
    if (existing.some((m) => m.hostUserId !== (m.id.includes("-0008-") ? operatorId : id(2, Number(m.id.slice(-12)))))) throw new Error("Fixture ID collision.");
    const summary = entries.map(({ index, name, general, slot }) => ({ name, general: { id: id(1, index), startsAt: general.courtSource === "EXTERNAL_RESERVED" ? general.startsAt : null, gameType: general.gameType, fee: fixtures[index - 1].fee, recruits: general.recruitCount }, court: { slotId: id(7, index), startsAt: slot.startsAt, gameType: slot.gameType, fee: slot.priceKrw, capacity: slot.maxParticipantCount, minimum: slot.minParticipantCount, approval: slot.approvalMode } }));
    if (!process.argv.includes("--apply") || existing.length === matchIds.length) {
      console.log(JSON.stringify({ action: existing.length ? "already-exists" : "dry-run", replace: process.argv.includes("--replace-existing") ? { known: await prisma.match.count({ where: knownOldFixtures }), removable: await prisma.match.count({ where: safeToRemove }) } : null, entries: summary }, null, 2));
      return;
    }
    const removed = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`discovery-demo-${batch}`}))`;
      if (await tx.match.count({ where: { id: { in: matchIds } } })) throw new Error("Batch was created concurrently; rerun to verify.");
      const removed = process.argv.includes("--replace-existing") ? await replaceOldFixtures(tx) : null;
      await tx.user.create({ data: { id: operatorId, nickname: `[테스트] 운영${batch.slice(-4)}`, nicknameConfirmedAt: now, onboardingCompletedAt: now, tennisProfile: { create: { gender: "FEMALE", experienceRange: "YEARS_1_TO_2", rallyLevel: "COMFORTABLE_RALLY", gameExperience: "PLAYED_FEW" } } } });
      for (const { fixture: f, index: i, name, address, general, slot } of entries) {
        if (general.courtSource !== "EXTERNAL_RESERVED") throw new Error("Unexpected fixture source.");
        await tx.user.create({ data: {
          id: id(2, i), nickname: `[테스트] ${["새싹", "혼복", "야간", "그린", "리버", "주말"][i - 1]}${batch.slice(-4)}`,
          nicknameConfirmedAt: now, onboardingCompletedAt: now,
          tennisProfile: { create: { gender: f.gender, experienceRange: f.experience, rallyLevel: f.rally, gameExperience: f.game, purposes: { create: f.purposes.map((purpose) => ({ purpose })) } } },
        } });
        await tx.match.create({ data: {
          id: id(1, i), clientRequestId: general.clientRequestId, hostUserId: id(2, i), title: name,
          courtSource: "EXTERNAL_RESERVED", externalCourtName: name, externalCourtAddress: address, externalCourtNumber: general.externalCourt.courtNumber,
          startsAt: new Date(general.startsAt), endsAt: new Date(general.endsAt), gameType: general.gameType,
          recruitCount: general.recruitCount, maleRecruitCount: general.maleRecruitCount, femaleRecruitCount: general.femaleRecruitCount,
          partnerPreference: general.partnerPreference, totalCourtFeeKrw: general.totalCourtFeeKrw, introduction: general.introduction,
          purposes: { create: f.purposes.map((purpose) => ({ purpose })) },
        } });
        const key = `discovery-demo-${batch}-${i}`;
        await tx.courtOperatorApplication.create({ data: {
          id: id(4, i), applicantUserId: operatorId, status: "PUBLISH_APPROVED", businessName: name,
          businessRegistrationNumberHash: key, businessVerificationStatus: "VERIFIED", venueVerificationStatus: "MATCHED",
          venueName: name, venueAddress: address, normalizedVenueKey: key, submittedAt: now, verifiedAt: now, publishApprovedAt: now,
        } });
        await tx.court.create({ data: {
          id: id(5, i), operatorApplicationId: id(4, i), regionCode: regionFor(f), name, address, normalizedVenueKey: key,
          settlementBank: settlement.bank, settlementAccountNumber: settlement.accountNumber, settlementAccountHolder: settlement.accountHolder,
          operatorContactPhone: contact.phone, operatorContactHours: contact.hours, contactPublishedAt: now, contactVersion: 1,
        } });
        await tx.courtUnit.create({ data: { id: id(6, i), courtId: id(5, i), name: slot.courtUnitName } });
        await tx.courtSlot.create({ data: {
          id: id(7, i), courtUnitId: id(6, i), startsAt: new Date(slot.startsAt), endsAt: new Date(slot.endsAt),
          ballDiscountEnabled: true, priceKrw: slot.priceKrw, maxParticipantCount: slot.maxParticipantCount, minParticipantCount: slot.minParticipantCount,
          gameType: slot.gameType, maleCapacity: slot.maleCapacity, femaleCapacity: slot.femaleCapacity, approvalMode: slot.approvalMode,
          serviceScope: slot.serviceScope, usageNote: slot.usageNote, visibility: "PUBLIC", status: "AVAILABLE", publishedAt: now, statusChangedAt: now,
          statusHistory: { create: { fromStatus: "DRAFT", toStatus: "AVAILABLE", actor: "OPERATOR", actorUserId: operatorId, reasonCode: "TEST_FIXTURE_PUBLISHED" } },
        } });
        await tx.match.create({ data: {
          id: id(8, i), clientRequestId: id(7, i), hostUserId: operatorId, title: name, courtSource: "PARTNER_COURT", courtSlotId: id(7, i),
          startsAt: new Date(slot.startsAt), endsAt: new Date(slot.endsAt), gameType: slot.gameType,
          recruitCount: slot.maxParticipantCount, maleRecruitCount: slot.maleCapacity, femaleRecruitCount: slot.femaleCapacity,
          courtCompositionPolicyVersion, partnerPreference: "COMPLETE_BEGINNER_WELCOME", totalCourtFeeKrw: slot.priceKrw,
          settlementBank: settlement.bank, settlementAccountNumber: settlement.accountNumber, settlementAccountHolder: settlement.accountHolder,
          introduction: `${testNote}\n${f.intro}`, purposes: { create: f.purposes.map((purpose) => ({ purpose })) },
        } });
      }
      return removed;
    }, { timeout: 120_000, maxWait: 10_000 });
    console.log(JSON.stringify({ action: "created", count: matchIds.length, removed, entries: summary }, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch((error: unknown) => {
  // Do not log DB error messages: driver errors can contain connection details.
  console.error("Demo batch failed; its transaction was rolled back.", {
    type: error instanceof Error ? error.name : "UnknownError",
    code: typeof error === "object" && error !== null && "code" in error ? error.code : undefined,
    model: typeof error === "object" && error !== null && "meta" in error ? (error.meta as { modelName?: string })?.modelName : undefined,
  });
  process.exitCode = 1;
});

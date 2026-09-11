import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { test, type BrowserContext, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";

import { PrismaClient } from "@/generated/prisma/client";

import { E2E_AUTH_SECRET, E2E_BASE_URL, requireE2eDatabaseUrl } from "./e2e-environment";
import { e2eUsers, resetE2eDatabase, type E2eFixture } from "./fixtures";

/**
 * 첫 사용자가 보는 순서대로 화면을 찍는다.
 *
 * 검사가 아니라 눈으로 보기 위한 것이라 단언을 세우지 않는다. 한 화면이 막혀도
 * 나머지를 계속 찍어야 전체 인상을 볼 수 있으므로, 단계마다 실패를 삼키고 구간마다
 * 테스트를 나눈다(한 구간이 시간을 다 써도 다음 구간은 처음부터 시작한다).
 */

const SHOT_DIR = path.join(process.cwd(), ".claude-transfer/tour-shots");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: requireE2eDatabaseUrl() }) });
const newcomer = { id: "20000000-0000-4000-8000-000000000009", nickname: "새사용자" };

let fixture: E2eFixture;
/** 둘러볼 매칭이 하나도 없으면 목록 화면의 인상을 볼 수 없다. 공개 매칭을 만들어 둔다. */
let browseTitle = "";

async function visit(page: Page, url: string) {
  // 이 앱은 배지와 채팅을 주기적으로 다시 불러온다. networkidle은 영영 오지 않는다.
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
}

async function step(page: Page, name: string, action: () => Promise<void>) {
  const startedAt = Date.now();
  try {
    await action();
  } catch (error) {
    console.log(`  · ${name}: ${(error as Error).message.split("\n")[0]}`);
  }
  try {
    await shot(page, name);
  } catch (error) {
    console.log(`  · ${name} (촬영 실패): ${(error as Error).message.split("\n")[0]}`);
  }
  console.log(`  · ${name} ${Math.round((Date.now() - startedAt) / 100) / 10}초`);
}

async function signInAs(context: BrowserContext, userId: string) {
  const value = await encode({
    token: { sub: userId, userId },
    secret: E2E_AUTH_SECRET,
    salt: "authjs.session-token",
    maxAge: 60 * 60,
  });
  await context.addCookies([{ name: "authjs.session-token", value, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
}

test.beforeAll(async () => {
  fixture = await resetE2eDatabase();
  await prisma.user.create({ data: { id: newcomer.id, nickname: newcomer.nickname } });
  // 픽스처의 matchTitle은 화면에서 직접 만들어 쓰는 제목일 뿐 매칭 행이 아니다.
  // 목록·상세·신청 화면을 보려면 공개된 일반 매칭이 실제로 있어야 한다.
  const day = 24 * 60 * 60 * 1000;
  const firstStartsAt = new Date(Date.now() + 3 * day);
  browseTitle = "토요일 아침 가볍게 랠리";
  const browseMatch = await prisma.match.create({
    data: {
      hostUserId: e2eUsers.host.id, clientRequestId: crypto.randomUUID(), title: browseTitle,
      startsAt: firstStartsAt, endsAt: new Date(firstStartsAt.getTime() + 2 * 60 * 60 * 1000),
      courtSource: "EXTERNAL_RESERVED", externalCourtName: "망원 한강공원 테니스장", externalCourtAddress: "서울시 마포구 마포나루길 467",
      recruitCount: 2, partnerPreference: "COMPLETE_BEGINNER_WELCOME", totalCourtFeeKrw: 24_000,
      introduction: "공을 오래 이어가는 연습을 하고 싶어요. 천천히 쳐도 괜찮아요.",
      purposes: { create: { purpose: "RALLY_PRACTICE" } },
    },
  });
  const secondStartsAt = new Date(Date.now() + 6 * day);
  await prisma.match.create({
    data: {
      hostUserId: e2eUsers.outsider.id, clientRequestId: crypto.randomUUID(), title: "퇴근 후 스트로크 연습",
      startsAt: secondStartsAt, endsAt: new Date(secondStartsAt.getTime() + 2 * 60 * 60 * 1000),
      courtSource: "COURT_TBD", recruitCount: 1, partnerPreference: "COMPLETE_BEGINNER_WELCOME",
      purposes: { create: { purpose: "STROKE_PRACTICE" } },
    },
  });
  // 모집자 화면에 검토할 신청이 있어야 신청자 목록까지 볼 수 있다.
  await prisma.matchApplication.create({
    data: {
      matchId: browseMatch.id, applicantUserId: e2eUsers.outsider.id, applicantGender: "MALE",
      status: "PENDING", message: "초보인데 같이 쳐도 될까요? 천천히 배우고 있어요.",
      profileSnapshot: { source: "tour" },
    },
  });

  // 알림 화면을 빈 상태로만 보면 실제 인상을 알 수 없다. 대표적인 세 가지를 넣어 둔다.
  await prisma.notification.createMany({
    data: [
      { userId: e2eUsers.applicant.id, type: "APPLICATION_ACCEPTED", title: "신청이 수락됐어요", body: `${fixture.matchTitle} 모집자가 신청을 수락했어요. 채팅에서 일정을 확인해요.`, href: "/activity/sent" },
      { userId: e2eUsers.applicant.id, type: "MATCH_CANCELLED", title: "매칭이 취소됐어요", body: "토요일 아침 랠리 모집자가 매칭을 취소했어요. 그날 일정은 비워 두셔도 돼요.", href: "/activity/sent" },
      { userId: e2eUsers.applicant.id, type: "COURT_MATCH_DEPOSIT_REQUIRED", title: "자리가 잡혔어요", body: `${fixture.partnerMatchTitle} 참가비를 기한 안에 보내면 참가가 확정돼요.`, href: "/activity/sent" },
    ],
  });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("1. 아직 로그인하지 않은 사람", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await step(page, "01-처음-화면", async () => { await visit(page, "/"); });
  await step(page, "02-로그인", async () => { await visit(page, "/login"); });
  await step(page, "03-약관", async () => { await visit(page, "/terms"); });
  await context.close();
});

test("2. 프로필이 없는 사람의 온보딩", async ({ browser }) => {
  const context = await browser.newContext();
  await signInAs(context, newcomer.id);
  const page = await context.newPage();
  await step(page, "04-온보딩-닉네임", async () => {
    await visit(page, "/");
    await page.getByRole("button", { name: "이 이름으로 시작할게요" }).waitFor({ timeout: 20_000 });
  });
  await step(page, "05-온보딩-경력", async () => {
    await page.locator("input[type='text']").first().fill("코트새내기");
    await page.getByRole("button", { name: "이 이름으로 시작할게요" }).click();
    await page.getByText("6개월~1년").waitFor({ timeout: 15_000 });
  });
  await step(page, "06-온보딩-랠리", async () => {
    await page.getByText("6개월~1년").click();
    await page.getByRole("button", { name: "다음" }).click();
    await page.getByText("몇 번씩 주고받을 수 있어요").waitFor({ timeout: 15_000 });
  });
  await step(page, "07-온보딩-게임경험", async () => {
    await page.getByText("몇 번씩 주고받을 수 있어요").click();
    await page.getByRole("button", { name: "다음" }).click();
    await page.getByText("규칙은 알고 있어요").waitFor({ timeout: 15_000 });
  });
  await step(page, "07b-온보딩-목적과-성별", async () => {
    await page.getByText("규칙은 알고 있어요").click();
    await page.getByRole("button", { name: "다음" }).click();
    await page.getByText("편하게 공 주고받기").waitFor({ timeout: 15_000 });
  });
  await step(page, "08-온보딩-완성", async () => {
    await page.getByText("편하게 공 주고받기").click();
    await page.getByRole("button", { name: "여자" }).click();
    await page.getByRole("button", { name: "프로필 완성하기" }).click();
    await page.getByRole("button", { name: "추천 매치 보기" }).waitFor({ timeout: 20_000 });
  });
  await step(page, "09-첫-홈", async () => {
    await page.getByRole("button", { name: "추천 매치 보기" }).click();
    await page.getByRole("heading", { name: "매칭 둘러보기" }).waitFor({ timeout: 15_000 });
  });
  await context.close();
});

test("3. 둘러보고 신청하는 사람", async ({ browser }) => {
  const context = await browser.newContext();
  await signInAs(context, e2eUsers.applicant.id);
  const page = await context.newPage();
  await step(page, "10-홈-목록", async () => { await visit(page, "/"); });
  await step(page, "11-매칭-상세", async () => {
    await page.getByText(browseTitle).first().click();
    await page.waitForTimeout(1_500);
  });
  await step(page, "12-신청-시트", async () => {
    await page.getByRole("button", { name: "참가 신청하기" }).click();
    await page.waitForTimeout(800);
  });
  await step(page, "13-내가-보낸-신청", async () => { await visit(page, "/activity/sent"); });
  await step(page, "14-채팅-목록", async () => { await visit(page, "/chats"); });
  await step(page, "15-마이", async () => { await visit(page, "/my"); });
  await step(page, "16-알림", async () => { await visit(page, "/my/notifications"); });
  await step(page, "17-코트-매칭-목록", async () => { await visit(page, "/partner-sessions"); });
  await context.close();
});

test("4. 매칭을 만드는 사람", async ({ browser }) => {
  const context = await browser.newContext();
  await signInAs(context, e2eUsers.host.id);
  const page = await context.newPage();
  await step(page, "18-매칭-개설", async () => { await visit(page, "/matches/new"); });
  await step(page, "19-내가-만든-매칭", async () => { await visit(page, "/activity/received"); });
  await step(page, "20-받은-신청", async () => {
    await page.getByRole("link", { name: /신청/ }).first().click();
    await page.waitForTimeout(1_500);
  });
  await step(page, "21-채팅방", async () => { await visit(page, `/chats/${fixture.fullMatchId}`); });
  await step(page, "22-공지", async () => { await visit(page, "/notices"); });
  await context.close();
});

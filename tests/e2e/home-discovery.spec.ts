import { expect, test, type BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { PrismaClient } from "@/generated/prisma/client";
import { createPrismaPg } from "../../src/server/db/prisma-adapter";
import { E2E_AUTH_SECRET, E2E_BASE_URL, requireE2eDatabaseUrl } from "./e2e-environment";
import { disconnectE2eDatabase, e2eUsers, resetE2eDatabase } from "./fixtures";

const prisma = new PrismaClient({ adapter: createPrismaPg(requireE2eDatabaseUrl()) });
const courtName = "E2E 첫 목록 코트";
async function signIn(context: BrowserContext, userId: string = e2eUsers.applicant.id) {
  const value = await encode({ token: { sub: userId, userId }, secret: E2E_AUTH_SECRET, salt: "authjs.session-token", maxAge: 3600 });
  await context.addCookies([{ name: "authjs.session-token", value, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
}

test.beforeEach(async () => {
  await resetE2eDatabase();
  const startsAt = new Date(Date.now() + 7 * 86_400_000);
  await prisma.match.create({ data: {
    hostUserId: e2eUsers.host.id, clientRequestId: crypto.randomUUID(), title: courtName,
    courtSource: "EXTERNAL_RESERVED", externalCourtName: courtName, externalCourtAddress: "서울 E2E 코트",
    startsAt, endsAt: new Date(startsAt.getTime() + 7_200_000), recruitCount: 3,
    gameType: "OTHER", partnerPreference: "COMPLETE_BEGINNER_WELCOME", totalCourtFeeKrw: 10000,
    purposes: { create: { purpose: "RALLY_PRACTICE" } },
  } });
});
test.afterAll(async () => { await prisma.$disconnect(); await disconnectE2eDatabase(); });

test("홈은 me를 기다리지 않고 목록을 한 번 불러온다", async ({ page, context }) => {
  await signIn(context);
  const requests: string[] = [];
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "매칭", exact: true })).toBeVisible();
  await expect(page.getByText(courtName, { exact: true })).toBeVisible();
  expect(requests.filter((path) => path === "/api/v1/me")).toHaveLength(0);
  expect(requests.filter((path) => path === "/api/v1/matches")).toHaveLength(1);
});

test("비로그인 홈은 목록을 요청하지 않고 진입 화면을 보여준다", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /카카오로 시작하기/ })).toBeVisible();
  expect(requests).not.toContain("/api/v1/matches");
  expect(requests).not.toContain("/api/v1/me");
  expect((await page.request.get("/api/v1/matches")).status()).toBe(401);
});

test("탈퇴·이용 제한 계정은 거래 확인 화면으로 이동한다", async ({ page, context }) => {
  await prisma.user.update({ where: { id: e2eUsers.applicant.id }, data: { status: "SUSPENDED" } });
  await signIn(context);
  await page.goto("/");
  await expect(page).toHaveURL(/\/account\/transactions$/);
  await expect(page.getByText(courtName, { exact: true })).toHaveCount(0);
});

test("목록 요청 시 세션이 만료되면 진입 화면으로 돌아간다", async ({ page, context }) => {
  await signIn(context);
  let listRequested = false;
  await page.route("**/api/v1/matches?*", (route) => {
    listRequested = true;
    return route.fulfill({ status: 401, json: { error: { code: "UNAUTHENTICATED", message: "다시 로그인해 주세요." } } });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /카카오로 시작하기/ })).toBeVisible();
  expect(listRequested).toBe(true);
  await expect(page.getByText(courtName, { exact: true })).toHaveCount(0);
});

test("목록 오류를 재시도해 정상 목록으로 복구한다", async ({ page, context }) => {
  await signIn(context);
  let attempts = 0;
  await page.route("**/api/v1/matches?*", async (route) => {
    if (attempts++ === 0) await route.fulfill({ status: 503, json: { error: { code: "INTERNAL_ERROR", message: "잠시 후 다시 시도해 주세요." } } });
    else await route.continue();
  });
  await page.goto("/");
  await expect(page.getByText("매칭을 불러오지 못했어요.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.getByText(courtName, { exact: true })).toBeVisible();
});

test("프로필이 누락된 계정은 목록 API 검증 후 온보딩으로 복구한다", async ({ page, context }) => {
  await prisma.tennisProfile.delete({ where: { userId: e2eUsers.applicant.id } });
  await signIn(context);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /테니스와 친해진 지/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "나와 맞는 매칭 보기" })).toHaveCount(0);
});

test("신규 가입자가 온보딩 완료 후 같은 홈 주소에서 목록에 도착한다", async ({ page, context }) => {
  const newcomer = await prisma.user.create({ data: { nickname: "홈새사용자" } });
  await signIn(context, newcomer.id);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "이 이름으로 시작할게요" })).toBeVisible();
  await page.getByRole("button", { name: "이 이름으로 시작할게요" }).click();
  for (const label of ["6개월~1년", "몇 번씩 주고받을 수 있어요", "규칙은 알고 있어요"]) {
    await page.getByText(label, { exact: true }).click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
  }
  await page.getByText("편하게 공 주고받기", { exact: true }).click();
  await page.getByRole("button", { name: "여자", exact: true }).click();
  await page.getByRole("button", { name: "프로필 완성하기" }).click();
  await page.getByRole("button", { name: "나와 맞는 매칭 보기" }).click();
  await expect(page.getByText(courtName, { exact: true })).toBeVisible();
});

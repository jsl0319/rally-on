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
// Finish ancillary badge requests before the next test truncates its isolated DB.
test.afterEach(async ({ page }) => { await page.waitForLoadState("networkidle"); });

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

async function pull(page: import("@playwright/test").Page, amount = 170, cancel = false) {
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 160, y: 220 }] });
  for (let i = 1; i <= 8; i++) {
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 160, y: 220 + amount * i / 8 }] });
    await page.waitForTimeout(16);
  }
  await session.send("Input.dispatchTouchEvent", { type: cancel ? "touchCancel" : "touchEnd", touchPoints: [] });
  await session.detach();
}

test("당기기 기준·취소·중복 방지와 필터 유지", async ({ page, context }) => {
  await signIn(context);
  let count = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/v1/matches") count++; });
  await page.goto("/");
  await expect(page.getByText(courtName, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "게임 유형", exact: true }).click();
  await page.getByRole("button", { name: "기타", exact: true }).click();
  const filtered = page.waitForResponse(response => response.url().includes("/api/v1/matches?") && response.url().includes("gameType=OTHER"));
  await page.getByRole("button", { name: "적용하기" }).click();
  await filtered;
  await expect(page.getByText(courtName, { exact: true })).toBeVisible();
  const before = count;
  await pull(page, 45);
  await pull(page, 170, true);
  expect(count).toBe(before);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let refreshCalls = 0;
  await page.route("**/api/v1/matches?*", async route => {
    expect(new URL(route.request().url()).searchParams.get("gameType")).toBe("OTHER");
    refreshCalls++;
    await gate;
    await route.continue();
  });
  try {
    await pull(page);
    await expect(page.getByText("새로고침 중", { exact: true })).toBeVisible();
    await pull(page);
    expect(refreshCalls).toBe(1);
  } finally { release(); }
  await expect(page.getByText("새로고침 중", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "기타", exact: true })).toBeVisible();
  await expect(page.getByText(courtName, { exact: true })).toBeVisible();
});

test("작은 모바일 카드의 사진·제목·하단 버튼과 스크롤 중 새로고침 방지", async ({ page, context }) => {
  await signIn(context);
  let calls = 0;
  await page.route("**/api/v1/matches?*", async route => {
    calls++;
    const response = await route.fetch();
    const data = await response.json();
    const item = data.items.find((item: { court: { name: string } }) => item.court.name === courtName);
    await route.fulfill({ json: { items: Array.from({ length: 10 }, (_, n) => ({ ...item, id: `${item.id}-${n}` })) } });
  });
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto("/");
    await expect(page.locator(".rally-discovery-card")).toHaveCount(10);
    const card = await page.locator(".rally-discovery-card").first().boundingBox();
    const photo = await page.locator(".rally-card-photo").first().boundingBox();
    const footer = await page.locator(".rally-card-footer").first().boundingBox();
    expect(card).not.toBeNull(); expect(photo).not.toBeNull(); expect(footer).not.toBeNull();
    expect(Math.abs(photo!.y - card!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(photo!.y + photo!.height - footer!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(footer!.width - card!.width)).toBeLessThanOrEqual(2);
    expect(photo!.height).toBeLessThan(card!.height);
    expect(Math.abs(photo!.x + photo!.width - card!.x - card!.width)).toBeLessThanOrEqual(1);
    expect(card!.height).toBeLessThan(240);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const nav = await page.getByRole("navigation", { name: "주요 메뉴" }).boundingBox();
    const fab = await page.getByRole("link", { name: "매칭 만들기", exact: true }).boundingBox();
    expect(nav!.y - fab!.y - fab!.height).toBeGreaterThanOrEqual(4);
    expect(nav!.y - fab!.y - fab!.height).toBeLessThanOrEqual(12);
    await page.evaluate(() => window.scrollTo(0, 650));
    const header = page.locator("[data-sticky-page-header]");
    await expect.poll(async () => (await header.boundingBox())!.y).toBe(0);
    const before = calls;
    await pull(page);
    expect(calls).toBe(before);
    await expect(header).toBeVisible();
    await page.screenshot({ path: `/private/tmp/rally-compact-${width}.png` });
  }
});

for (const [path, endpoint, title] of [
  ["/partner-sessions", "/api/v1/partner-session-slots", "코트 매칭"],
  ["/chats", "/api/v1/me/conversations", "채팅"],
  ["/my", "/api/v1/me", "마이"],
  ["/activity/sent", "/api/v1/me/applications", "내가 보낸 신청"],
  ["/activity/received", "/api/v1/me/hosted-matches", "내가 만든 매칭"],
  ["/my/notifications", "/api/v1/me/notifications", "알림"],
]) {
  test(`${title} 메뉴에서도 제목과 당겨서 새로고침을 제공한다`, async ({ page, context }) => {
    await signIn(context);
    let requests = 0;
    page.on("request", request => { if (new URL(request.url()).pathname === endpoint) requests++; });
    const loaded = page.waitForResponse(response => new URL(response.url()).pathname === endpoint);
    await page.goto(path);
    await loaded;
    await expect(page.locator("[data-sticky-page-header]").getByRole("heading", { name: title, exact: true })).toBeVisible();
    if (path === "/my") await expect(page.getByText("매칭 소식 알림", { exact: true })).toBeVisible();
    if (path === "/chats") await page.getByRole("tab", { name: "내가 신청한 매칭" }).click();
    const before = requests;
    await pull(page);
    await expect.poll(() => requests).toBeGreaterThan(before);
    await expect(page.getByText("새로고침 중", { exact: true })).toHaveCount(0);
    if (path === "/chats") await expect(page.getByRole("tab", { name: "내가 신청한 매칭" })).toHaveAttribute("aria-selected", "true");
  });
}

test("열린 필터 패널의 당기기는 목록 새로고침으로 이어지지 않는다", async ({ page, context }) => {
  await signIn(context);
  let calls = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/v1/matches") calls++; });
  await page.goto("/");
  await expect(page.getByText(courtName, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "날짜", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const before = calls;
  await pull(page);
  expect(calls).toBe(before);
  await expect(page.getByRole("dialog")).toBeVisible();
});

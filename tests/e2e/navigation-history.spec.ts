import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { PrismaClient } from "@/generated/prisma/client";
import { createPrismaPg } from "../../src/server/db/prisma-adapter";
import { E2E_AUTH_SECRET, E2E_BASE_URL, requireE2eDatabaseUrl } from "./e2e-environment";
import { disconnectE2eDatabase, e2eUsers, resetE2eDatabase } from "./fixtures";

const db = new PrismaClient({ adapter: createPrismaPg(requireE2eDatabaseUrl()) });
test.afterAll(async () => { await db.$disconnect(); await disconnectE2eDatabase(); });
async function signIn(context: BrowserContext, userId: string = e2eUsers.applicant.id) {
  const value = await encode({ token: { sub: userId, userId }, secret: E2E_AUTH_SECRET, salt: "authjs.session-token", maxAge: 3600 });
  await context.addCookies([{ name: "authjs.session-token", value, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
}
const back = (page: Page) => page.getByRole("button", { name: "이전 화면으로 돌아가기", exact: true }).click();
const ready = (page: Page) => expect(page.locator("[data-navigation-loading]")).toHaveCount(0);
const activityLabels = { received: "내가 만든 매칭", sent: "내가 보낸 신청" } as const;
async function switchActivity(page: Page, tab: keyof typeof activityLabels) {
  const link = page.getByRole("navigation", { name: "신청 활동 구분" }).getByRole("link", { name: activityLabels[tab], exact: true });
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/activity/${tab}$`));
  await expect(link).toHaveAttribute("aria-current", "page");
  await ready(page);
}

test("알림·마이에서 같은 신청 화면을 열어도 실제 출발 화면과 스크롤로 복귀한다", async ({ page, context }) => {
  await resetE2eDatabase(); await signIn(context);
  await db.notification.createMany({ data: Array.from({ length: 18 }, (_, i) => ({ userId: e2eUsers.applicant.id, type: "APPLICATION_ACCEPTED", title: `복귀 알림 ${i}`, createdAt: new Date(Date.now() - i * 1000), body: "신청 상태를 확인해 주세요", href: "/activity/sent" })) });
  await page.goto("/my/notifications");
  const notification = page.getByRole("link").filter({ hasText: "복귀 알림 12" });
  await notification.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => scrollY);
  expect(before).toBeGreaterThan(300);
  await notification.click();
  await expect(page.getByRole("heading", { name: "내가 보낸 신청", exact: true })).toBeVisible();
  for (const tab of ["received", "sent", "received"] as const) await switchActivity(page, tab);
  await back(page);
  await expect(page).toHaveURL(/\/my\/notifications$/); await ready(page);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before - 8);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(before + 8);
  await page.goForward(); await expect(page).toHaveURL(/\/activity\/received$/); await ready(page);
  await page.goBack(); await expect(page).toHaveURL(/\/my\/notifications$/); await ready(page);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before - 8);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(before + 8);
  await back(page); await expect(page).toHaveURL(/\/my$/);
  await page.getByRole("link", { name: /내가 보낸 신청/ }).click();
  await expect(page).toHaveURL(/\/activity\/sent$/);
  await back(page); await expect(page).toHaveURL(/\/my$/);
});

for (const initialTab of ["received", "sent"] as const) {
  test(`${activityLabels[initialTab]} 진입 후 탭을 반복 전환해도 화살표·브라우저 뒤로가기는 마이로 돌아간다`, async ({ page, context }) => {
    await resetE2eDatabase(); await signIn(context);
    await page.goto("/my"); await ready(page);
    for (const browserBack of [false, true]) {
      await page.getByRole("link", { name: new RegExp(activityLabels[initialTab]) }).click();
      await expect(page).toHaveURL(new RegExp(`/activity/${initialTab}$`)); await ready(page);
      const historySize = await page.evaluate(() => history.length);
      const other = initialTab === "sent" ? "received" : "sent";
      for (const tab of [other, initialTab, other, other] as const) await switchActivity(page, tab);
      expect(await page.evaluate(() => history.length)).toBe(historySize);
      if (browserBack) await page.goBack(); else await back(page);
      await expect(page).toHaveURL(/\/my$/); await ready(page);
    }
  });
}

for (const tab of ["received", "sent"] as const) {
  test(`${activityLabels[tab]} 탭에서 상세를 열면 뒤로가기는 해당 탭을 거쳐 원래 화면으로 돌아간다`, async ({ page, context }) => {
    const fixture = await resetE2eDatabase();
    await signIn(context, tab === "received" ? e2eUsers.host.id : e2eUsers.applicant.id);
    await page.goto("/my"); await ready(page);
    const other = tab === "sent" ? "received" : "sent";
    await page.getByRole("link", { name: new RegExp(activityLabels[other]) }).click();
    await switchActivity(page, tab);
    await page.locator(`a[href^="/matches/${fixture.fullMatchId}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/matches/${fixture.fullMatchId}`)); await ready(page);
    await page.goBack(); await expect(page).toHaveURL(new RegExp(`/activity/${tab}$`)); await ready(page);
    await expect(page.getByRole("navigation", { name: "신청 활동 구분" }).getByRole("link", { name: activityLabels[tab] })).toHaveAttribute("aria-current", "page");
    await back(page); await expect(page).toHaveURL(/\/my$/);
  });
}

for (const court of [false, true]) {
  test(`${court ? "코트 " : ""}매칭의 필터·정렬·스크롤은 화살표와 브라우저 뒤로가기 모두 유지한다`, async ({ page, context }) => {
    test.setTimeout(120000);
    const fixture = await resetE2eDatabase(); await signIn(context);
    const slot = await db.courtSlot.findUniqueOrThrow({ where: { id: fixture.partnerSlotId }, include: { courtUnit: true } });
    const startsAt = slot.startsAt;
    for (let i = 0; i < 12; i++) {
      let courtSlotId: string | undefined;
      if (court) {
        const unit = await db.courtUnit.create({ data: { courtId: slot.courtUnit.courtId, name: `복귀 ${i}번 코트` } });
        courtSlotId = (await db.courtSlot.create({ data: { courtUnitId: unit.id, startsAt, endsAt: slot.endsAt, priceKrw: 36000 + i * 100, maxParticipantCount: 4, minParticipantCount: 4, gameType: "MIXED_DOUBLES", maleCapacity: 2, femaleCapacity: 2, approvalMode: "AUTO", visibility: "PUBLIC", status: "AVAILABLE", publishedAt: new Date() } })).id;
      }
      await db.match.create({ data: { hostUserId: court ? e2eUsers.operator.id : e2eUsers.host.id, clientRequestId: randomUUID(), title: `복귀 매칭 ${i}`, startsAt, endsAt: slot.endsAt, courtSource: court ? "PARTNER_COURT" : "EXTERNAL_RESERVED", courtSlotId, externalCourtName: court ? undefined : `복귀 테니스장 ${i}`, externalCourtAddress: court ? undefined : "서울시 E2E 마포구", recruitCount: court ? 4 : 3, maleRecruitCount: court ? 2 : 1, femaleRecruitCount: 2, gameType: "MIXED_DOUBLES", partnerPreference: "COMPLETE_BEGINNER_WELCOME", totalCourtFeeKrw: 36000, purposes: { create: { purpose: "RALLY_PRACTICE" } } } });
    }
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(startsAt);
    const root = court ? "/partner-sessions" : "/";
    await page.goto(`${root}?date=${date}`); await ready(page);
    await page.getByRole("button", { name: "게임 유형", exact: true }).click();
    await page.getByRole("button", { name: "혼복", exact: true }).click();
    await page.getByRole("button", { name: "적용하기", exact: true }).click();
    await expect(page).toHaveURL(/gameType=MIXED_DOUBLES/);
    await page.getByRole("button", { name: court ? "시간 빠른순" : "추천순", exact: true }).click();
    const listApi = court ? "/api/v1/partner-session-slots?" : "/api/v1/matches?";
    await Promise.all([
      page.waitForResponse(response => response.url().includes(listApi) && response.url().includes(court ? "sort=priceLow" : "sort=newest") && response.ok()),
      page.getByRole("button", { name: court ? /낮은 가격순/ : /최신순/ }).click(),
    ]);
    if (!court) await Promise.all([
      page.waitForResponse(response => response.url().includes(listApi) && response.url().includes("availableOnly=true") && response.ok()),
      page.getByRole("switch", { name: "참여가능 매칭" }).click(),
    ]);
    await ready(page);
    const expectedUrl = page.url();
    const listSize = await page.locator("a.rally-discovery-card").count();
    expect(listSize).toBeGreaterThanOrEqual(10);
    for (const browserBack of [false, true]) {
      const card = page.locator("a.rally-discovery-card").nth(8);
      await card.scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => scrollY);
      expect(before).toBeGreaterThan(500);
      const destination = await card.getAttribute("href");
      await card.click();
      await expect(page).toHaveURL(E2E_BASE_URL + destination); await ready(page);
      if (browserBack) await page.goBack(); else await back(page);
      await expect(page).toHaveURL(expectedUrl); await ready(page);
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before - 8);
      await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(before + 8);
      await expect(page.locator("a.rally-discovery-card")).toHaveCount(listSize);
    }
    await page.reload(); await ready(page);
    await expect(page).toHaveURL(expectedUrl);
    await expect(page.getByRole("button", { name: "혼복", exact: true })).toBeVisible();
    await page.goForward(); await ready(page);
    await expect(page).toHaveURL(court ? /\/partner-sessions\/[^?]+$/ : /\/matches\/[^?]+/);
    await page.goBack(); await ready(page);
    await expect(page).toHaveURL(expectedUrl);
    // 목록에서 내 활동에 들어간 뒤 탭을 바꾸어도 출발 목록의 조건과 위치를 복원한다.
    await page.locator("a.rally-discovery-card").nth(8).scrollIntoViewIfNeeded();
    const beforeActivity = await page.evaluate(() => scrollY);
    await page.getByRole("link", { name: court ? /내 신청 내역/ : "내 매칭", exact: !court }).click();
    await expect(page).toHaveURL(court ? /\/activity\/sent$/ : /\/activity\/received$/); await ready(page);
    await switchActivity(page, court ? "received" : "sent");
    await page.goBack(); await expect(page).toHaveURL(expectedUrl); await ready(page);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(beforeActivity - 8);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(beforeActivity + 8);
    await page.setViewportSize({ width: 320, height: 568 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("직접 진입은 안전한 기본 화면으로, 로그아웃 뒤 과거 페이지는 서버에서 다시 확인한다", async ({ page, context }) => {
  await resetE2eDatabase(); await signIn(context);
  await page.goto("/terms");
  await page.goto("/activity/sent"); await ready(page);
  await switchActivity(page, "received");
  await back(page); await expect(page).toHaveURL(/\/my$/);
  await page.goto("/activity/received"); await ready(page);
  await switchActivity(page, "sent");
  await back(page); await expect(page).toHaveURL(/\/my$/);
  await page.getByRole("link", { name: /내가 보낸 신청/ }).click();
  await back(page); await expect(page).toHaveURL(/\/my$/);
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).last().click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 15000 });
  await page.goBack();
  await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();
  await expect(page.getByText("E2E참가자", { exact: true })).toHaveCount(0);
  expect((await context.request.get("/api/v1/me")).status()).toBe(401);
});

test("약관·개인정보 목차 이동 후 뒤로가기는 목차를 거슬러 가지 않고 마이로 돌아간다", async ({ page, context }) => {
  await resetE2eDatabase(); await signIn(context);
  await page.goto("/my"); await ready(page);
  for (const [title, path] of [["서비스 이용약관", "/terms"], ["개인정보 처리방침", "/privacy"]]) {
    await page.getByRole("link", { name: title, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}\\?`));
    for (const index of [1, 2]) {
      await page.getByRole("navigation", { name: /목차/ }).getByRole("link").nth(index).click();
      await expect(page.locator(`#policy-section-${index + 1}`)).toBeInViewport();
    }
    if (path === "/terms") await page.goBack(); else await back(page);
    await expect(page).toHaveURL(/\/my$/); await ready(page);
  }
});

test("코트 매칭의 내 신청·찾아오는 길 바로가기 후에도 한 번에 신청 목록으로 돌아간다", async ({ page, context }) => {
  const fixture = await resetE2eDatabase(); await signIn(context);
  const detail = await context.request.get(`/api/v1/partner-session-slots/${fixture.partnerSlotId}`);
  expect(detail.ok()).toBe(true);
  const slot = await detail.json();
  const apply = await context.request.post(`/api/v1/court-matches/${fixture.partnerMatchId}/applications`, {
    data: { noticeAccepted: true, noticeFingerprint: slot.participation.applicationNotice.fingerprint },
  });
  expect(apply.status(), await apply.text()).toBe(201);
  const application = await apply.json();
  for (const confirmed of [false, true]) {
    if (confirmed) await db.matchApplication.update({ where: { id: application.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
    await page.goto("/activity/sent"); await ready(page);
    await page.locator(`a[href^="/partner-sessions/${fixture.partnerSlotId}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/partner-sessions/${fixture.partnerSlotId}`)); await ready(page);
    await page.getByRole("link", { name: confirmed ? "찾아오는 길" : "입금 안내 확인", exact: true }).click();
    await expect(page.locator(confirmed ? "#court-directions" : "#my-application")).toBeInViewport();
    if (confirmed) await page.goBack(); else await back(page);
    await expect(page).toHaveURL(/\/activity\/sent$/); await ready(page);
  }
});

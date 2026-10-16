import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { PrismaClient } from "@/generated/prisma/client";
import { createPrismaPg } from "../../src/server/db/prisma-adapter";
import { E2E_AUTH_SECRET, E2E_BASE_URL, requireE2eDatabaseUrl } from "./e2e-environment";
import { disconnectE2eDatabase, e2eUsers, resetE2eDatabase } from "./fixtures";

const db = new PrismaClient({ adapter: createPrismaPg(requireE2eDatabaseUrl()) });
test.afterAll(async () => { await db.$disconnect(); await disconnectE2eDatabase(); });
async function signIn(context: BrowserContext) {
  const userId = e2eUsers.applicant.id;
  const value = await encode({ token: { sub: userId, userId }, secret: E2E_AUTH_SECRET, salt: "authjs.session-token", maxAge: 3600 });
  await context.addCookies([{ name: "authjs.session-token", value, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
}
const back = (page: Page) => page.getByRole("button", { name: "이전 화면으로 돌아가기", exact: true }).click();
const ready = (page: Page) => expect(page.locator("[data-navigation-loading]")).toHaveCount(0);

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
  await back(page);
  await expect(page).toHaveURL(/\/my\/notifications$/); await ready(page);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before - 8);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(before + 8);
  await back(page); await expect(page).toHaveURL(/\/my$/);
  await page.getByRole("link", { name: /내가 보낸 신청/ }).click();
  await expect(page).toHaveURL(/\/activity\/sent$/);
  await back(page); await expect(page).toHaveURL(/\/my$/);
});

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
    await page.setViewportSize({ width: 320, height: 568 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("직접 진입은 안전한 기본 화면으로, 로그아웃 뒤 과거 페이지는 서버에서 다시 확인한다", async ({ page, context }) => {
  await resetE2eDatabase(); await signIn(context);
  await page.goto("/terms");
  await page.goto("/activity/sent"); await ready(page);
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

test("약관 목차와 이전 화면은 각각 원래 경로를 유지한다", async ({ page, context }) => {
  await resetE2eDatabase(); await signIn(context);
  await page.goto("/my"); await ready(page);
  await page.getByRole("link", { name: "서비스 이용약관", exact: true }).click();
  await expect(page).toHaveURL(/\/terms\?/);
  const destination = page.url();
  await page.getByRole("navigation", { name: /목차/ }).getByRole("link").nth(1).click();
  await expect(page.locator("#policy-section-2")).toBeInViewport();
  // An anchor traversal does not load another document (WebKit emits no load event).
  await page.evaluate(() => history.back()); await expect(page).toHaveURL(destination);
  await back(page); await expect(page).toHaveURL(/\/my$/);
});

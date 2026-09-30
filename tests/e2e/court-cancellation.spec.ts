import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { encode } from "next-auth/jwt";
import { expect, test, type Browser } from "@playwright/test";
import { PrismaClient } from "@/generated/prisma/client";
import { E2E_AUTH_SECRET, E2E_BASE_URL, requireE2eDatabaseUrl } from "./e2e-environment";
import { disconnectE2eDatabase, e2eUsers, resetE2eDatabase, type E2eFixture } from "./fixtures";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: requireE2eDatabaseUrl() }) });
let fixture: E2eFixture;
test.beforeEach(async () => { fixture = await resetE2eDatabase(); });
test.afterAll(async () => { await prisma.$disconnect(); await disconnectE2eDatabase(); });

async function session(browser: Browser, id: string) {
  const context = await browser.newContext({ baseURL: E2E_BASE_URL, viewport: { width: 390, height: 844 }, hasTouch: true });
  const value = await encode({ token: { sub: id, userId: id }, secret: E2E_AUTH_SECRET, salt: "authjs.session-token", maxAge: 3600 });
  await context.addCookies([{ name: "authjs.session-token", value, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
  return context;
}

for (const failRefresh of [false, true]) {
  test(`취소 금액 변경은 다시 확인받는다 · 재조회 ${failRefresh ? "실패 후 재시도" : "성공"}`, async ({ browser, request }) => {
    const member = await session(browser, e2eUsers.applicant.id);
    const operator = await session(browser, e2eUsers.operator.id);
    try {
      const now = new Date();
      const application = await prisma.matchApplication.create({ data: {
        matchId: fixture.partnerMatchId, applicantUserId: e2eUsers.applicant.id,
        applicantGender: "FEMALE", status: "CONFIRMED", profileSnapshot: {}, profileSnapshotVersion: 1,
        confirmedAt: now, receivedAmountKrw: 36000, feeReceivedAt: now, lastReceivedAt: now, receiptVersion: 1,
      } });
      const endpoint = `/api/v1/court-match-applications/${application.id}/cancel`;
      expect((await request.get(endpoint)).status()).toBe(401);
      expect((await request.post(endpoint, { data: {} })).status()).toBe(401);
      expect((await operator.request.get(endpoint)).status()).toBe(404);
      expect((await member.request.post(endpoint, { data: {} })).status()).toBe(422);
      expect((await member.request.post(endpoint)).status()).toBe(400);
      const page = await member.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`/partner-sessions/${fixture.partnerSlotId}`);
      await page.getByRole("button", { name: "참가 취소", exact: true }).click();
      const confirmation = page.getByRole("group", { name: "참가 취소 확인" });
      await expect(confirmation.getByText("36,000원", { exact: true })).toBeVisible();
      const receipt = await operator.request.post(`/api/v1/court-match-applications/${application.id}/receipt`, { data: {
        amountKrw: 40000, receivedAt: now.toISOString(), expectedVersion: 1, clientRequestId: randomUUID(), note: "추가 입금 대조",
      } });
      expect(receipt.ok(), await receipt.text()).toBeTruthy();
      if (failRefresh) {
        await page.route(`**${endpoint}`, async (route) => {
          if (route.request().method() === "GET") await route.fulfill({ status: 503, json: { error: { message: "최신 금액 조회에 실패했어요." } } });
          else await route.continue();
        });
      }
      const [changed] = await Promise.all([
        page.waitForResponse((r) => r.url().endsWith(endpoint) && r.request().method() === "POST"),
        confirmation.getByRole("button", { name: "참가 취소하기", exact: true }).click(),
      ]);
      expect(changed.status()).toBe(409);
      await expect(confirmation.getByRole("alert")).toContainText("아직 취소되지 않았어요");
      expect((await prisma.matchApplication.findUniqueOrThrow({ where: { id: application.id } })).status).toBe("CONFIRMED");
      expect(await prisma.notification.count({ where: { type: "COURT_MATCH_PARTICIPANT_CANCELLED" } })).toBe(0);
      if (failRefresh) {
        await expect(page.getByText("최신 금액 조회에 실패했어요.", { exact: true })).toBeVisible();
        await expect(confirmation.getByRole("button", { name: "변경 내용 확인 후 취소" })).toHaveCount(0);
        await expect(confirmation.getByText("36,000원", { exact: true })).toHaveCount(0);
        await page.unroute(`**${endpoint}`);
        await confirmation.getByRole("button", { name: "취소 금액 다시 확인" }).click();
      }
      await expect(confirmation.getByText("40,000원", { exact: true })).toBeVisible();
      await confirmation.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/tmp/rally-r08-reconfirmation-${failRefresh}.png` });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const [cancelled] = await Promise.all([
        page.waitForResponse((r) => r.url().endsWith(endpoint) && r.request().method() === "POST"),
        confirmation.getByRole("button", { name: "변경 내용 확인 후 취소" }).click(),
      ]);
      expect(cancelled.ok(), await cancelled.text()).toBeTruthy();
      await expect(page.getByRole("status").filter({ hasText: "참가를 취소했어요" })).toBeVisible();
      expect((await prisma.matchApplication.findUniqueOrThrow({ where: { id: application.id } })).status).toBe("CANCELLED");
      expect(errors).toEqual([]);
    } finally { await member.close(); await operator.close(); }
  });
}

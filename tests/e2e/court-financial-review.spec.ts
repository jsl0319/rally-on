import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@/generated/prisma/client";
import { createPrismaPg } from "../../src/server/db/prisma-adapter";
import { E2E_AUTH_SECRET, E2E_BASE_URL, requireE2eDatabaseUrl } from "./e2e-environment";
import { disconnectE2eDatabase, e2eUsers, resetE2eDatabase } from "./fixtures";

const prisma = new PrismaClient({ adapter: createPrismaPg(requireE2eDatabaseUrl()) });
test.afterAll(async () => { await prisma.$disconnect(); await disconnectE2eDatabase(); });

test("모바일 운영자 최종 대조·보존 기록과 오류 복구", async ({ browser }) => {
  test.setTimeout(120000);
  const fixture = await resetE2eDatabase();
  const a = await prisma.matchApplication.create({ data: { matchId: fixture.partnerMatchId, applicantUserId: e2eUsers.applicant.id,
    status: "WITHDRAWN", profileSnapshot: {}, receivedAmountKrw: 0, receiptVersion: 1, depositorName: "E2E 원문 유지" } });
  await prisma.courtReceiptRecord.create({ data: { applicationId: a.id, actorUserId: e2eUsers.operator.id, clientRequestId: randomUUID(), version: 1, previousAmountKrw: 0, amountKrw: 0, note: "은행 내역 직접 대조" } });
  const endpoint = `/api/v1/court-match-applications/${a.id}/financial-review`;
  const context = await browser.newContext({ baseURL: E2E_BASE_URL, viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  try {
    expect((await context.request.get(endpoint)).status()).toBe(401);
    const token = await encode({ token: { sub: e2eUsers.operator.id, userId: e2eUsers.operator.id }, secret: E2E_AUTH_SECRET, salt: "authjs.session-token", maxAge: 3600 });
    await context.addCookies([{ name: "authjs.session-token", value: token, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
    await page.goto(`/partner/court-matches/${fixture.partnerMatchId}`);
    const panel = page.locator(`#application-${a.id}`);
    await panel.getByText("최종 대조·보존 기록", { exact: true }).click();
    await expect(panel.getByText("은행 대조 미완료", { exact: true })).toBeVisible();
    const get = await context.request.get(endpoint);
    expect(get.headers()["cache-control"]).toBe("private, no-store");
    expect((await context.request.post(endpoint, { data: {} })).status()).toBe(422);
    await page.route(`**${endpoint}`, async (route) => {
      if (route.request().method() === "POST") { await route.fulfill({ status: 503, json: { error: { message: "일시적인 연결 오류" } } }); }
      else await route.continue();
    });
    await panel.getByRole("checkbox", { name: "누적 입금·반환" }).check();
    await panel.getByRole("button", { name: "대조 완료 기록", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("일시적인 연결 오류");
    await page.unroute(`**${endpoint}`);
    await panel.getByRole("button", { name: "대조 완료 기록", exact: true }).click();
    await expect(panel.getByText("은행 대조 완료", { exact: true }).first()).toBeVisible();
    await panel.getByText("보존 사유 추가", { exact: true }).click();
    await panel.getByRole("checkbox", { name: "입금자명", exact: true }).check();
    await panel.getByLabel("보존 사유", { exact: true }).fill("은행 입금 내역 확인을 위한 임시 보존");
    await panel.getByLabel("문의 번호·업무 참조").fill("CASE-E2E-01");
    await panel.getByLabel("재검토일 (한국 시간)").fill("2030-01-02T12:00");
    await panel.getByRole("button", { name: "보존 사유 저장" }).click();
    await expect(panel.getByText("보존 중", { exact: true })).toBeVisible();
    await panel.getByText("보존 사유 추가", { exact: true }).click();
    await panel.getByText("최종 대조·보존 기록", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/rally-financial-review-mobile.png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await panel.getByText("보존 사유 해제", { exact: true }).click();
    await panel.getByLabel("해제 근거", { exact: true }).fill("은행 대조와 문의 처리가 모두 끝나 해제");
    await panel.getByRole("button", { name: "보존 사유 해제 기록" }).click();
    await expect(panel.getByText("보존 중", { exact: true })).toHaveCount(0);
    await prisma.matchApplication.update({ where: { id: a.id }, data: { refundAccountVersion: { increment: 1 } } });
    await panel.getByRole("button", { name: "최신 기록 조회" }).click();
    await expect(panel.getByText("재대조 필요", { exact: true })).toBeVisible();
    expect(await prisma.courtFinancialReview.count({ where: { applicationId: a.id } })).toBe(3);
    expect((await prisma.matchApplication.findUniqueOrThrow({ where: { id: a.id } })).depositorName).toBe("E2E 원문 유지");
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

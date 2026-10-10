import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { expect, test, type Browser } from "@playwright/test";
import { PrismaClient } from "@/generated/prisma/client";
import { createPrismaPg } from "../../src/server/db/prisma-adapter";
import { E2E_AUTH_SECRET, E2E_BASE_URL, requireE2eDatabaseUrl } from "./e2e-environment";
import { disconnectE2eDatabase, e2eUsers, resetE2eDatabase, type E2eFixture } from "./fixtures";

const prisma = new PrismaClient({ adapter: createPrismaPg(requireE2eDatabaseUrl()) });
let fixture: E2eFixture;
test.beforeEach(async () => { fixture = await resetE2eDatabase(); });
test.afterAll(async () => { await prisma.$disconnect(); await disconnectE2eDatabase(); });
async function session(browser: Browser, userId: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const token = await encode({ token: { sub: userId, userId }, secret: E2E_AUTH_SECRET, salt: "authjs.session-token", maxAge: 3600 });
  await context.addCookies([{ name: "authjs.session-token", value: token, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, errors };
}
async function application(status: "ACCEPTED" | "CONFIRMED", confirmationDueAt = new Date(Date.now() + 3600000)) {
  return prisma.matchApplication.create({ data: {
    matchId: fixture.partnerMatchId, applicantUserId: e2eUsers.applicant.id, applicantGender: e2eUsers.applicant.gender,
    status, profileSnapshot: {}, profileSnapshotVersion: 1, depositCode: "901",
    paymentDueAt: new Date(Date.now() + 1800000), confirmationDueAt,
    ...(status === "CONFIRMED" ? { confirmedAt: new Date(), receivedAmountKrw: 36000, lastReceivedAt: new Date(), feeReceivedAt: new Date() } : {}),
  } });
}

test("입금 저장 한 번으로 참가 확정하고, 참가자는 복귀 시 갱신하며 통신 실패를 알린다", async ({ browser }) => {
  test.setTimeout(120000);
  const a = await application("ACCEPTED");
  const operator = await session(browser, e2eUsers.operator.id);
  const member = await session(browser, e2eUsers.applicant.id);
  try {
    await member.page.goto(`/partner-sessions/${fixture.partnerSlotId}`);
    await expect(member.page.getByText("입금 대기", { exact: true }).first()).toBeVisible();
    await operator.page.goto(`/partner/court-matches/${fixture.partnerMatchId}`);
    await operator.page.getByLabel("누적 수령 금액", { exact: true }).fill("36000");
    const at = new Date(Date.now() - 60000 + 9 * 3600000).toISOString().slice(0, 19);
    await operator.page.getByLabel("은행 수령 시각 (한국 시간)", { exact: true }).fill(at);
    await operator.page.getByLabel("대조·정정 사유", { exact: true }).fill("통장에서 식별코드와 참가비를 확인했습니다.");
    await operator.page.getByRole("button", { name: "입금 기록 및 참가 확정", exact: true }).click();
    await expect(operator.page.getByText("참가 확정 1명", { exact: true })).toBeVisible();
    expect(await prisma.matchApplication.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ status: "CONFIRMED", receiptVersion: 1 });
    await member.page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(member.page.getByText("참가 확정", { exact: true }).first()).toBeVisible();
    const endpoint = `**/api/v1/partner-session-slots/${fixture.partnerSlotId}`;
    await member.page.route(endpoint, (route) => route.fulfill({ status: 503, json: { error: { message: "테스트 연결 실패" } } }));
    await member.page.getByRole("button", { name: "최신 상태 확인", exact: true }).click();
    await expect(member.page.getByRole("alert").filter({ hasText: "아래는 이전 정보" })).toBeVisible();
    await member.page.unroute(endpoint);
    await member.page.getByRole("button", { name: "최신 상태 확인", exact: true }).click();
    await expect(member.page.getByText("아래는 이전 정보", { exact: false })).toHaveCount(0);
    await operator.page.screenshot({ path: "/tmp/rally-cron-receipt-mobile.png", fullPage: true });
    expect(await operator.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(operator.errors.concat(member.errors)).toEqual([]);
  } finally { await operator.context.close(); await member.context.close(); }
});

test("열어 둔 운영자 화면은 확인 기한에 만료 상태를 새로 조회한다", async ({ browser }) => {
  const a = await application("ACCEPTED");
  const operator = await session(browser, e2eUsers.operator.id);
  try {
    // Warm up the route before starting the short real deadline.
    await operator.page.goto(`/partner/court-matches/${fixture.partnerMatchId}`);
    await expect(operator.page.getByText("입금 대기 1명", { exact: true })).toBeVisible();
    await prisma.matchApplication.update({ where: { id: a.id }, data: { paymentDueAt: new Date(Date.now() - 1000), confirmationDueAt: new Date(Date.now() + 5000) } });
    await operator.page.getByRole("button", { name: "최신 상태 확인", exact: true }).click();
    await expect(operator.page.getByText("입금 기한 만료", { exact: true })).toBeVisible({ timeout: 15000 });
    expect(operator.errors).toEqual([]);
  } finally { await operator.context.close(); }
});

test("시작 후 미판정 경기는 근거를 기록하기 전에는 취소하지 않는다", async ({ browser, request }) => {
  await application("CONFIRMED");
  const startsAt = new Date(Date.now() - 3 * 3600000);
  const endsAt = new Date(Date.now() - 3600000);
  await prisma.match.update({ where: { id: fixture.partnerMatchId }, data: { startsAt, endsAt, courtCompositionPolicyVersion: 1 } });
  await prisma.courtSlot.update({ where: { id: fixture.partnerSlotId }, data: { startsAt, endsAt } });
  const endpoint = `/api/v1/operator/court-matches/${fixture.partnerMatchId}/late-review`;
  expect((await request.post(endpoint, { data: {} })).status()).toBe(401);
  const operator = await session(browser, e2eUsers.operator.id);
  try {
    await operator.page.goto(`/partner/court-matches/${fixture.partnerMatchId}`);
    await expect(operator.page.getByText("실제 진행 여부 확인 필요", { exact: true })).toBeVisible();
    expect(await prisma.match.findUniqueOrThrow({ where: { id: fixture.partnerMatchId } })).not.toMatchObject({ status: "CANCELLED" });
    expect((await operator.context.request.post(endpoint, { data: { expectedVersion: 1, clientRequestId: randomUUID(), outcome: "NOT_PROVIDED", note: "짧음" } })).status()).toBe(422);
    await operator.page.getByLabel("확인 결과", { exact: true }).selectOption("NOT_PROVIDED");
    await operator.page.getByLabel("확인 근거", { exact: true }).fill("현장과 참가자에게 연락해 실제 제공하지 못한 사실을 확인했습니다.");
    await operator.page.screenshot({ path: "/tmp/rally-cron-late-review-mobile.png", fullPage: true });
    await operator.page.getByRole("button", { name: "확인 결과 저장", exact: true }).click();
    await expect(operator.page.getByText("운영자가 실제 미제공을 확인해 취소했어요.", { exact: true })).toBeVisible();
    expect(operator.errors).toEqual([]);
  } finally { await operator.context.close(); }
});

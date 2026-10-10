import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { expect, test, type Browser } from "@playwright/test";
import { PrismaClient } from "@/generated/prisma/client";
import { createPrismaPg } from "../../src/server/db/prisma-adapter";
import { E2E_AUTH_SECRET, E2E_BASE_URL, requireE2eDatabaseUrl } from "./e2e-environment";
import { disconnectE2eDatabase, e2eUsers, resetE2eDatabase } from "./fixtures";

const prisma = new PrismaClient({ adapter: createPrismaPg(requireE2eDatabaseUrl()) });
test.afterAll(async () => { await prisma.$disconnect(); await disconnectE2eDatabase(); });
const localInput = (date: Date) => new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 19);
async function session(browser: Browser, id: string) {
  const context = await browser.newContext({ baseURL: E2E_BASE_URL, viewport: { width: 390, height: 844 }, hasTouch: true });
  const token = await encode({ token: { sub: id, userId: id }, secret: E2E_AUTH_SECRET, salt: "authjs.session-token", maxAge: 3600 });
  await context.addCookies([{ name: "authjs.session-token", value: token, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
  return context;
}

test("모바일 합의 반환 · 오류 재시도 → 본인 계좌 → 송금 결과, 기존 참가 유지", async ({ browser, request }) => {
  test.setTimeout(120000);
  const f = await resetE2eDatabase();
  const startsAt = new Date(Date.now() - 3600000), endsAt = new Date(Date.now() + 3600000);
  await prisma.courtSlot.update({ where: { id: f.partnerSlotId }, data: { startsAt, endsAt, minParticipantCount: 1 } });
  await prisma.match.update({ where: { id: f.partnerMatchId }, data: { startsAt, endsAt, status: "CLOSED", courtCompositionPassedAt: new Date(startsAt.getTime() - 3600000) } });
  const receivedAt = new Date(startsAt.getTime() - 4 * 3600000);
  const a = await prisma.matchApplication.create({ data: { matchId: f.partnerMatchId, applicantUserId: e2eUsers.applicant.id,
    applicantGender: "FEMALE", status: "CONFIRMED", confirmedAt: receivedAt, profileSnapshot: {},
    receivedAmountKrw: 36000, receiptVersion: 1, lastReceivedAt: receivedAt, feeReceivedAt: receivedAt,
  } });
  const endpoint = `/api/v1/court-match-applications/${a.id}/refund-agreement`;
  const op = await session(browser, e2eUsers.operator.id), member = await session(browser, e2eUsers.applicant.id);
  const errors: string[] = [];
  try {
    expect((await request.post(endpoint, { data: {} })).status()).toBe(401);
    const input = { clientRequestId: randomUUID(), expectedVersion: 0, expectedReceiptVersion: 1, amountKrw: 9000,
      incidentAt: new Date(startsAt.getTime() + 1800000).toISOString(), note: "우천으로 일부 이용하지 못하여 전화로 합의", agreementConfirmed: true };
    expect((await member.request.post(endpoint, { data: input })).status()).toBe(403);
    expect((await op.request.post(endpoint, { data: {} })).status()).toBe(422);
    expect((await op.request.post(endpoint, { data: { ...input, incidentAt: endsAt.toISOString() } })).status()).toBe(409);
    const page = await op.newPage(); page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/partner/court-matches/${f.partnerMatchId}`);
    const panel = page.locator(`#application-${a.id}`);
    await panel.getByText("합의 반환 금액 기록", { exact: true }).click();
    await panel.getByLabel("문제 발생 시각 (한국 시간)").fill(localInput(new Date(input.incidentAt)));
    await panel.getByLabel("합의한 참가비 반환 총액").fill("9000");
    await panel.getByLabel("합의 사유").fill(input.note);
    await panel.getByRole("checkbox", { name: "참가자와 위 금액" }).check();
    // 서버 커밋 후 응답 유실: 같은 요청 재전송에도 기록과 알림은 하나다.
    let lost = true;
    await page.route(`**${endpoint}`, async (route) => {
      if (lost) { lost = false; await route.fetch(); await route.fulfill({ status: 503, json: { error: { message: "응답을 확인하지 못했어요. 재시도해 주세요." } } }); }
      else await route.continue();
    });
    await panel.getByRole("button", { name: "합의 금액 기록 · 9,000원" }).click();
    await expect(panel.getByRole("alert")).toContainText("재시도");
    await panel.getByRole("button", { name: "합의 금액 기록 · 9,000원" }).click();
    await expect(panel.getByText("참가자의 환불 계좌 입력을 기다리고 있어요.")).toBeVisible();
    expect(await prisma.courtRefundAgreement.count({ where: { applicationId: a.id } })).toBe(1);
    await panel.getByText("합의 반환 기록", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/rally-agreement-operator-mobile.png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const participant = await member.newPage(); participant.on("pageerror", (error) => errors.push(error.message));
    await participant.goto(`/partner-sessions/${f.partnerSlotId}`);
    await expect(participant.getByText(input.note, { exact: true })).toBeVisible();
    await participant.getByLabel("은행", { exact: true }).fill("검증 은행");
    await participant.getByLabel("계좌번호", { exact: true }).fill("123456789");
    await participant.getByLabel("예금주", { exact: true }).fill("검증 참가자");
    await participant.getByRole("button", { name: "환불 계좌 저장" }).click();
    await expect(participant.getByRole("status")).toContainText("환불 계좌를 저장했어요");
    await participant.getByText("합의 반환 기록", { exact: true }).scrollIntoViewIfNeeded();
    await participant.screenshot({ path: "/tmp/rally-agreement-participant-mobile.png" });
    expect(await participant.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.reload();
    await panel.getByRole("button", { name: "환불 처리 시작 · 9,000원" }).click();
    await expect(panel.getByText("송금 처리 중 · 9,000원", { exact: true })).toBeVisible();
    await panel.getByLabel("실제 송금 시각 (한국 시간)").fill(localInput(new Date()));
    await panel.getByLabel("처리 근거·메모").fill("은행 송금 내역 확인 완료");
    await panel.getByRole("button", { name: "송금 결과 저장" }).click();
    await expect(panel.getByText("송금 완료 기록 · 9,000원", { exact: true })).toBeVisible();
    await participant.reload();
    await expect(participant.getByText("9,000원 · 송금 완료 기록", { exact: true })).toBeVisible();
    expect(await prisma.matchApplication.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ status: "CONFIRMED", receivedAmountKrw: 36000, agreedRefundAmountKrw: 9000, refundAgreementVersion: 1 });
    await prisma.user.update({ where: { id: e2eUsers.applicant.id }, data: { status: "WITHDRAWN", withdrawnAt: new Date() } });
    await participant.goto("/account/transactions");
    await expect(participant.getByRole("heading", { name: "내 거래 정리" })).toBeVisible();
    await expect(participant.getByText(input.note, { exact: true })).toBeVisible();
    expect((await member.request.get("/api/v1/me")).status()).toBe(403);
    expect(errors).toEqual([]);
  } finally { await op.close(); await member.close(); }
});

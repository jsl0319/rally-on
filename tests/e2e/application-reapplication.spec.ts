import { expect, test, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { PrismaClient } from "@/generated/prisma/client";
import { createPrismaPg } from "../../src/server/db/prisma-adapter";
import { E2E_AUTH_SECRET, E2E_BASE_URL, requireE2eDatabaseUrl } from "./e2e-environment";
import { disconnectE2eDatabase, e2eUsers, resetE2eDatabase } from "./fixtures";
const prisma = new PrismaClient({ adapter: createPrismaPg(requireE2eDatabaseUrl()) });
test.afterAll(async () => { await prisma.$disconnect(); await disconnectE2eDatabase(); });
async function signIn(context: BrowserContext) {
  const value = await encode({ token: { sub: e2eUsers.applicant.id, userId: e2eUsers.applicant.id }, secret: E2E_AUTH_SECRET, salt: "authjs.session-token", maxAge: 3600 });
  await context.addCookies([{ name: "authjs.session-token", value, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
}
async function courtApply(context: BrowserContext, slotId: string, matchId: string) {
  const { participation } = await (await context.request.get(`/api/v1/partner-session-slots/${slotId}`)).json();
  const response = await context.request.post(`/api/v1/court-matches/${matchId}/applications`, { data: { noticeAccepted: true, noticeFingerprint: participation.applicationNotice.fingerprint } });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

test("보낸 신청은 서비스 유형을 구분하고 일반·코트 철회 후 목록에서 재신청한다", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await resetE2eDatabase(); await signIn(context);
  const startsAt = new Date(Date.now() + 48 * 3600000);
  const normal = await prisma.match.create({ data: { hostUserId: e2eUsers.host.id, clientRequestId: randomUUID(), title: f.matchTitle, externalCourtName: "E2E 랠리 테니스장", externalCourtAddress: "서울 마포구 랠리로", startsAt, endsAt: new Date(startsAt.getTime() + 2 * 3600000), courtSource: "EXTERNAL_RESERVED", recruitCount: 3, totalCourtFeeKrw: 20000, partnerPreference: "COMPLETE_BEGINNER_WELCOME" } });
  await context.request.post(`/api/v1/matches/${normal.id}/applications`, { data: { message: "함께 연습하고 싶어요" } });
  const first = await courtApply(context, f.partnerSlotId, f.partnerMatchId);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/activity/sent");
  const general = page.locator("article").filter({ hasText: normal.externalCourtName! });
  await expect(general.getByText("매칭", { exact: true })).toBeVisible();
  const court = page.locator("article").filter({ hasText: "코트 매칭" });
  await expect(court.getByText("입금 대기", { exact: true })).toBeVisible();
  await page.screenshot({ path: "/private/tmp/rally-application-sent.png", fullPage: true, style: ".fixed { position: static !important; }" });
  await general.getByRole("button", { name: "신청 철회", exact: true }).click();
  await page.getByRole("button", { name: "네, 철회할게요", exact: true }).click();
  await expect(general.getByRole("link", { name: "다시 신청하기", exact: true })).toBeVisible();
  await page.goto("/");
  await page.getByRole("link").filter({ hasText: normal.externalCourtName! }).first().click();
  await page.getByRole("button", { name: "다시 신청하기", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "신청 보내기", exact: true }).click();
  await expect.poll(() => prisma.matchApplication.count({ where: { matchId: normal.id, applicantUserId: e2eUsers.applicant.id } })).toBe(2);
  await page.goto(`/partner-sessions/${f.partnerSlotId}`);
  await page.getByRole("button", { name: "신청 철회", exact: true }).click();
  await page.getByRole("button", { name: "참가 취소하기", exact: true }).click();
  await expect(page.getByRole("button", { name: "다시 신청하기", exact: true })).toBeVisible();
  await page.goto("/partner-sessions");
  await page.getByRole("link").filter({ hasText: "E2E 준비된 테니스장" }).click();
  await page.getByRole("button", { name: "다시 신청하기", exact: true }).click();
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page.getByRole("dialog").getByRole("button", { name: "신청 보내기", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const latest = await prisma.matchApplication.findFirstOrThrow({ where: { matchId: f.partnerMatchId, status: "ACCEPTED" } });
  expect(latest.id).not.toBe(first.id);
  await expect(page.getByRole("heading", { name: "입금 대기", exact: true })).toBeVisible();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: "/private/tmp/rally-application-payment.png", fullPage: true, style: ".fixed { position: static !important; }" });
  const map = page.getByRole("button", { name: "카카오맵 길찾기", exact: true });
  expect(await map.evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(254, 229, 0)");
  for (const width of [320, 375, 430]) {
    await page.setViewportSize({ width, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("재신청 뒤에도 이전 환불 계좌와 문의는 이전 신청에 연결된다", async ({ page, context }) => {
  const f = await resetE2eDatabase(); await signIn(context);
  const first = await courtApply(context, f.partnerSlotId, f.partnerMatchId);
  const cancel = `/api/v1/court-match-applications/${first.id}/cancel`;
  const preview = await (await context.request.get(cancel)).json();
  expect((await context.request.post(cancel, { data: { cancellationFingerprint: preview.fingerprint } })).ok()).toBe(true);
  await courtApply(context, f.partnerSlotId, f.partnerMatchId);
  // 늦게 대조된 이전 입금. 화면은 원 신청의 반환 계좌를 받아야 한다.
  await prisma.matchApplication.update({ where: { id: first.id }, data: { receivedAmountKrw: 36000, lastReceivedAt: new Date(), feeReceivedAt: new Date() } });
  await page.goto(`/partner-sessions/${f.partnerSlotId}`);
  await expect(page.getByRole("link", { name: "이전 신청의 환불이 남아 있어요 →", exact: true })).toBeVisible();
  const previous = page.locator(`#application-${first.id}`);
  await expect(previous).toHaveAttribute("open", "");
  await previous.getByLabel("은행", { exact: true }).fill("테스트은행");
  await previous.getByLabel("계좌번호", { exact: true }).fill("123456789");
  await previous.getByLabel("예금주", { exact: true }).fill("테스트참가자");
  await previous.getByRole("button", { name: "환불 계좌 저장", exact: true }).click();
  await expect(previous.getByRole("status")).toContainText("환불 계좌를 저장했어요");
  expect(await prisma.matchApplication.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ status: "WITHDRAWN", refundAccountNumber: "123456789" });
  const current = await prisma.matchApplication.findFirstOrThrow({ where: { matchId: f.partnerMatchId, status: "ACCEPTED" } });
  expect(current.refundAccountNumber).toBeNull();
  await previous.getByRole("link", { name: "입금·환불 문의", exact: true }).click();
  await page.getByLabel("문의 내용", { exact: true }).fill("이전 신청에서 환불이 언제 되는지 궁금해요.");
  await page.getByRole("button", { name: "문의 보내기", exact: true }).click();
  await expect.poll(() => prisma.supportInquiry.count({ where: { applicationId: first.id } })).toBe(1);
  await page.goto(`/partner-sessions/${f.partnerSlotId}#application-${first.id}`);
  await expect(previous).toHaveAttribute("open", "");
});

test("코트 입금 확인·참가 확정 화면은 상태를 먼저 보여주고 반복 이체 정보를 접는다", async ({ page, context }) => {
  const f = await resetE2eDatabase(); await signIn(context);
  const a = await courtApply(context, f.partnerSlotId, f.partnerMatchId);
  await prisma.matchApplication.update({ where: { id: a.id }, data: { depositClaimedAt: new Date(), depositorName: "입금완료참가자" } });
  await page.goto(`/partner-sessions/${f.partnerSlotId}`);
  await expect(page.getByRole("heading", { name: "입금 확인 중", exact: true })).toBeVisible();
  await expect(page.getByLabel("실제로 보낸 입금자명", { exact: true })).toBeHidden();
  await page.getByText("입금 정보 확인·수정", { exact: true }).click();
  await expect(page.getByLabel("실제로 보낸 입금자명", { exact: true })).toHaveValue("입금완료참가자");
  await prisma.matchApplication.update({ where: { id: a.id }, data: { status: "CONFIRMED", confirmedAt: new Date(), receivedAmountKrw: 36000, feeReceivedAt: new Date() } });
  await page.reload();
  await expect(page.getByRole("heading", { name: "참가 확정", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "입금했어요", exact: true })).toHaveCount(0);
  await page.screenshot({ path: "/private/tmp/rally-application-confirmed.png", fullPage: true, style: ".fixed { position: static !important; }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

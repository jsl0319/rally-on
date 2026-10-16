import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { expect, test, type Browser } from "@playwright/test";
import { PrismaClient } from "@/generated/prisma/client";
import { createPrismaPg } from "../../src/server/db/prisma-adapter";
import { E2E_AUTH_SECRET, E2E_BASE_URL, requireE2eDatabaseUrl } from "./e2e-environment";
import { disconnectE2eDatabase, e2eUsers, resetE2eDatabase } from "./fixtures";

const prisma = new PrismaClient({ adapter: createPrismaPg(requireE2eDatabaseUrl()) });
test.afterAll(async () => { await prisma.$disconnect(); await disconnectE2eDatabase(); });

async function session(browser: Browser, userId: string, errors: string[]) {
  const context = await browser.newContext({ baseURL: E2E_BASE_URL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const value = await encode({ token: { sub: userId, userId }, secret: E2E_AUTH_SECRET, salt: "authjs.session-token", maxAge: 3600 });
  await context.addCookies([{ name: "authjs.session-token", value, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  return { context, page };
}

test("프로필 없는 운영자와 확정 참가자가 같은 단체방에서 송수신한다", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const fixture = await resetE2eDatabase();
  await prisma.tennisProfile.delete({ where: { userId: e2eUsers.operator.id } });
  await prisma.user.update({ where: { id: e2eUsers.operator.id }, data: { onboardingCompletedAt: null } });
  const errors: string[] = [];
  const operator = await session(browser, e2eUsers.operator.id, errors);
  const member = await session(browser, e2eUsers.applicant.id, errors);
  const outsider = await session(browser, e2eUsers.outsider.id, errors);
  const path = `/chats/${fixture.partnerMatchId}`;
  const api = `/api/v1/matches/${fixture.partnerMatchId}/conversation`;
  try {
    await operator.page.goto("/partner");
    await operator.page.getByRole("link", { name: "단체 채팅 →", exact: true }).click();
    await expect(operator.page).toHaveURL(/\/chats$/);
    await expect(operator.page.getByText("아직 채팅할 매칭이 없어요", { exact: true })).toBeVisible();

    const detail = await member.context.request.get(`/api/v1/partner-session-slots/${fixture.partnerSlotId}`);
    expect(detail.ok(), await detail.text()).toBeTruthy();
    const slot = await detail.json();
    const apply = await member.context.request.post(`/api/v1/court-matches/${fixture.partnerMatchId}/applications`, {
      data: { noticeAccepted: true, noticeFingerprint: slot.participation.applicationNotice.fingerprint },
    });
    expect(apply.status(), await apply.text()).toBe(201);
    const application = await apply.json();
    // 자동 승인도 입금 전에는 단체방에 입장시키지 않는다.
    expect((await member.context.request.get(api)).status()).toBe(404);
    await operator.page.goto(`/partner/court-matches/${fixture.partnerMatchId}`);
    await expect(operator.page.getByText("첫 참가자가 확정되면 단체 채팅방이 열려요.", { exact: true })).toBeVisible();
    await expect(operator.page.getByRole("link", { name: "단체 채팅방", exact: true })).toHaveCount(0);
    await member.page.goto(`/partner-sessions/${fixture.partnerSlotId}`);
    await expect(member.page.getByText("참가가 확정되면 운영자·참가자와 단체 채팅을 할 수 있어요.", { exact: true })).toBeVisible();

    // 가짜 은행 기록을 로컬 E2E DB에만 입력한다. 저장 시 실제 확정 로직이 방을 생성한다.
    const receipt = await operator.context.request.post(`/api/v1/court-match-applications/${application.id}/receipt`, {
      data: { amountKrw: 36000, receivedAt: new Date().toISOString(), expectedVersion: 0, clientRequestId: randomUUID(), note: "E2E 채팅 검증용 대조" },
    });
    expect(receipt.ok(), await receipt.text()).toBeTruthy();
    expect(await prisma.matchApplication.findUniqueOrThrow({ where: { id: application.id } })).toMatchObject({ status: "CONFIRMED" });
    await operator.page.reload();
    await operator.page.getByRole("link", { name: "단체 채팅방", exact: true }).click();
    await expect(operator.page).toHaveURL(new RegExp(`${path}$`));
    await expect(operator.page.getByText("운영자와 함께 · 2명", { exact: true })).toBeVisible();
    await member.page.reload();
    await member.page.getByRole("link", { name: "단체 채팅방", exact: true }).click();

    const send = async (actor: typeof operator, message: string) => {
      await actor.page.getByLabel("메시지", { exact: true }).fill(message);
      const [response] = await Promise.all([
        actor.page.waitForResponse(r => r.url().endsWith(`${api}/messages`) && r.request().method() === "POST"),
        actor.page.getByRole("button", { name: "보내기", exact: true }).click(),
      ]);
      expect(response.ok(), await response.text()).toBeTruthy();
    };
    await send(operator, "1번 코트에서 만나요");
    await expect(member.page.getByText("1번 코트에서 만나요", { exact: true })).toBeVisible({ timeout: 12_000 });
    await expect(member.page.getByText("E2E운영자", { exact: true })).toBeVisible();
    await expect(member.page.getByText("운영자", { exact: true })).toBeVisible();
    await send(member, "네, 도착하면 말씀드릴게요");
    await expect(operator.page.getByText("네, 도착하면 말씀드릴게요", { exact: true })).toBeVisible({ timeout: 12_000 });
    await expect(operator.page.getByText("E2E참가자", { exact: true })).toBeVisible();
    expect(await prisma.matchChatMessage.count({ where: { conversation: { matchId: fixture.partnerMatchId }, type: "USER" } })).toBe(2);
    for (const width of [320, 390]) {
      await member.page.setViewportSize({ width, height: 844 });
      expect(await member.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await member.page.screenshot({ path: testInfo.outputPath(`court-chat-${width}.png`), fullPage: true });
    }

    await member.page.goto("/chats");
    const courtCard = member.page.getByRole("link").filter({ hasText: fixture.partnerMatchTitle });
    const generalCard = member.page.getByRole("link").filter({ hasText: "E2E 자리가 찬 매칭" });
    await expect(courtCard.getByText("코트 매칭", { exact: true })).toBeVisible();
    await expect(generalCard.getByText("매칭", { exact: true })).toBeVisible();
    await member.page.screenshot({ path: testInfo.outputPath("chat-list.png"), fullPage: true });
    expect((await outsider.context.request.get(`${api}/messages`)).status()).toBe(404);
    expect((await outsider.context.request.post(`${api}/messages`, { data: { body: "허용되지 않은 발신", clientRequestId: randomUUID() } })).status()).toBe(404);
    const anonymous = await browser.newContext({ baseURL: E2E_BASE_URL });
    try { expect((await anonymous.request.get(api)).status()).toBe(401); } finally { await anonymous.close(); }
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([operator.context.close(), member.context.close(), outsider.context.close()]);
  }
});

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

async function session(browser: Browser, id: string, errors: string[]) {
  const context = await browser.newContext({ baseURL: E2E_BASE_URL, viewport: { width: 390, height: 844 }, hasTouch: true });
  const value = await encode({ token: { sub: id, userId: id }, secret: E2E_AUTH_SECRET, salt: "authjs.session-token", maxAge: 3600 });
  await context.addCookies([{ name: "authjs.session-token", value, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page };
}

test("조건 변경은 재확인을 요구하고 신청 당시 안내는 본인과 운영자에게 보존된다", async ({ browser, request }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  const member = await session(browser, e2eUsers.applicant.id, errors);
  const operator = await session(browser, e2eUsers.operator.id, errors);
  try {
    const endpoint = `/api/v1/court-matches/${fixture.partnerMatchId}/applications`;
    expect((await request.post(endpoint, { data: {} })).status()).toBe(401);
    expect((await member.context.request.post(endpoint, { data: {} })).status()).toBe(422);
    await member.page.goto(`/partner-sessions/${fixture.partnerSlotId}`);
    await member.page.getByRole("button", { name: "같이 치기", exact: true }).click();
    const dialog = member.page.getByRole("dialog", { name: "같이 치기", exact: true });
    const submit = dialog.getByRole("button", { name: "신청 보내기", exact: true });
    const accepted = dialog.getByRole("checkbox", { name: "신청 조건과 취소·환불 안내를 확인했어요." });
    await expect(submit).toBeDisabled();
    await expect(dialog.getByText("본인 사유의 취소", { exact: true }).first()).toBeVisible();
    await expect(dialog.getByText("경기 취소와 반환", { exact: true }).first()).toBeVisible();
    await member.page.screenshot({ path: "/tmp/rally-r06-application-top-mobile.png" });
    await accepted.check();
    await prisma.courtSlot.update({ where: { id: fixture.partnerSlotId }, data: { usageNote: "변경된 안내: 테니스화 지참" } });
    const [changed] = await Promise.all([
      member.page.waitForResponse((r) => r.url().endsWith(endpoint) && r.request().method() === "POST"),
      submit.click(),
    ]);
    expect(changed.status()).toBe(409);
    await expect(dialog.getByRole("alert")).toContainText("신청 조건이 바뀌었어요");
    await expect(accepted).not.toBeChecked();
    await expect(submit).toBeDisabled();
    await expect(dialog.getByText("변경된 안내: 테니스화 지참", { exact: true })).toBeVisible();
    expect(await prisma.matchApplication.count({ where: { matchId: fixture.partnerMatchId } })).toBe(0);
    await accepted.check();
    await member.page.screenshot({ path: "/tmp/rally-r06-application-mobile.png", fullPage: true });
    const [applied] = await Promise.all([
      member.page.waitForResponse((r) => r.url().endsWith(endpoint) && r.request().method() === "POST"),
      submit.click(),
    ]);
    expect(applied.ok(), await applied.text()).toBeTruthy();
    await expect(dialog).toHaveCount(0);
    await expect(member.page.getByText("입금할 금액", { exact: true })).toBeVisible();
    const app = await prisma.matchApplication.findFirstOrThrow({ where: { matchId: fixture.partnerMatchId } });
    expect(app.courtNoticeAcceptedAt).toBeInstanceOf(Date);
    expect(app.profileSnapshot).toEqual({});
    await prisma.courtSlot.update({ where: { id: fixture.partnerSlotId }, data: { usageNote: "신청 후 변경한 안내" } });
    await member.page.reload();
    await member.page.getByText("신청 당시 확인한 안내", { exact: true }).click();
    await expect(member.page.getByText("변경된 안내: 테니스화 지참", { exact: true })).toBeVisible();
    await member.page.screenshot({ path: "/tmp/rally-r06-record-mobile.png", fullPage: true });
    await operator.page.goto(`/partner/court-matches/${fixture.partnerMatchId}`);
    await operator.page.getByText("신청 당시 확인한 안내", { exact: true }).click();
    await expect(operator.page.getByText("변경된 안내: 테니스화 지참", { exact: true })).toBeVisible();
    for (const page of [member.page, operator.page]) expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await member.context.close(); await operator.context.close(); }
});

test("운영자 승인 대기에도 확인 기록을 남기고 과거 신청에는 소급하지 않는다", async ({ browser }) => {
  const errors: string[] = [];
  const member = await session(browser, e2eUsers.applicant.id, errors);
  const oldMember = await session(browser, e2eUsers.host.id, errors);
  try {
    await prisma.courtSlot.update({ where: { id: fixture.partnerSlotId }, data: { approvalMode: "OPERATOR" } });
    await prisma.matchApplication.create({ data: { matchId: fixture.partnerMatchId, applicantUserId: e2eUsers.host.id, applicantGender: e2eUsers.host.gender, status: "PENDING", profileSnapshot: {}, profileSnapshotVersion: 1 } });
    await member.page.goto(`/partner-sessions/${fixture.partnerSlotId}`);
    await member.page.getByRole("button", { name: "같이 치기", exact: true }).click();
    const dialog = member.page.getByRole("dialog", { name: "같이 치기", exact: true });
    await dialog.getByLabel(/운영자에게 보낼 자기소개/).fill("천천히 함께 연습하고 싶어요.");
    await dialog.getByText("전체 신청·입금·환불 안내", { exact: true }).click();
    await expect(dialog.getByText(/운영자 승인 후 입금 기한을 안내해요/)).toBeVisible();
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "신청 보내기", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(member.page.getByText("승인 대기", { exact: true }).first()).toBeVisible();
    await expect(member.page.getByText("신청 당시 확인한 안내", { exact: true })).toBeVisible();
    const app = await prisma.matchApplication.findFirstOrThrow({ where: { matchId: fixture.partnerMatchId, applicantUserId: e2eUsers.applicant.id } });
    expect(app.paymentDueAt).toBeNull();
    expect(app.courtNoticeAcceptedAt).toBeInstanceOf(Date);
    expect(app.profileSnapshot).not.toEqual({});
    await oldMember.page.goto(`/partner-sessions/${fixture.partnerSlotId}`);
    await expect(oldMember.page.getByText("승인 대기", { exact: true }).first()).toBeVisible();
    await expect(oldMember.page.getByText("신청 당시 확인한 안내", { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await member.context.close(); await oldMember.context.close(); }
});

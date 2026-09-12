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

async function session(browser: Browser, id: string, errors: string[]) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const value = await encode({ token: { sub: id, userId: id }, secret: E2E_AUTH_SECRET, salt: "authjs.session-token", maxAge: 3600 });
  await context.addCookies([{ name: "authjs.session-token", value, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page };
}

test("혼복 구성 부족을 목록과 상세에 알리고 운영자 취소 뒤 전액 반환으로 이어진다", async ({ browser }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  const operator = await session(browser, e2eUsers.operator.id, errors);
  const member = await session(browser, e2eUsers.applicant.id, errors);
  const leaver = await session(browser, e2eUsers.reviewer.id, errors);
  try {
    const startsAt = new Date(Date.now() + 2 * 3600000);
    const endsAt = new Date(startsAt.getTime() + 2 * 3600000);
    const confirmedAt = new Date(Date.now() - 2 * 3600000);
    await prisma.courtSlot.update({ where: { id: fixture.partnerSlotId }, data: { startsAt, endsAt, minParticipantCount: 4, maxParticipantCount: 6, maleCapacity: 3, femaleCapacity: 3 } });
    await prisma.match.update({ where: { id: fixture.partnerMatchId }, data: { startsAt, endsAt, recruitCount: 6, maleRecruitCount: 3, femaleRecruitCount: 3, courtCompositionPolicyVersion: 1 } });
    let leaverId = "";
    for (const [index, user] of [e2eUsers.host, e2eUsers.outsider, e2eUsers.applicant, e2eUsers.reviewer].entries()) {
      const a = await prisma.matchApplication.create({ data: { matchId: fixture.partnerMatchId, applicantUserId: user.id, applicantGender: user.gender, status: "CONFIRMED", profileSnapshot: {}, profileSnapshotVersion: 1, confirmedAt, receivedAmountKrw: 36000, feeReceivedAt: confirmedAt, lastReceivedAt: confirmedAt, depositCode: String(501 + index) } });
      if (user.id === e2eUsers.reviewer.id) leaverId = a.id;
    }
    const cancel = await leaver.context.request.post(`${E2E_BASE_URL}/api/v1/court-match-applications/${leaverId}/cancel`);
    expect(cancel.ok(), await cancel.text()).toBeTruthy();
    await operator.page.goto("/partner/slots");
    await expect(operator.page.getByText("경기 구성 · 운영자 조치 필요", { exact: true })).toBeVisible();
    await operator.page.goto(`/partner/court-matches/${fixture.partnerMatchId}`);
    await expect(operator.page.getByText("운영자 조치 필요", { exact: true })).toBeVisible();
    await expect(operator.page.getByText("현재 확정 3명 · 남 2명 · 여 1명")).toBeVisible();
    await operator.page.getByText("경기 제공 불가 취소", { exact: true }).click();
    await operator.page.getByLabel("제공 불가 확인 근거", { exact: true }).fill("추가 모집과 참가자 연락 결과 보충 인원을 확보할 수 없음을 확인했습니다.");
    await operator.page.screenshot({ path: "/tmp/rally-r05-operator-mobile.png", fullPage: true });
    await member.page.goto(`/partner-sessions/${fixture.partnerSlotId}`);
    await expect(member.page.getByText("운영자 조치 필요", { exact: true })).toBeVisible();
    await member.page.getByRole("button", { name: "참가 취소", exact: true }).click();
    await expect(member.page.getByText(/아래 버튼은 본인 사유의 취소예요/)).toBeVisible();
    const [cancelled] = await Promise.all([
      operator.page.waitForResponse((r) => r.url().endsWith("/composition-cancel") && r.request().method() === "POST"),
      operator.page.getByRole("button", { name: "제공 불가로 취소 · 전액 반환", exact: true }).click(),
    ]);
    expect(cancelled.ok(), await cancelled.text()).toBeTruthy();
    await expect(operator.page.getByText("경기 구성 부족으로 코트 매칭이 취소됐어요.", { exact: true })).toBeVisible();
    await member.page.reload();
    await expect(member.page.getByText("경기 구성 부족으로 코트 매칭이 취소됐어요.", { exact: true })).toBeVisible();
    await expect(member.page.getByText(/36,000원/).first()).toBeVisible();
    await member.page.getByLabel("은행", { exact: true }).fill("E2E은행");
    await member.page.getByLabel("계좌번호", { exact: true }).fill("12345-678");
    await member.page.getByLabel("예금주", { exact: true }).fill("E2E참가자");
    await member.page.getByRole("button", { name: "환불 계좌 저장", exact: true }).click();
    await expect(member.page.getByText("환불 계좌를 저장했어요.", { exact: true })).toBeVisible();
    await member.page.screenshot({ path: "/tmp/rally-r05-participant-mobile.png", fullPage: true });
    expect(await prisma.courtMatchCompositionCancellation.count()).toBe(1);
    expect((await prisma.matchApplication.findUniqueOrThrow({ where: { id: leaverId } })).refundAmountKrw).toBe(0);
    for (const page of [operator.page, member.page]) expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await operator.context.close(); await member.context.close(); await leaver.context.close(); }
});

test("새 초안은 유형별 최소 인원을 제안하고 서버도 잘못된 혼복 구성을 거절한다", async ({ browser, request }) => {
  const errors: string[] = [];
  const operator = await session(browser, e2eUsers.operator.id, errors);
  try {
    const endpoint = `${E2E_BASE_URL}/api/v1/operator/court-matches/${fixture.partnerMatchId}/composition-cancel`;
    const data = { expectedVersion: 1, clientRequestId: randomUUID(), note: "경기 제공 불가를 확인했습니다." };
    expect((await request.post(endpoint, { data })).status()).toBe(401);
    expect((await operator.context.request.post(endpoint, { data: { ...data, note: "" } })).status()).toBe(422);
    await operator.page.goto("/partner/slots/new");
    await operator.page.getByRole("button", { name: "혼복", exact: true }).click();
    await expect(operator.page.getByLabel("최소 인원", { exact: true })).toHaveValue("4");
    await expect(operator.page.getByLabel("남자 정원", { exact: true })).toHaveValue("2");
    await expect(operator.page.getByLabel("여자 정원", { exact: true })).toHaveValue("2");
    await operator.page.getByRole("button", { name: "남복", exact: true }).click();
    await expect(operator.page.getByLabel("남자 정원", { exact: true })).toHaveValue("4");
    await expect(operator.page.getByLabel("여자 정원", { exact: true })).toHaveValue("0");
    const slot = await prisma.courtSlot.findUniqueOrThrow({ where: { id: fixture.partnerSlotId }, include: { courtUnit: true } });
    const rejected = await operator.context.request.post(`${E2E_BASE_URL}/api/v1/operator/courts/${slot.courtUnit.courtId}/slots`, { data: { courtUnitName: "새 코트", startsAt: "2030-01-02T01:00:00.000Z", endsAt: "2030-01-02T03:00:00.000Z", priceKrw: 12000, minParticipantCount: 1, maxParticipantCount: 4, gameType: "MIXED_DOUBLES", maleCapacity: 4, femaleCapacity: 0, approvalMode: "AUTO" } });
    expect(rejected.status(), await rejected.text()).toBe(422);
    expect(errors).toEqual([]);
  } finally { await operator.context.close(); }
});

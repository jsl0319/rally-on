import { PrismaPg } from "@prisma/adapter-pg";
import { encode } from "next-auth/jwt";
import { expect, test, type Browser } from "@playwright/test";
import { PrismaClient } from "@/generated/prisma/client";
import { E2E_AUTH_SECRET, E2E_BASE_URL, requireE2eDatabaseUrl } from "./e2e-environment";
import { disconnectE2eDatabase, e2eUsers, resetE2eDatabase } from "./fixtures";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: requireE2eDatabaseUrl() }) });
test.afterAll(async () => { await prisma.$disconnect(); await disconnectE2eDatabase(); });

async function session(browser: Browser, id: string, errors: string[]) {
  const context = await browser.newContext({ baseURL: E2E_BASE_URL, viewport: { width: 390, height: 844 }, hasTouch: true });
  const value = await encode({ token: { sub: id, userId: id }, secret: E2E_AUTH_SECRET, salt: "authjs.session-token", maxAge: 3600 });
  await context.addCookies([{ name: "authjs.session-token", value, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage(); page.on("pageerror", (error) => errors.push(error.message));
  return { context, page };
}

test("연락처 등록·공개 필수 검증과 신청 후 전화·변경·공개 중단을 모바일에서 연결한다", async ({ browser, request }) => {
  test.setTimeout(120000);
  const fixture = await resetE2eDatabase();
  const errors: string[] = [];
  const operator = await session(browser, e2eUsers.operator.id, errors);
  const member = await session(browser, e2eUsers.applicant.id, errors);
  const stranger = await session(browser, e2eUsers.host.id, errors);
  try {
    const slot = await prisma.courtSlot.update({ where: { id: fixture.partnerSlotId }, data: { approvalMode: "OPERATOR" }, include: { courtUnit: true } });
    const endpoint = `/api/v1/operator/courts/${slot.courtUnit.courtId}/contact`;
    const data = { phone: "02-1234-5678", hours: "매일 09:00~18:00", publicationAgreed: true, expectedVersion: 0 };
    expect((await request.put(endpoint, { data })).status()).toBe(401);
    expect((await stranger.context.request.put(endpoint, { data })).status()).toBe(404);
    expect((await operator.context.request.put(endpoint, { data: { ...data, publicationAgreed: false } })).status()).toBe(422);
    const create = await operator.context.request.post(`/api/v1/operator/courts/${slot.courtUnit.courtId}/slots`, { data: { courtUnitName: "연락 테스트 코트", startsAt: "2030-01-02T01:00:00Z", endsAt: "2030-01-02T03:00:00Z", priceKrw: 12000, maxParticipantCount: 2, minParticipantCount: 2, gameType: "OTHER", approvalMode: "AUTO", serviceScope: { balls: true, equipment: false, lesson: false, facilitator: false } } });
    expect(create.ok(), await create.text()).toBeTruthy();
    const draft = await create.json();
    const publishUrl = `/api/v1/operator/slots/${draft.id}/publish`;
    const blocked = await operator.context.request.post(publishUrl);
    expect(blocked.status()).toBe(409);
    expect((await blocked.json()).error.code).toBe("COURT_CONTACT_REQUIRED");

    await operator.page.goto("/partner/contact");
    await operator.page.getByLabel("운영자 전화번호", { exact: true }).fill("123");
    await operator.page.getByLabel("연락 가능 시간", { exact: true }).fill(data.hours);
    await operator.page.getByRole("button", { name: "연락처 저장하기" }).click();
    await expect(operator.page.getByRole("alert").filter({ hasText: "국내 전화번호" })).toBeVisible();
    await operator.page.getByLabel("운영자 전화번호", { exact: true }).fill(data.phone);
    await expect(operator.page.getByRole("checkbox")).not.toBeChecked();
    await operator.page.getByRole("checkbox").check();
    await operator.page.screenshot({ path: "/tmp/rally-contact-form.png", fullPage: true });
    await operator.page.getByRole("button", { name: "연락처 저장하기" }).click();
    await expect(operator.page.getByRole("status")).toContainText("운영자 연락처를 저장했어요");
    expect((await operator.context.request.put(endpoint, { data })).status()).toBe(409);
    const published = await operator.context.request.post(publishUrl);
    expect(published.ok(), await published.text()).toBeTruthy();

    await member.page.goto(`/partner-sessions/${fixture.partnerSlotId}`);
    await expect(member.page.getByRole("link", { name: "운영자에게 전화", exact: true })).toHaveCount(0);
    await expect(member.page.locator('a[href*="/support/inquiry"]')).toHaveCount(0);
    const detailUrl = `/api/v1/partner-session-slots/${fixture.partnerSlotId}`;
    expect(await (await member.context.request.get(detailUrl)).text()).not.toContain("0212345678");
    await member.page.getByRole("button", { name: "같이 치기", exact: true }).click();
    const dialog = member.page.getByRole("dialog", { name: "같이 치기", exact: true });
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "신청 보내기", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const phone = member.page.getByRole("link", { name: "운영자에게 전화", exact: true });
    await expect(phone).toHaveAttribute("href", "tel:0212345678");
    await expect(member.page.getByRole("link", { name: "채팅방 열기" })).toHaveCount(0);
    await phone.scrollIntoViewIfNeeded();
    await member.page.screenshot({ path: "/tmp/rally-contact-participant.png" });
    expect(await (await stranger.context.request.get(detailUrl)).text()).not.toContain("0212345678");
    const response = await member.context.request.get(detailUrl);
    expect(response.headers()["cache-control"]).toBe("no-store");
    const memberView = await response.json();
    expect(JSON.stringify(memberView.participation.application.applicationNotice)).not.toContain("0212345678");

    await operator.page.getByLabel("운영자 전화번호", { exact: true }).fill("031-123-4567");
    await operator.page.getByRole("checkbox").check();
    await operator.page.getByRole("button", { name: "연락처 저장하기" }).click();
    await expect(operator.page.getByRole("status")).toContainText("운영자 연락처를 저장했어요");
    await member.page.reload();
    await expect(phone).toHaveAttribute("href", "tel:0311234567");
    await operator.page.getByRole("button", { name: "전화번호 공개 중단", exact: true }).click();
    await operator.page.getByRole("button", { name: "공개 중단하기", exact: true }).click();
    await expect(operator.page.getByRole("status")).toContainText("전화번호 공개를 중단했어요");
    await member.page.reload();
    await expect(phone).toHaveCount(0);
    await expect(member.page.getByRole("link", { name: "연락 불가·환불 문제·앱 오류 문의 →" })).toBeVisible();
    expect(await prisma.court.findUnique({ where: { id: slot.courtUnit.courtId } })).toMatchObject({ operatorContactPhone: null, contactPublishedAt: null });
    expect(await prisma.match.findUnique({ where: { id: fixture.partnerMatchId } })).toMatchObject({ status: "OPEN" });
    for (const page of [member.page, operator.page]) expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await operator.context.close(); await member.context.close(); await stranger.context.close(); }
});

test("탈퇴 후 미처리 환불에서도 본인 거래 화면의 전화 문의만 유지한다", async ({ browser }) => {
  const fixture = await resetE2eDatabase();
  const errors: string[] = [];
  const member = await session(browser, e2eUsers.applicant.id, errors);
  const operator = await session(browser, e2eUsers.operator.id, errors);
  const stranger = await session(browser, e2eUsers.host.id, errors);
  try {
    const slot = await prisma.courtSlot.findUniqueOrThrow({ where: { id: fixture.partnerSlotId }, include: { courtUnit: true } });
    const endpoint = `/api/v1/operator/courts/${slot.courtUnit.courtId}/contact`;
    const saved = await operator.context.request.put(endpoint, { data: { phone: "02-1234-5678", hours: "매일 09~18시", publicationAgreed: true, expectedVersion: 0 } });
    expect(saved.ok()).toBeTruthy();
    const detailUrl = `/api/v1/partner-session-slots/${slot.id}`;
    const detail = await (await member.context.request.get(detailUrl)).json();
    const applied = await member.context.request.post(`/api/v1/court-matches/${fixture.partnerMatchId}/applications`, { data: { noticeAccepted: true, noticeFingerprint: detail.participation.applicationNotice.fingerprint } });
    expect(applied.ok(), await applied.text()).toBeTruthy();
    const application = await applied.json();
    const received = await operator.context.request.post(`/api/v1/court-match-applications/${application.id}/receipt`, { data: { amountKrw: 5000, receivedAt: new Date().toISOString(), expectedVersion: 0, clientRequestId: crypto.randomUUID(), note: "일부 입금 후 철회 요청 대조" } });
    expect(received.ok(), await received.text()).toBeTruthy();
    const preview = await (await member.context.request.get("/api/v1/me/withdrawal")).json();
    const withdrawn = await member.context.request.post("/api/v1/me/withdrawal", { data: { token: preview.token } });
    expect(withdrawn.ok(), await withdrawn.text()).toBeTruthy();
    await member.page.goto("/account/transactions");
    const phone = member.page.getByRole("link", { name: "운영자에게 전화", exact: true });
    await expect(phone).toHaveAttribute("href", "tel:0212345678");
    const transactions = await member.context.request.get("/api/v1/me/transactions");
    expect(transactions.headers()["cache-control"]).toBe("no-store");
    expect((await transactions.json()).items[0]).toMatchObject({ application: { money: { outstandingKrw: 5000 } }, operatorContact: { phone: "0212345678" } });
    expect(await (await stranger.context.request.get("/api/v1/me/transactions")).text()).not.toContain("0212345678");
    expect((await member.context.request.get(detailUrl)).status()).toBe(403);
    await phone.scrollIntoViewIfNeeded();
    await member.page.screenshot({ path: "/tmp/rally-contact-transactions.png" });
    expect((await operator.context.request.delete(endpoint, { data: { expectedVersion: 1 } })).ok()).toBeTruthy();
    await member.page.reload();
    await expect(phone).toHaveCount(0);
    await expect(member.page.getByText("입금·환불 문의", { exact: true })).toBeVisible();
    expect(await member.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await member.context.close(); await operator.context.close(); await stranger.context.close(); }
});

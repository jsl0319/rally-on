import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { E2E_AUTH_SECRET, E2E_BASE_URL } from "./e2e-environment";
import { disconnectE2eDatabase, e2eUsers, resetE2eDatabase, type E2eFixture } from "./fixtures";

let fixture: E2eFixture;
test.beforeEach(async () => { fixture = await resetE2eDatabase(); });
test.afterAll(disconnectE2eDatabase);
async function session(browser: Browser, id: string, errors: string[]) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const value = await encode({ token: { sub: id, userId: id }, secret: E2E_AUTH_SECRET, salt: "authjs.session-token", maxAge: 3600 });
  await context.addCookies([{ name: "authjs.session-token", value, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage(); page.on("pageerror", (e) => errors.push(e.message));
  return { context, page };
}
async function apply(context: BrowserContext) {
  const detail = await context.request.get(`${E2E_BASE_URL}/api/v1/partner-session-slots/${fixture.partnerSlotId}`);
  const notice = (await detail.json()).participation.applicationNotice;
  const response = await context.request.post(`${E2E_BASE_URL}/api/v1/court-matches/${fixture.partnerMatchId}/applications`, { data: { noticeAccepted: true, noticeFingerprint: notice.fingerprint } });
  expect(response.ok(), await response.text()).toBeTruthy(); return response.json() as Promise<{ id: string }>;
}
async function withdraw(context: BrowserContext) {
  const preview = await context.request.get(`${E2E_BASE_URL}/api/v1/me/withdrawal`); expect(preview.ok()).toBeTruthy();
  const response = await context.request.post(`${E2E_BASE_URL}/api/v1/me/withdrawal`, { data: { token: (await preview.json()).token } });
  expect(response.ok(), await response.text()).toBeTruthy();
}
async function clickSaved(page: Page, label: string, suffix: string, method = "POST") {
  const [response] = await Promise.all([page.waitForResponse((r) => r.url().endsWith(suffix) && r.request().method() === method), page.getByRole("button", { name: label, exact: true }).click()]);
  expect(response.ok(), await response.text()).toBeTruthy();
}

test("탈퇴 전 확인 후에도 본인 환불과 문의는 열리고 일반 서비스는 차단된다", async ({ browser }) => {
  const errors: string[] = [];
  const member = await session(browser, e2eUsers.applicant.id, errors);
  const operator = await session(browser, e2eUsers.operator.id, errors);
  const a = await apply(member.context);
  const receipt = await operator.context.request.post(`${E2E_BASE_URL}/api/v1/court-match-applications/${a.id}/receipt`, { data: { amountKrw: 15000, receivedAt: new Date().toISOString(), expectedVersion: 0, clientRequestId: randomUUID(), note: "E2E 미확정 입금 대조" } });
  expect(receipt.ok(), await receipt.text()).toBeTruthy();
  await member.page.goto("/my");
  await member.page.getByRole("button", { name: "회원 탈퇴", exact: true }).click();
  await expect(member.page.getByText("참가 취소 · 남은 반환 15,000원")).toBeVisible();
  await clickSaved(member.page, "확인 후 탈퇴", "/api/v1/me/withdrawal");
  await expect(member.page.getByRole("heading", { name: "내 거래 정리" })).toBeVisible();
  await member.page.getByLabel("은행", { exact: true }).fill("E2E은행");
  await member.page.getByLabel("계좌번호", { exact: true }).fill("123-456-789");
  await member.page.getByLabel("예금주", { exact: true }).fill("E2E참가자");
  await clickSaved(member.page, "환불 계좌 저장", "/refund-account", "PUT");
  await expect(member.page.getByText("환불 계좌를 저장했어요.")).toBeVisible();
  await member.page.getByText("입금·환불 문의", { exact: true }).click();
  await member.page.getByLabel("문의 내용", { exact: true }).fill("탈퇴 후 입금 반환을 확인하고 싶습니다.");
  await clickSaved(member.page, "문의 보내기", "/transactions/inquiries");
  await expect(member.page.getByText("문의를 접수했어요.")).toBeVisible();
  expect((await member.context.request.get(`${E2E_BASE_URL}/api/v1/me`)).status()).toBe(403);
  expect((await member.context.request.post(`${E2E_BASE_URL}/api/v1/court-matches/${fixture.partnerMatchId}/applications`, { data: {} })).status()).toBe(403);
  expect((await member.context.request.get(`${E2E_BASE_URL}/api/internal/court-handoffs`)).status()).toBe(403);
  await member.page.goto("/login");
  await expect(member.page).toHaveURL(/\/account\/transactions$/);
  await expect(member.page.getByRole("heading", { name: "내 거래 정리" })).toBeVisible();
  await member.page.screenshot({ path: "/tmp/rally-r04-account-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
  await member.context.close(); await operator.context.close();
});

test("운영자 탈퇴 후 인계 담당자가 제공 불가 취소와 반환 기록을 이어간다", async ({ browser }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  const member = await session(browser, e2eUsers.applicant.id, errors);
  const operator = await session(browser, e2eUsers.operator.id, errors);
  const reviewer = await session(browser, e2eUsers.reviewer.id, errors);
  const a = await apply(member.context);
  await withdraw(operator.context);
  await reviewer.page.goto("/internal/support-inquiries");
  await reviewer.page.getByRole("link", { name: "비활성 운영자 거래 인계 →" }).click();
  await reviewer.page.getByLabel("인계 사유·확인 근거").fill("운영자 연락 및 계좌 대조 자료를 인계받았습니다.");
  await clickSaved(reviewer.page, "이 거래 인계받기", `/court-handoffs/${fixture.partnerMatchId}`);
  await expect(reviewer.page.getByText("내가 인계받은 거래")).toBeVisible();
  await reviewer.page.getByLabel("경기 제공 불가 확인 근거").fill("운영자에게 연락하여 실제 경기 제공 불가를 확인했습니다.");
  await clickSaved(reviewer.page, "경기 취소 · 남은 참가자 전액 반환", `/${fixture.partnerMatchId}/cancel`);
  await reviewer.page.getByRole("button", { name: "입금·환불 내역 열기" }).click();
  await reviewer.page.getByText("입금 대조·정정", { exact: true }).click();
  await reviewer.page.getByLabel("누적 수령 금액").fill("18000");
  const kst = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0,19);
  await reviewer.page.getByLabel("은행 수령 시각 (한국 시간)").fill(kst());
  await reviewer.page.getByLabel("대조·정정 사유").fill("인계받은 은행 내역에서 종료 전 실제 입금을 확인했습니다.");
  await clickSaved(reviewer.page, "수령 기록 저장", `/${a.id}/receipt`);
  await member.page.goto("/account/transactions");
  await member.page.getByLabel("은행", { exact: true }).fill("E2E은행");
  await member.page.getByLabel("계좌번호").fill("333-444-555");
  await member.page.getByLabel("예금주").fill("E2E참가자");
  await clickSaved(member.page, "환불 계좌 저장", "/refund-account", "PUT");
  await reviewer.page.getByRole("button", { name: "입금·환불 내역 열기" }).click();
  await clickSaved(reviewer.page, "환불 처리 시작 · 18,000원", `/${a.id}/refund/start`);
  await reviewer.page.getByLabel("실제 송금 시각 (한국 시간)").fill(kst());
  await reviewer.page.getByLabel("처리 근거·메모").fill("E2E 인계 후 실제 송금 내역과 본인 계좌 대조");
  await clickSaved(reviewer.page, "송금 결과 저장", `/${a.id}/refund`);
  await reviewer.page.screenshot({ path: "/tmp/rally-r04-handoff-mobile.png", fullPage: true });
  await member.page.reload();
  await expect(member.page.getByText("18,000원 · 송금 완료 기록")).toBeVisible();
  expect(errors).toEqual([]);
  await member.context.close(); await operator.context.close(); await reviewer.context.close();
});

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { PrismaClient } from "@/generated/prisma/client";
import { createPrismaPg } from "../../src/server/db/prisma-adapter";
import { E2E_AUTH_SECRET, E2E_BASE_URL, requireE2eDatabaseUrl } from "./e2e-environment";
import { disconnectE2eDatabase, e2eUsers, resetE2eDatabase } from "./fixtures";

const prisma = new PrismaClient({ adapter: createPrismaPg(requireE2eDatabaseUrl()) });
async function signIn(context: BrowserContext, userId: string = e2eUsers.applicant.id) {
  const value = await encode({ token: { sub: userId, userId }, secret: E2E_AUTH_SECRET, salt: "authjs.session-token", maxAge: 3600 });
  await context.addCookies([{ name: "authjs.session-token", value, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
}
async function fit(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function shot(page: Page, name: string) {
  await fit(page);
  await page.screenshot({ path: `/private/tmp/rally-service-${name}.png`, fullPage: false, animations: "disabled" });
}
test.afterAll(async () => { await prisma.$disconnect(); await disconnectE2eDatabase(); });

test("브랜드 진입은 대기 중에만 보이며 지연·오류·동작 줄이기를 지원한다", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/v1/me", async route => { await gate; await route.fulfill({ status: 401, json: { error: { message: "로그인이 필요해요." } } }); });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await expect(page.locator("[data-brand-launch]")).toBeVisible();
  await expect(page.getByRole("img", { name: "Rally On" })).toBeVisible();
  expect(await page.locator("[data-entry-identity]").evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await shot(page, "launch");
  await expect(page.getByRole("button", { name: "다시 연결" })).toBeVisible({ timeout: 12000 });
  release();
  await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();
  await expect(page.locator("[data-brand-launch]")).toHaveCount(0);
  expect(await page.locator("[data-entry-actions]").evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await shot(page, "login");
  await page.unroute("**/api/v1/me");
  await page.route("**/api/v1/me", route => route.fulfill({ status: 503, json: { error: { message: "일시적인 오류" } } }));
  await page.reload();
  await expect(page.getByRole("button", { name: /다시/ })).toBeVisible();
  await expect(page.locator("[data-brand-launch]")).toHaveCount(0);
});

for (const width of [320, 375]) {
  test(`브랜드 진입 ${width}px: 로고 위치를 유지하고 로그인 버튼만 순차 공개한다`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 812 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/v1/me", async route => { await gate; await route.fulfill({ status: 401, json: {} }); });
    await page.goto("/login");
    await expect(page.locator("[data-brand-launch]")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const identity = page.locator("[data-entry-identity]");
    const before = await identity.boundingBox();
    // Reproduce the native cover holding back buttons while it crossfades out.
    await page.evaluate(() => { document.documentElement.dataset.rallyNativeReveal = "pending"; });
    release();
    await expect(page.locator("[data-brand-launch]")).toHaveCount(0);
    await expect(page.locator("[data-entry-actions]")).toBeHidden();
    const after = await identity.boundingBox();
    expect(Math.abs(before!.y - after!.y)).toBeLessThan(1);
    expect(Math.abs(before!.height - after!.height)).toBeLessThan(1);
    await page.evaluate(() => { document.documentElement.dataset.rallyNativeReveal = "ready"; });
    await expect.poll(() => page.locator("[data-entry-actions]").evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
    await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();
    await fit(page);
    const final = await identity.boundingBox();
    expect(Math.abs(before!.y - final!.y)).toBeLessThan(1);
    await expect(page.getByRole("button", { name: "테니스장을 운영하고 계신가요?" })).toBeVisible();
  });
}

test("마이·프로필·공지·문의·약관은 작은 화면에서 실제 저장과 재조회를 유지한다", async ({ page, context }) => {
  test.setTimeout(120000);
  await resetE2eDatabase();
  await prisma.announcement.deleteMany();
  await prisma.announcement.create({ data: { status: "PUBLISHED", publishedAt: new Date(), title: "처음 만나는 메이트를 위한 이용 안내", body: "매칭 참가 전 장소와 시간을 확인해 주세요.\n준비물은 매칭 채팅에서 이야기해요." } });
  await signIn(context);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/my");
  await expect(page.getByRole("link", { name: /프로필 수정/ })).toBeVisible();
  await shot(page, "my");
  await page.route("**/api/v1/me", route => route.request().method() === "PATCH" ? route.fulfill({ status: 503, json: {} }) : route.continue());
  const toggle = page.getByRole("switch", { name: "매칭 소식 알림" });
  const before = await toggle.getAttribute("aria-checked");
  await toggle.click();
  await expect(page.locator("main").getByRole("alert")).toContainText("알림 설정을 저장하지 못했어요");
  await expect(toggle).toHaveAttribute("aria-checked", before!);
  await expect(page.locator("#wds-region-manager-bottom").getByRole("status")).toHaveCount(0);
  await page.unroute("**/api/v1/me");
  await toggle.click();
  await expect(page.getByRole("status").filter({ hasText: /매칭 소식 알림을 (켰|껐)습니다/ })).toBeInViewport();
  await page.getByRole("link", { name: /프로필 수정/ }).click();
  await expect(page.getByLabel("닉네임", { exact: true })).toHaveValue(e2eUsers.applicant.nickname);
  await shot(page, "profile");
  const experience = page.locator("details").filter({ hasText: "테니스 경력" });
  await experience.locator("summary").click();
  await experience.getByRole("button", { name: /1~2년/ }).click();
  await page.getByLabel("닉네임", { exact: true }).fill("랠리친구");
  await page.getByRole("button", { name: "저장하기" }).click();
  await expect(page).toHaveURL(/\/my$/);
  await expect(page.getByRole("status").filter({ hasText: "프로필 저장이 완료되었습니다." })).toBeInViewport();
  await expect(page.getByText("랠리친구", { exact: true })).toBeVisible();
  const me = await (await context.request.get(`${E2E_BASE_URL}/api/v1/me`)).json();
  expect(me.tennisProfile.experienceRange).toBe("YEARS_1_TO_2");
  await page.goto("/notices");
  const notice = page.locator("details").filter({ hasText: "처음 만나는 메이트" });
  await notice.locator("summary").click();
  await expect(notice.getByText(/준비물은 매칭 채팅/)).toBeVisible();
  await shot(page, "notices");
  await page.goto("/support/inquiry");
  await shot(page, "support");
  await page.getByLabel("문의 내용", { exact: true }).fill("매칭 채팅을 이용하는 방법이 궁금해요.");
  await page.getByRole("button", { name: "문의 보내기" }).click();
  await expect(page.getByRole("status").filter({ hasText: "문의가 접수되었습니다." })).toBeInViewport();
  const inquiries = await (await context.request.get(`${E2E_BASE_URL}/api/v1/support-inquiries`)).json();
  expect(inquiries.items[0].message).toBe("매칭 채팅을 이용하는 방법이 궁금해요.");
  await page.getByLabel("추가 문의", { exact: true }).fill("답변은 이 화면에서 확인하면 될까요?");
  await Promise.all([page.waitForResponse(r => r.url().includes("/support-inquiries/") && r.request().method() === "POST" && r.ok()), page.getByRole("button", { name: "추가 문의 보내기" }).click()]);
  await expect(page.getByLabel("추가 문의", { exact: true })).toHaveValue("");
  await expect(page.getByText("답변은 이 화면에서 확인하면 될까요?", { exact: true })).toBeVisible();
  await shot(page, "inquiries");
  for (const route of ["terms", "privacy"]) {
    await page.goto(`/${route}?returnTo=%2Fmy`);
    await expect(page.getByRole("navigation", { name: /목차/ })).toBeVisible();
    await shot(page, route);
    const entry = page.getByRole("navigation", { name: /목차/ }).getByRole("link").nth(1);
    await entry.click();
    await expect(page.locator("#policy-section-2")).toBeInViewport();
    await page.getByRole("link", { name: "마이로 돌아가기" }).click();
    await expect(page).toHaveURL(/\/my$/);
  }
  for (const path of ["/my", "/my/profile", "/notices", "/support/inquiry", "/terms", "/privacy"]) {
    await page.setViewportSize({ width: 320, height: 568 }); await page.goto(path);
    await page.addStyleTag({ content: ":root { --rally-safe-top: 47px; }" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible(); await fit(page);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/my/profile");
  await expect(page.getByLabel("닉네임", { exact: true })).toBeVisible(); await fit(page);
  expect(errors).toEqual([]);
});

test("로그아웃은 확인 후에만 실행되고 취소·연결 실패 시 재시도할 수 있다", async ({ page, context }) => {
  await resetE2eDatabase();
  await signIn(context);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/my");
  let attempts = 0;
  page.on("request", request => { if (request.url().endsWith("/api/auth/signout") && request.method() === "POST") attempts++; });
  const trigger = page.getByRole("button", { name: "로그아웃", exact: true });
  await trigger.click();
  const dialog = page.getByRole("alertdialog", { name: "로그아웃할까요?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "취소" })).toBeFocused();
  await fit(page);
  await page.screenshot({ path: "/private/tmp/rally-logout-confirmation.png" });
  expect(attempts).toBe(0);
  await dialog.getByRole("button", { name: "취소" }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/\/my$/);
  expect((await context.request.get("/api/v1/me")).status()).toBe(200);
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(attempts).toBe(0);
  await trigger.click();
  await page.route("**/api/auth/signout", route => route.abort("failed"), { times: 1 });
  await dialog.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("로그아웃하지 못했어요");
  expect((await context.request.get("/api/v1/me")).status()).toBe(200);
  await dialog.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.request.get("/api/v1/me")).status()).toBe(401);
  expect(attempts).toBe(2);
  await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeVisible();
});

test("내 거래 정리에서도 로그아웃을 취소하면 계정과 거래 화면을 유지한다", async ({ page, context }) => {
  await resetE2eDatabase();
  await signIn(context);
  await prisma.user.update({ where: { id: e2eUsers.applicant.id }, data: { status: "WITHDRAWN", withdrawnAt: new Date() } });
  await page.goto("/account/transactions");
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "로그아웃할까요?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "취소" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/account\/transactions$/);
  expect((await context.request.get("/api/v1/me/transactions")).status()).toBe(200);
});

test("새 채팅 목록에서 대화하고 보낸 신청·만든 매칭의 취소와 재모집을 처리한다", async ({ page, context, browser }) => {
  test.setTimeout(120000);
  const fixture = await resetE2eDatabase();
  await signIn(context);
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/chats");
  await expect(page.getByRole("link", { name: /E2E 자리가 찬 매칭/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: "내가 신청한 매칭" })).toHaveAttribute("aria-selected", "true");
  await shot(page, "chats");
  await page.getByRole("link", { name: /E2E 자리가 찬 매칭/ }).click();
  await page.getByLabel("메시지", { exact: true }).fill("안녕하세요! 코트에서 만나요.");
  await Promise.all([page.waitForResponse(r => r.url().includes("/conversation/messages") && r.request().method() === "POST" && r.ok()), page.getByRole("button", { name: "보내기", exact: true }).click()]);
  await expect(page.getByLabel("메시지", { exact: true })).toHaveValue("");
  await expect(page.getByText("안녕하세요! 코트에서 만나요.", { exact: true })).toBeVisible();
  await shot(page, "conversation");
  await page.reload();
  await expect(page.getByText("안녕하세요! 코트에서 만나요.", { exact: true })).toBeVisible();
  await page.goto("/activity/sent");
  const card = page.locator("article").filter({ hasText: "E2E 마감 테니스장" });
  await expect(card).toBeVisible();
  await shot(page, "sent");
  await card.getByRole("button", { name: "참가 취소", exact: true }).click();
  await page.getByRole("button", { name: "네, 취소할게요" }).click();
  await expect(card.getByText("참가를 취소했어요.")).toBeVisible();
  const host = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await signIn(host, e2eUsers.host.id);
  const hostPage = await host.newPage();
  await hostPage.goto("/activity/received");
  const hosted = hostPage.locator("section").filter({ has: hostPage.getByRole("heading", { name: "E2E 마감 테니스장" }) }).first();
  await expect(hosted.getByText("수락 0명 / 모집 1명", { exact: false })).toBeVisible();
  await shot(hostPage, "hosted");
  await hosted.getByRole("button", { name: "다시 모집하기" }).click();
  await hostPage.getByRole("button", { name: "네, 다시 모집할게요" }).click();
  await expect(hosted.getByText("모집 중", { exact: true })).toBeVisible();
  expect((await prisma.match.findUniqueOrThrow({ where: { id: fixture.fullMatchId } })).status).toBe("OPEN");
  await page.setViewportSize({ width: 320, height: 568 }); await page.goto("/chats"); await fit(page);
  expect(errors).toEqual([]);
  await host.close();
});

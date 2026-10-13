import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { PrismaClient } from "@/generated/prisma/client";
import { createPrismaPg } from "../../src/server/db/prisma-adapter";
import { E2E_AUTH_SECRET, E2E_BASE_URL, requireE2eDatabaseUrl } from "./e2e-environment";
import { disconnectE2eDatabase, e2eUsers, resetE2eDatabase } from "./fixtures";

const db = new PrismaClient({ adapter: createPrismaPg(requireE2eDatabaseUrl()) });
async function signIn(context: BrowserContext, userId: string) {
  const value = await encode({ token: { sub: userId, userId }, secret: E2E_AUTH_SECRET, salt: "authjs.session-token", maxAge: 3600 });
  await context.addCookies([{ name: "authjs.session-token", value, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
}
async function fit(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
test.beforeEach(async () => { await resetE2eDatabase(); await db.announcement.deleteMany(); });
test.afterAll(async () => { await db.$disconnect(); await disconnectE2eDatabase(); });

test("로그인 문의 주소와 관리자 메뉴·페이지·API 권한", async ({ page, context }) => {
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "rallyon.support@gmail.com" })).toHaveAttribute("href", /^mailto:rallyon.support@gmail.com/);
  await page.setViewportSize({ width: 320, height: 568 }); await fit(page);
  await page.screenshot({ path: "/private/tmp/rally-admin-login.png", fullPage: true });
  expect((await context.request.get("/api/internal/overview")).status()).toBe(401);
  await signIn(context, e2eUsers.applicant.id);
  await page.goto("/my");
  await expect(page.getByRole("link", { name: /프로필 수정/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /서비스 관리/ })).toHaveCount(0);
  expect((await context.request.get("/api/internal/announcements")).status()).toBe(403);
  expect((await context.request.post("/api/internal/announcements", { data: { id: crypto.randomUUID(), title: "임의 공지", body: "권한 없는 작성", isPinned: false } })).status()).toBe(403);
  await page.goto("/internal"); await expect(page).not.toHaveURL(/\/internal$/);
  await signIn(context, e2eUsers.operator.id);
  expect((await context.request.get("/api/internal/overview")).status()).toBe(403);
  await signIn(context, e2eUsers.reviewer.id);
  await page.goto("/my"); await page.getByRole("link", { name: /서비스 관리/ }).click();
  await expect(page.getByText("답변할 문의 0건 · 운영자 확인 중 0건")).toBeVisible(); await fit(page);
  await page.screenshot({ path: "/private/tmp/rally-admin-home.png", fullPage: true });
  await db.user.update({ where: { id: e2eUsers.reviewer.id }, data: { role: "MEMBER" } });
  expect((await context.request.get("/api/internal/overview")).status()).toBe(403);
  await page.reload(); await expect(page).not.toHaveURL(/\/internal$/);
});

test("회원 문의 → 관리자 알림 → 답변 → 회원 알림에서 해당 문의 → 재문의", async ({ page, context, browser }) => {
  test.setTimeout(90000);
  await signIn(context, e2eUsers.applicant.id);
  await db.user.updateMany({ data: { matchNotificationsEnabled: false } });
  const staffContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await signIn(staffContext, e2eUsers.reviewer.id); const staff = await staffContext.newPage();
  try {
    await page.goto("/support/inquiry");
    await page.getByLabel("문의 내용", { exact: true }).fill("테스트 회원이 남긴 이용 방법 문의입니다.");
    await page.getByRole("button", { name: "문의 보내기" }).click();
    await expect(page.getByRole("status").filter({ hasText: "문의가 접수되었습니다." })).toBeInViewport();
    await staff.goto("/my/notifications");
    await staff.getByRole("link", { name: /새 문의가 도착했어요/ }).click();
    await expect(staff.getByText("테스트 회원이 남긴 이용 방법 문의입니다.", { exact: true })).toBeVisible();
    await staff.getByRole("button", { name: "문의 담당하기", exact: true }).click();
    await expect(staff.getByRole("status").filter({ hasText: "문의 담당자로 지정되었습니다." })).toBeInViewport();
    await staff.getByLabel("답변 내용", { exact: true }).fill("마이 화면에서 프로필 수정을 선택해 주세요.");
    await staff.getByRole("button", { name: "답변·처리 저장" }).click();
    await expect(staff.getByRole("status").filter({ hasText: "답변이 저장되었습니다." })).toBeInViewport();
    await expect(staff.getByRole("article").getByText("답변 완료", { exact: true })).toBeVisible();
    await staff.screenshot({ path: "/private/tmp/rally-admin-inquiry.png", fullPage: true });
    await page.goto("/my/notifications"); await page.getByRole("link", { name: /문의에 답변이 도착했어요/ }).click();
    await expect(page.getByText("마이 화면에서 프로필 수정을 선택해 주세요.", { exact: true })).toBeVisible();
    await page.getByLabel("추가 문의", { exact: true }).fill("내용 확인했습니다. 사진도 바꿀 수 있나요?");
    await page.getByRole("button", { name: "추가 문의 보내기" }).click();
    await expect(page.getByLabel("추가 문의", { exact: true })).toHaveValue("");
    await expect(page.getByRole("status").filter({ hasText: "추가 문의가 접수되었습니다." })).toBeInViewport();
    await expect(page.getByRole("article").getByText("내용 확인했습니다. 사진도 바꿀 수 있나요?", { exact: true })).toBeVisible();
    await staff.goto("/my/notifications"); await staff.getByRole("link", { name: /문의에 새 메시지가 도착했어요/ }).click();
    await expect(staff.getByText("내용 확인했습니다. 사진도 바꿀 수 있나요?", { exact: true })).toBeVisible();
    await fit(staff); await fit(page);
  } finally { await staffContext.close(); }
});

test("공지 초안·미리보기·공개·고정·수정 충돌·숨김이 실제 사용자 목록과 연결된다", async ({ page, context, browser }) => {
  test.setTimeout(90000);
  await signIn(context, e2eUsers.reviewer.id); await page.setViewportSize({ width: 375, height: 812 });
  const memberContext = await browser.newContext(); await signIn(memberContext, e2eUsers.applicant.id);
  try {
    await page.goto("/internal/announcements"); await page.getByRole("link", { name: "새 공지 작성" }).click();
    await page.getByLabel("제목", { exact: true }).fill("첫 만남 전에 확인해 주세요");
    await page.getByLabel("내용", { exact: true }).fill("테니스장 위치와 약속 시간을 확인해 주세요.\n궁금한 점은 1:1 문의로 알려 주세요.");
    await page.getByLabel("중요 공지로 상단에 고정").check();
    await page.getByRole("button", { name: "미리보기", exact: true }).click();
    await expect(page.getByRole("heading", { name: "첫 만남 전에 확인해 주세요" })).toBeVisible();
    await page.getByRole("button", { name: "편집으로 돌아가기" }).click();
    await page.route("**/api/internal/announcements", async route => {
      if (route.request().method() === "POST") await route.fulfill({ status: 503, json: { error: { message: "잠시 후 다시 시도해 주세요." } } });
      else await route.continue();
    });
    await page.getByRole("button", { name: "초안 저장", exact: true }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("잠시 후");
    await expect(page.locator("#wds-region-manager-bottom").getByRole("status")).toHaveCount(0);
    await expect(page.getByLabel("제목", { exact: true })).toHaveValue("첫 만남 전에 확인해 주세요");
    await page.unroute("**/api/internal/announcements");
    await page.getByRole("button", { name: "초안 저장", exact: true }).click();
    await expect(page).toHaveURL(/\/internal\/announcements\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("status").filter({ hasText: "초안 저장이 완료되었습니다." })).toBeInViewport();
    await page.screenshot({ path: "/private/tmp/rally-admin-save-toast.png" });
    expect((await (await memberContext.request.get(`${E2E_BASE_URL}/api/v1/announcements`)).json()).items).toHaveLength(0);
    await page.getByRole("button", { name: "공개하기", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "공지사항이 공개되었습니다." })).toBeInViewport();
    await page.getByLabel("제목", { exact: true }).fill("첫 만남 전에 확인해 주세요 · 수정");
    await page.getByRole("button", { name: "수정하고 공개 유지" }).click();
    await expect(page.getByRole("status").filter({ hasText: "공지 수정이 완료되었습니다." })).toBeInViewport();
    const memberPage = await memberContext.newPage(); await memberPage.goto(`${E2E_BASE_URL}/notices`);
    await expect(memberPage.getByText("중요", { exact: true })).toBeVisible();
    await memberPage.locator("summary").filter({ hasText: "첫 만남 전에 확인해 주세요" }).click();
    await expect(memberPage.getByText(/테니스장 위치와 약속 시간을/)).toBeVisible();
    await page.screenshot({ path: "/private/tmp/rally-admin-notice.png", fullPage: true });
    const item = await db.announcement.findFirstOrThrow();
    await context.request.patch(`/api/internal/announcements/${item.id}`, { data: { title: "다른 화면의 수정", body: item.body, isPinned: true, status: "PUBLISHED", expectedVersion: item.version } });
    await page.getByLabel("제목", { exact: true }).fill("충돌 시 보존할 입력");
    await page.getByRole("button", { name: "수정하고 공개 유지" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("다른 화면에서 수정됐어요");
    await expect(page.getByLabel("제목", { exact: true })).toHaveValue("충돌 시 보존할 입력");
    await page.reload(); await expect(page.getByLabel("제목", { exact: true })).toHaveValue("다른 화면의 수정");
    await page.getByRole("button", { name: "사용자 목록에서 숨기기" }).click();
    await expect(page.getByRole("status").filter({ hasText: "공지사항을 숨겼습니다." })).toBeInViewport();
    expect((await (await memberContext.request.get(`${E2E_BASE_URL}/api/v1/announcements`)).json()).items).toHaveLength(0);
    await page.setViewportSize({ width: 320, height: 568 }); await fit(page);
    await page.getByRole("link", { name: "공지 목록으로" }).click(); await expect(page.getByText("숨김 · 상단 고정")).toBeVisible(); await fit(page);
  } finally { await memberContext.close(); }
});

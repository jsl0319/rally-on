import { expect, test, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
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
test.afterAll(async () => { await db.$disconnect(); await disconnectE2eDatabase(); });

for (const scope of ["received", "sent"] as const) {
  test(`${scope}: 목록을 확인하면 새 소식만 사라지고 신청 상태·다른 알림은 유지된다`, async ({ page, context }) => {
    await resetE2eDatabase();
    const userId = scope === "received" ? e2eUsers.host.id : e2eUsers.applicant.id;
    await signIn(context, userId);
    const startsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const match = await db.match.create({ data: {
      hostUserId: e2eUsers.host.id, clientRequestId: randomUUID(), title: "E2E 새 신청 확인",
      startsAt, endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000),
      courtSource: "EXTERNAL_RESERVED", externalCourtName: "E2E 테니스장",
      externalCourtAddress: "서울시 E2E 마포구", recruitCount: 3,
      partnerPreference: "COMPLETE_BEGINNER_WELCOME", totalCourtFeeKrw: 24000,
    } });
    const application = await db.matchApplication.create({ data: { matchId: match.id, applicantUserId: e2eUsers.applicant.id, status: "PENDING", profileSnapshot: {} } });
    const activity = await db.notification.create({ data: { userId, type: scope === "received" ? "APPLICATION_RECEIVED" : "APPLICATION_ACCEPTED", title: "신청 새 소식", body: "상태 확인", href: scope === "received" ? `/activity/received/${match.id}` : "/activity/sent" } });
    const support = await db.notification.create({ data: { userId, type: "SUPPORT_INQUIRY_REPLIED", title: "문의 답변", body: "읽지 않은 답변", href: "/support/inquiry" } });
    await page.goto("/my");
    const link = page.getByRole("link", { name: scope === "received" ? /내가 만든 매칭/ : /내가 보낸 신청/ });
    await expect(link.getByLabel("새 소식 1개")).toBeVisible();
    await link.click();
    await expect.poll(async () => (await db.notification.findUniqueOrThrow({ where: { id: activity.id } })).readAt).not.toBeNull();
    await expect(page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: /마이/ }).getByRole("status")).toHaveText(/마이 새 소식 1/);
    await page.getByRole("button", { name: "이전 화면으로 돌아가기", exact: true }).click();
    await expect(page).toHaveURL(/\/my$/);
    await expect(link.locator("[aria-label^='새 소식']")).toHaveCount(0);
    expect((await db.matchApplication.findUniqueOrThrow({ where: { id: application.id } })).status).toBe("PENDING");
    expect((await db.notification.findUniqueOrThrow({ where: { id: support.id } })).readAt).toBeNull();
    await page.reload();
    await expect(link).toBeVisible();
    await expect(link.locator("[aria-label^='새 소식']")).toHaveCount(0);
  });
}

test("실패한 목록은 읽지 않고 100개 넘는 소식·도중에 도착한 알림을 구분한다", async ({ page, context }) => {
  test.setTimeout(120000);
  await resetE2eDatabase(); await signIn(context, e2eUsers.applicant.id);
  const userId = e2eUsers.applicant.id;
  await db.notification.createMany({ data: Array.from({ length: 105 }, (_, i) => ({ userId, type: "APPLICATION_REJECTED", title: `이전 소식 ${i}`, body: "신청 결과", href: "/activity/sent" })) });
  const detail = await db.notification.create({ data: { userId, type: "COURT_BALLS_MISSING_RECORDED", title: "추가 납부", body: "상세 확인 필요", href: "/partner-sessions/abc-123" } });
  await page.goto("/my");
  const link = page.getByRole("link", { name: /내가 보낸 신청/ });
  await expect(link.getByLabel("새 소식 105개")).toBeVisible();
  await page.route("**/api/v1/me/applications", route => route.fulfill({ status: 503, json: { error: { message: "목록 조회 실패" } } }));
  await link.click(); await expect(page.getByText("목록 조회 실패", { exact: true })).toBeVisible();
  expect(await db.notification.count({ where: { userId, readAt: { not: null } } })).toBe(0);
  await page.unroute("**/api/v1/me/applications");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let arrived!: () => void;
  const reading = new Promise<void>(resolve => { arrived = resolve; });
  await page.route("**/api/v1/me/notifications/read", async route => { arrived(); await gate; await route.continue(); });
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await reading;
  const newest = await db.notification.create({ data: { userId, type: "APPLICATION_ACCEPTED", title: "새로 도착", body: "이번에 새로 도착한 소식", href: "/activity/sent" } });
  release();
  await expect.poll(() => db.notification.count({ where: { userId, readAt: { not: null } } })).toBe(105);
  expect((await db.notification.findUniqueOrThrow({ where: { id: newest.id } })).readAt).toBeNull();
  expect((await db.notification.findUniqueOrThrow({ where: { id: detail.id } })).readAt).toBeNull();
  await page.getByRole("button", { name: "이전 화면으로 돌아가기", exact: true }).click();
  await expect(link.getByLabel("새 소식 1개")).toBeVisible();
  // An unrelated account cannot acknowledge this user's receipt.
  const otherContext = await context.browser()!.newContext({ baseURL: E2E_BASE_URL });
  await signIn(otherContext, e2eUsers.host.id);
  expect((await otherContext.request.post("/api/v1/me/notifications/read", { data: { ids: [newest.id] } })).ok()).toBe(true);
  expect((await db.notification.findUniqueOrThrow({ where: { id: newest.id } })).readAt).toBeNull();
  await otherContext.clearCookies();
  expect((await otherContext.request.post("/api/v1/me/notifications/read", { data: { ids: [newest.id] } })).status()).toBe(401);
  await otherContext.close();
});

test("읽음 저장 실패는 뱃지를 유지하고 알림함의 모두 읽음도 복귀 화면에 반영한다", async ({ page, context }) => {
  await resetE2eDatabase();
  await signIn(context, e2eUsers.applicant.id);
  const notice = await db.notification.create({ data: {
    userId: e2eUsers.applicant.id, type: "APPLICATION_REJECTED", title: "신청 결과",
    body: "새 신청 결과", href: "/activity/sent",
  } });
  await page.goto("/my");
  const link = page.getByRole("link", { name: /내가 보낸 신청/ });
  await expect(link.getByLabel("새 소식 1개")).toBeVisible();
  await page.route("**/api/v1/me/notifications/read", route => route.fulfill({ status: 503, json: { error: { message: "저장 실패" } } }));
  const failed = page.waitForResponse(response => response.url().endsWith("/notifications/read") && response.status() === 503);
  await link.click();
  await failed;
  await page.getByRole("button", { name: "이전 화면으로 돌아가기", exact: true }).click();
  await expect(link.getByLabel("새 소식 1개")).toBeVisible();
  expect((await db.notification.findUniqueOrThrow({ where: { id: notice.id } })).readAt).toBeNull();
  await page.unroute("**/api/v1/me/notifications/read");
  await page.getByRole("link", { name: /^알림/ }).click();
  await page.getByRole("button", { name: "모두 읽음", exact: true }).click();
  await expect.poll(async () => (await db.notification.findUniqueOrThrow({ where: { id: notice.id } })).readAt).not.toBeNull();
  await page.getByRole("button", { name: "이전 화면으로 돌아가기", exact: true }).click();
  await expect(link).toBeVisible();
  await expect(link.locator("[aria-label^='새 소식']")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: /마이/ }).getByRole("status")).toHaveCount(0);
});

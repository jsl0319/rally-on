import { expect, test, type BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { PrismaClient } from "@/generated/prisma/client";
import { createPrismaPg } from "../../src/server/db/prisma-adapter";
import { E2E_AUTH_SECRET, E2E_BASE_URL, requireE2eDatabaseUrl } from "./e2e-environment";
import { disconnectE2eDatabase, e2eUsers, resetE2eDatabase } from "./fixtures";
test.skip(process.env.WEB_PUSH_ENABLED !== "true", "Run with playwright.push.config.ts to enable isolated Web Push checks.");
const db = new PrismaClient({ adapter: createPrismaPg(requireE2eDatabaseUrl()) });
async function signIn(context: BrowserContext, userId: string) {
  const value = await encode({ token: { sub: userId, userId }, secret: E2E_AUTH_SECRET, salt: "authjs.session-token", maxAge: 3600 });
  await context.addCookies([{ name: "authjs.session-token", value, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
}
test.beforeEach(async () => { await resetE2eDatabase(); });
test.afterAll(async () => { await db.$disconnect(); await disconnectE2eDatabase(); });
const subscription = { endpoint: "https://web.push.apple.com/rally-test", keys: { p256dh: "B" + "a".repeat(86), auth: "a".repeat(22) } };

test("구독 소유권·동일 출처·계정 전환·로그아웃과 안전한 알림 이동", async ({ context, page }) => {
  const post = (data: unknown, origin = E2E_BASE_URL) => context.request.post("/api/v1/me/push", { headers: { Origin: origin }, data });
  expect((await context.request.get("/api/v1/me/push")).status()).toBe(401);
  await signIn(context, e2eUsers.applicant.id);
  await context.request.get("/api/v1/me/push");
  expect((await post({ action: "subscribe", subscription }, "https://evil.test")).status()).toBe(403);
  expect((await post({ action: "subscribe", subscription: { ...subscription, endpoint: "https://127.0.0.1/private" } })).status()).toBe(422);
  const registered = await post({ action: "subscribe", subscription });
  expect(registered.status()).toBe(200);
  const { subscriptionId } = await registered.json();
  expect(await db.pushSubscription.findUnique({ where: { id: subscriptionId } })).toMatchObject({ userId: e2eUsers.applicant.id });
  const item = await db.notification.create({ data: { userId: e2eUsers.applicant.id, type: "PUSH_TEST", title: "test", body: "test", href: "/activity/sent" } });
  await page.goto(`/my/notifications/open/${item.id}`); await expect(page).toHaveURL(/\/activity\/sent$/);
  await signIn(context, e2eUsers.outsider.id);
  expect((await (await context.request.get("/api/v1/me/push")).json()).subscriptionId).toBeNull();
  expect(await db.pushSubscription.count()).toBe(0);
  expect((await post({ action: "refresh", subscriptionId })).status()).toBe(409);
  expect(await db.pushSubscription.count()).toBe(0);
  await page.goto(`/my/notifications/open/${item.id}`); await expect(page).toHaveURL(/\/my\/notifications$/);
  await post({ action: "subscribe", subscription });
  // Auth.js signout event also detaches if the client-side button is bypassed.
  const csrf = await (await context.request.get("/api/auth/csrf")).json();
  await context.request.post("/api/auth/signout", { form: { csrfToken: csrf.csrfToken, callbackUrl: "/login" } });
  expect(await db.pushSubscription.count()).toBe(0);
});

test("모바일 설정·해제 확인·서비스워커 표시 요청·이전 기기 연결 차단", async ({ context, page }) => {
  await context.grantPermissions(["notifications"], { origin: E2E_BASE_URL });
  await signIn(context, e2eUsers.applicant.id);
  // Only browser-provider registration is faked; API, DB, service worker and IndexedDB are real.
  await page.addInitScript(() => {
    let enabled = false;
    const sub = { endpoint: "https://web.push.apple.com/rally-test-ui", toJSON: () => ({ keys: { p256dh: "B" + "a".repeat(86), auth: "a".repeat(22) } }), unsubscribe: async () => { enabled = false; return true; } };
    PushManager.prototype.subscribe = async () => { enabled = true; return sub as unknown as PushSubscription; };
    PushManager.prototype.getSubscription = async () => enabled ? sub as unknown as PushSubscription : null;
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/my/notifications");
  await page.getByRole("button", { name: /푸시 알림/ }).click();
  await page.getByRole("switch", { name: "이 기기에서 알림 켜기" }).click();
  await expect(page.getByRole("status").filter({ hasText: "이 기기의 알림을 켰어요" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/rally-web-push-settings-375.png", fullPage: true });
  const sub = await db.pushSubscription.findFirstOrThrow();
  const worker = context.serviceWorkers()[0];
  // Headless Chromium does not forward notification permission to workers here.
  // Stub only the OS display boundary; run actual handler + IndexedDB binding logic.
  await worker.evaluate(() => {
    const target = self as unknown as { registration: ServiceWorkerRegistration; displayed: { title: string; body: string; close: () => void }[] };
    target.displayed = [];
    target.registration.showNotification = async (title, options) => {
      target.displayed.push({ title, body: options?.body || "", close: () => { target.displayed = []; } });
    };
    target.registration.getNotifications = async () => target.displayed as unknown as Notification[];
  });
  const id = crypto.randomUUID();
  await worker.evaluate(async data => {
    const target = self as unknown as { dispatchEvent: (event: Event) => void; PushEvent: new (type: string, init: { data: string }) => Event };
    const pending: Promise<unknown>[] = [];
    const event = new target.PushEvent("push", { data: JSON.stringify(data) });
    // Synthetic browser events do not have the platform lifetime extension slot.
    Object.defineProperty(event, "waitUntil", { value: (work: Promise<unknown>) => pending.push(work) });
    target.dispatchEvent(event);
    await Promise.all(pending);
  }, { version: 1, notificationId: id, subscriptionId: sub.id });
  await expect.poll(() => worker.evaluate(() => (self as unknown as { displayed: unknown[] }).displayed.length)).toBe(1);
  const payload = await worker.evaluate(() => { const [notification] = (self as unknown as { displayed: { title: string; body: string }[] }).displayed; return { title: notification.title, body: notification.body }; });
  expect(payload).toEqual({ title: "랠리온", body: "새 알림이 있어요. 앱에서 확인해 주세요." });
  await page.getByRole("switch", { name: "알림 끄기", exact: true }).click();
  await page.getByRole("button", { name: "유지하기" }).click();
  expect(await db.pushSubscription.count()).toBe(1);
  await page.getByRole("switch", { name: "알림 끄기", exact: true }).click();
  await page.getByRole("button", { name: "알림 끄기", exact: true }).last().click();
  await expect(page.getByRole("status").filter({ hasText: "이 기기의 알림을 껐어요" })).toBeVisible();
  expect(await db.pushSubscription.count()).toBe(0);
  await worker.evaluate(async data => {
    const target = self as unknown as { dispatchEvent: (event: Event) => void; PushEvent: new (type: string, init: { data: string }) => Event };
    const pending: Promise<unknown>[] = [];
    const event = new target.PushEvent("push", { data: JSON.stringify(data) });
    // Synthetic browser events do not have the platform lifetime extension slot.
    Object.defineProperty(event, "waitUntil", { value: (work: Promise<unknown>) => pending.push(work) });
    target.dispatchEvent(event);
    await Promise.all(pending);
  }, { version: 1, notificationId: crypto.randomUUID(), subscriptionId: sub.id });
  await expect.poll(() => worker.evaluate(() => (self as unknown as { displayed: unknown[] }).displayed.length)).toBe(0);
  await page.setViewportSize({ width: 320, height: 568 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("아이폰 일반 탭에는 설치 안내와 알림함 유지", async ({ page, context }) => {
  await signIn(context, e2eUsers.applicant.id);
  await page.addInitScript(() => { Object.defineProperty(navigator, "userAgent", { value: "iPhone Safari" }); });
  await page.goto("/my/notifications");
  await page.getByRole("button", { name: /푸시 알림/ }).click();
  await expect(page.getByText("Safari에서 공유 → 홈 화면에 추가")).toBeVisible();
  await expect(page.getByRole("switch", { name: "이 기기에서 알림 켜기" })).toHaveCount(0);
  await expect(page.getByText("아직 알림이 없어요")).toBeVisible();
});


test("알림 거부에도 기존 알림함을 사용할 수 있다", async ({ page, context }) => {
  await signIn(context, e2eUsers.applicant.id);
  await page.addInitScript(() => { Notification.requestPermission = async () => "denied"; });
  await page.goto("/my/notifications");
  await page.getByRole("button", { name: /푸시 알림/ }).click();
  await page.getByRole("switch", { name: "이 기기에서 알림 켜기" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "알림이 허용되지 않았어요" })).toBeVisible();
  expect(await db.pushSubscription.count()).toBe(0);
  await expect(page.getByText("아직 알림이 없어요")).toBeVisible();
});

test("테니스 프로필이 없는 운영자도 수신 설정과 알림을 이용한다", async ({ page, context }) => {
  await db.user.update({ where: { id: e2eUsers.operator.id }, data: { onboardingCompletedAt: null } });
  await signIn(context, e2eUsers.operator.id);
  await page.goto("/partner");
  await page.getByRole("link", { name: "알림·수신 설정 →" }).click();
  await expect(page).toHaveURL(/\/my\/notifications$/);
  await expect(page.getByRole("button", { name: /푸시 알림/ })).toBeVisible();
});

test("알림 목록은 종류·미읽음을 구분하고 읽음 실패 시 원래 상태를 유지한다", async ({ page, context }) => {
  await signIn(context, e2eUsers.applicant.id);
  await db.notification.createMany({ data: [
    { userId: e2eUsers.applicant.id, type: "APPLICATION_ACCEPTED", title: "신청이 수락됐어요", body: "매칭 상세를 확인해 주세요." },
    { userId: e2eUsers.applicant.id, type: "COURT_MATCH_CONFIRMED", title: "참가가 확정됐어요", body: "입금이 확인됐어요." },
  ] });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/my/notifications");
  await expect(page.getByRole("button", { name: /푸시 알림/ })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("img", { name: "읽지 않음" })).toHaveCount(2);
  await expect(page.getByRole("button", { name: /코트 매칭.*참가가 확정/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.route("**/api/v1/me/notifications/read", route => route.fulfill({ status: 500, json: { error: { message: "잠시 후 다시 시도해 주세요." } } }));
  await page.getByRole("button", { name: "모두 읽음" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "잠시 후 다시 시도해 주세요" })).toBeVisible();
  await expect(page.getByRole("img", { name: "읽지 않음" })).toHaveCount(2);
  await page.unroute("**/api/v1/me/notifications/read");
  await page.getByRole("button", { name: "모두 읽음" }).click();
  await expect(page.getByRole("img", { name: "읽지 않음" })).toHaveCount(0);
  expect(await db.notification.count({ where: { userId: e2eUsers.applicant.id, readAt: null } })).toBe(0);
});

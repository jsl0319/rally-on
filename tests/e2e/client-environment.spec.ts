import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { PrismaClient } from "@/generated/prisma/client";
import { createPrismaPg } from "../../src/server/db/prisma-adapter";
import { E2E_AUTH_SECRET, E2E_BASE_URL, requireE2eDatabaseUrl } from "./e2e-environment";

const db = new PrismaClient({ adapter: createPrismaPg(requireE2eDatabaseUrl()) });
const userId = randomUUID();
test.beforeAll(async () => {
  await db.user.create({ data: { id: userId, nickname: "환경확인", nicknameConfirmedAt: new Date(), onboardingCompletedAt: new Date() } });
});
test.afterAll(async () => {
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

const cases = [
  { name: "Android 검증 앱", ua: "Android 14 RallyOnNativePrototype/0.0.1", platform: "Linux aarch64", native: "android", apple: false, push: "native-android" },
  { name: "Android Chrome", ua: "Android 14 Chrome/130.0", platform: "Linux aarch64", apple: false, push: "supported" },
  { name: "Samsung Internet", ua: "Android 14 SamsungBrowser/27.0 Chrome/125.0", platform: "Linux aarch64", apple: false, push: "supported" },
  { name: "iPhone 검증 앱", ua: "iPhone OS 18_0 RallyOnNativePrototype/0.0.1", platform: "iPhone", native: "ios", apple: true, push: "install" },
  { name: "iPhone Chrome", ua: "iPhone OS 18_0 CriOS/130.0 Safari/604.1", platform: "iPhone", apple: true, push: "install" },
  { name: "iPad 데스크톱 보기 홈 화면 웹앱", ua: "Macintosh Intel Mac OS X 10_15 Safari/605.1", platform: "MacIntel", standalone: true, apple: true, push: "supported" },
  { name: "Mac 웹", ua: "Macintosh Intel Mac OS X 10_15 Chrome/130.0", platform: "MacIntel", touch: 0, apple: true, push: "supported" },
  { name: "Windows 미지원 브라우저", ua: "Windows NT 10.0", platform: "Win32", capabilities: false, apple: false, push: "unsupported" },
] as const;

for (const scenario of cases) {
  test(`${scenario.name}: 로그인과 알림 안내가 실행 환경에 맞는다`, async ({ browser }, testInfo) => {
    const hints = { native: "", standalone: false, touch: 5, capabilities: true, ...scenario };
    const context = await browser.newContext({ baseURL: E2E_BASE_URL, userAgent: hints.ua, viewport: { width: hints.platform === "Linux aarch64" ? 800 : 375, height: 812 }, hasTouch: true, reducedMotion: "reduce", serviceWorkers: "block" });
    await context.addInitScript(hints => {
      Object.defineProperty(navigator, "platform", { configurable: true, value: hints.platform });
      Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: hints.touch });
      Object.defineProperty(navigator, "standalone", { configurable: true, value: hints.standalone });
      Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: async () => undefined } });
      if (hints.native) Object.defineProperty(window, "Capacitor", { value: { getPlatform: () => hints.native, isNativePlatform: () => true } });
      if (hints.capabilities) {
        Object.defineProperty(window, "PushManager", { configurable: true, value: {} });
        Object.defineProperty(window, "Notification", { configurable: true, value: { permission: "default" } });
      } else Reflect.deleteProperty(window, "PushManager");
    }, hints);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    for (const path of ["/", "/login"]) {
      await page.goto(path);
      await expect(page.getByRole("button", { name: "카카오로 시작하기", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "테니스장을 운영하고 계신가요?", exact: true })).toBeVisible();
      await expect(page.locator("[data-entry-actions]")).toHaveAttribute("data-apple-preview", String(scenario.apple));
      const apple = page.getByRole("button", { name: /Apple로 시작하기/ });
      if (scenario.apple) { await expect(apple).toBeVisible(); await expect(apple).toBeDisabled(); }
      else await expect(apple).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath("login.png"), fullPage: true });
    // Local E2E account only. No production authentication or push delivery is used.
    const value = await encode({ token: { sub: userId, userId }, secret: E2E_AUTH_SECRET, salt: "authjs.session-token", maxAge: 3600 });
    await context.addCookies([{ name: "authjs.session-token", value, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
    let pushRequests = 0;
    await page.route("**/api/v1/me/push", route => {
      pushRequests++;
      return route.fulfill({ json: { enabled: true, subscriptionId: null } });
    });
    await page.goto("/my/notifications");
    const panel = page.getByRole("region", { name: "푸시 알림 설정" });
    await panel.getByRole("button", { name: /푸시 알림/ }).click();
    if (scenario.push === "native-android") {
      await expect(panel.getByText("Chrome에서 랠리온 웹사이트를 열고 로그인", { exact: true })).toBeVisible();
      await expect(panel.getByText(/Safari|아이폰|iOS/)).toHaveCount(0);
    } else if (scenario.push === "install") {
      await expect(panel.getByText("아이폰·아이패드에서 알림 받기", { exact: true })).toBeVisible();
      await expect(panel.getByText("브라우저의 공유 → 홈 화면에 추가", { exact: true })).toBeVisible();
    } else if (scenario.push === "unsupported") {
      await expect(panel.getByText(/이 환경에서는 웹 알림을 사용할 수 없어요/)).toBeVisible();
    } else {
      await expect(panel.getByRole("switch", { name: "이 기기에서 알림 켜기" })).toBeEnabled();
      await expect(panel.getByText(/Safari|홈 화면에 추가/)).toHaveCount(0);
    }
    if (scenario.push !== "supported") {
      await expect(panel.getByRole("switch")).toHaveCount(0);
      expect(pushRequests).toBe(0);
    } else expect(pushRequests).toBeGreaterThan(0);
    await page.screenshot({ path: testInfo.outputPath("push-guidance.png"), fullPage: true });
    expect(errors).toEqual([]);
    await context.close();
  });
}

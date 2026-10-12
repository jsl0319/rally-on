import { expect, test, type BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { Client } from "pg";
import { E2E_AUTH_SECRET, E2E_BASE_URL, requireE2eDatabaseUrl } from "./e2e-environment";
import { disconnectE2eDatabase, e2eUsers, resetE2eDatabase } from "./fixtures";

test.afterAll(disconnectE2eDatabase);

async function signIn(context: BrowserContext) {
  const userId = e2eUsers.applicant.id;
  const value = await encode({ token: { sub: userId, userId }, secret: E2E_AUTH_SECRET, salt: "authjs.session-token", maxAge: 3600 });
  await context.addCookies([{ name: "authjs.session-token", value, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
}

// Hold the actual server-side account lookup, not just the later list API.
// This reproduces the intermittent Suspense fallback on a slow connection/DB.
async function withSlowAccountLookup(check: () => Promise<void>) {
  const db = new Client({ connectionString: requireE2eDatabaseUrl() });
  await db.connect();
  try {
    await db.query("BEGIN");
    await db.query("SET LOCAL lock_timeout = '5s'");
    await db.query('LOCK TABLE "users" IN ACCESS EXCLUSIVE MODE');
    await check();
  } finally {
    await db.query("ROLLBACK");
    await db.end();
  }
}

for (const startPath of ["/", "/my"]) {
  test(`메뉴 복귀는 서버가 지연돼도 브랜드 대신 랠리 로더를 유지한다 · 첫 경로 ${startPath}`, async ({ page, context }) => {
    test.setTimeout(90000);
    await resetE2eDatabase();
    await signIn(context);
    await page.setViewportSize({ width: 375, height: 812 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));

    if (startPath === "/") {
      await withSlowAccountLookup(async () => {
        await page.goto("/", { waitUntil: "commit" });
        await expect(page.locator("[data-brand-launch]")).toBeVisible();
      });
      await expect(page.getByRole("heading", { name: "매칭", exact: true })).toBeVisible();
    } else {
      await page.goto(startPath);
    }

    // Watch inserted nodes as well as the final DOM so a one-frame flash fails.
    await page.evaluate(() => {
      document.documentElement.dataset.brandFlashed = "false";
      new MutationObserver(records => {
        if (records.some(record => [...record.addedNodes].some(node => node instanceof Element &&
          (node.matches("[data-brand-launch]") || node.querySelector("[data-brand-launch]"))))) {
          document.documentElement.dataset.brandFlashed = "true";
        }
      }).observe(document.body, { childList: true, subtree: true });
    });

    for (const label of ["마이", "코트 매칭", "채팅"]) {
      const menu = page.getByRole("navigation", { name: "주요 메뉴" });
      await menu.getByRole("link", { name: label, exact: true }).click();
      await expect(page).not.toHaveURL(E2E_BASE_URL + "/");
      await expect(menu.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
      await withSlowAccountLookup(async () => {
        await menu.getByRole("link", { name: "매칭", exact: true }).click();
        await expect(page.getByRole("status").filter({ hasText: "매칭을 불러오고 있어요." })).toBeVisible();
        await expect(page.getByRole("heading", { name: "매칭", exact: true })).toBeVisible();
        await expect(menu).toBeVisible();
        await expect(page.locator("[data-brand-launch]")).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.dataset.brandFlashed)).toBe("false");
      });
      await expect(page.getByRole("status").filter({ hasText: "매칭을 불러오고 있어요." })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}

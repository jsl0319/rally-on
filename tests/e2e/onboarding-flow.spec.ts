import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test, type BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";

import { PrismaClient } from "@/generated/prisma/client";

import { E2E_AUTH_SECRET, E2E_BASE_URL, requireE2eDatabaseUrl } from "./e2e-environment";
import { resetE2eDatabase } from "./fixtures";

/**
 * 가입 직후 사람이 처음 만나는 화면을 지킨다.
 *
 * 온보딩 마지막 버튼이 `router.replace("/")`였는데 그 화면의 주소가 이미 "/"라
 * 아무 일도 일어나지 않았다. 신규 가입자 전원이 완성 화면에 갇혔고, 이 경로를
 * 덮는 검사가 하나도 없어서 아무도 몰랐다.
 */

const newcomer = { id: "20000000-0000-4000-8000-000000000009", nickname: "새사용자" };
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: requireE2eDatabaseUrl() }) });

async function signInAs(context: BrowserContext, userId: string) {
  const value = await encode({
    token: { sub: userId, userId },
    secret: E2E_AUTH_SECRET,
    salt: "authjs.session-token",
    maxAge: 60 * 60,
  });
  await context.addCookies([{ name: "authjs.session-token", value, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
}

test.beforeAll(async () => {
  await resetE2eDatabase();
  await prisma.user.create({ data: { id: newcomer.id, nickname: newcomer.nickname } });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("가입 직후 온보딩을 마치면 홈에 도착한다", async ({ browser }) => {
  const context = await browser.newContext();
  await signInAs(context, newcomer.id);
  const page = await context.newPage();

  await page.goto("/");
  await expect(page.getByRole("button", { name: "이 이름으로 시작할게요" })).toBeVisible({ timeout: 20_000 });
  // 진행 표시는 입력 화면 수와 같아야 한다. 닉네임과 첫 질문이 둘 다 1/4이던 적이 있다.
  await expect(page.getByText("1/5")).toBeVisible();

  await page.locator("input[type='text']").first().fill("코트새내기");
  await page.getByRole("button", { name: "이 이름으로 시작할게요" }).click();
  await expect(page.getByText("2/5")).toBeVisible();

  await page.getByText("6개월~1년").click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByText("몇 번씩 주고받을 수 있어요").click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByText("규칙은 알고 있어요").click();
  await page.getByRole("button", { name: "다음" }).click();

  await expect(page.getByText("5/5")).toBeVisible();
  await page.getByText("편하게 공 주고받기").click();
  await page.getByRole("button", { name: "여자" }).click();
  await page.getByRole("button", { name: "프로필 완성하기" }).click();

  await expect(page.getByRole("button", { name: "추천 매치 보기" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "추천 매치 보기" }).click();

  // 여기서 막히면 신규 가입자는 서비스를 한 번도 보지 못한다.
  await expect(page.getByRole("heading", { name: "매칭 둘러보기" })).toBeVisible({ timeout: 15_000 });
  await context.close();
});

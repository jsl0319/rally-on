import { expect, test, type BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { PrismaClient } from "@/generated/prisma/client";
import { createPrismaPg } from "../../src/server/db/prisma-adapter";
import { E2E_AUTH_SECRET, E2E_BASE_URL, requireE2eDatabaseUrl } from "./e2e-environment";
import { disconnectE2eDatabase, e2eUsers, resetE2eDatabase } from "./fixtures";

const prisma = new PrismaClient({ adapter: createPrismaPg(requireE2eDatabaseUrl()) });
async function signIn(context: BrowserContext, userId: string) {
  const value = await encode({ token: { sub: userId, userId }, secret: E2E_AUTH_SECRET, salt: "authjs.session-token", maxAge: 3600 });
  await context.addCookies([{ name: "authjs.session-token", value, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
}
test.afterAll(async () => { await prisma.$disconnect(); await disconnectE2eDatabase(); });

test("일반 매칭 상세는 작은 화면에서도 핵심 정보·신청 행동을 유지하고 오류 뒤 입력을 보존한다", async ({ page, context }) => {
  await resetE2eDatabase();
  const startsAt = new Date(Date.now() + 7 * 86400000);
  startsAt.setUTCHours(1, 0, 0, 0);
  const match = await prisma.match.create({ data: {
    hostUserId: e2eUsers.host.id, clientRequestId: crypto.randomUUID(), title: "일반 매칭 상세 테스트",
    courtSource: "EXTERNAL_RESERVED", externalCourtName: "한강 테니스 코트", externalCourtAddress: "서울 마포구 월드컵로 25", externalCourtNumber: "2번 코트",
    startsAt, endsAt: new Date(startsAt.getTime() + 2 * 3600000),
    recruitCount: 3, maleRecruitCount: 1, femaleRecruitCount: 2, gameType: "MIXED_DOUBLES", totalCourtFeeKrw: 12000,
    partnerPreference: "COMPLETE_BEGINNER_WELCOME", introduction: "가볍게 랠리부터 시작해요. 실수해도 괜찮아요!\n함께 즐겁게 연습하실 분을 기다려요.",
    purposes: { create: [{ purpose: "RALLY_PRACTICE" }, { purpose: "GAME_INTRO" }] },
  } });
  await signIn(context, e2eUsers.applicant.id);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/matches/${match.id}?returnTo=%2Factivity%2Fsent`);
  await expect(page.getByRole("heading", { name: "한강 테니스 코트" })).toBeVisible();
  await expect(page.getByText("남자 1명 · 여자 2명 남음")).toBeInViewport();
  await expect(page.locator("header").getByText("12,000원", { exact: true })).toBeInViewport();
  await expect(page.getByRole("heading", { name: "정산 정보" })).toHaveCount(0);
  await expect.poll(() => page.getByRole("img", { name: "실제 장소와 다른 테니스장 견본 사진" }).evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: "/private/tmp/rally-general-detail-375.png" });
  await page.screenshot({ path: "/private/tmp/rally-general-detail-full.png", fullPage: true });

  await page.getByRole("heading", { name: "모집자 정보" }).scrollIntoViewIfNeeded();
  await expect(page.getByText("매칭 상세", { exact: true })).toBeInViewport();
  await expect(page.getByRole("button", { name: "같이 치기", exact: true })).toBeInViewport();
  const reasons = page.locator("details");
  await expect(reasons).not.toHaveAttribute("open");
  await reasons.getByText("나와 잘 맞는 점", { exact: true }).click();
  await expect(reasons.locator("li").first()).toBeVisible();
  await page.screenshot({ path: "/private/tmp/rally-general-host-375.png" });

  await page.route(`**/api/v1/matches/${match.id}/directions`, route => route.fulfill({ status: 503, json: { error: { message: "위치를 확인하지 못했어요." } } }));
  await page.getByRole("button", { name: "카카오맵 길찾기" }).click();
  await expect(page.locator("article").getByRole("alert")).toHaveText("위치를 확인하지 못했어요.");
  await expect(page.getByRole("link", { name: "카카오맵에서 위치 검색" })).toHaveAttribute("href", /^https:\/\/map\.kakao\.com\/link\/search\//);

  // iPhone 안전 영역과 좁은 화면, 키보드가 차지한 화면 높이에서도 시트 행동에 접근한다.
  await page.addStyleTag({ content: ":root { --rally-safe-top: 47px; }" });
  for (const [width, height] of [[320, 568], [375, 460], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole("button", { name: "같이 치기", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "같이 치기" });
    await expect(dialog.getByRole("button", { name: "신청 보내기" })).toBeInViewport();
    await dialog.getByLabel(/모집자에게 보낼 자기소개/).fill("천천히 함께 연습하고 싶어요.");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(async () => {
      const bounds = await dialog.boundingBox();
      return Boolean(bounds && bounds.y >= 47 && bounds.y + bounds.height <= height + 1);
    }).toBe(true);
    await dialog.getByRole("button", { name: "취소", exact: true }).click();
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "같이 치기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "같이 치기" });
  await expect(dialog.getByLabel(/모집자에게 보낼 자기소개/)).toHaveValue("천천히 함께 연습하고 싶어요.");
  await expect(dialog.getByRole("button", { name: "신청 보내기" })).toBeInViewport();
  await expect.poll(async () => {
    const bounds = await dialog.boundingBox();
    return bounds ? bounds.y + bounds.height : Infinity;
  }).toBeLessThanOrEqual(813);
  await page.screenshot({ path: "/private/tmp/rally-general-apply-375.png" });
  await page.route(`**/api/v1/matches/${match.id}/applications`, route => route.fulfill({ status: 409, json: { error: { code: "APPLICATION_ALREADY_EXISTS", message: "이미 신청한 매칭이에요." } } }));
  await dialog.getByRole("button", { name: "신청 보내기" }).click();
  await expect(dialog.getByRole("alert")).toContainText("이미 신청한 매칭이에요.");
  await expect(dialog.getByRole("link", { name: "신청 내역 보기" })).toHaveAttribute("href", "/activity/sent");
  await expect(dialog.getByLabel(/모집자에게 보낼 자기소개/)).toHaveValue("천천히 함께 연습하고 싶어요.");
  expect(errors).toEqual([]);
});

test("마감·과거 코트 미정·철회된 신청은 신청 가능 상태로 오인하지 않는다", async ({ page, context }) => {
  const fixture = await resetE2eDatabase();
  await signIn(context, e2eUsers.outsider.id);
  await page.goto(`/matches/${fixture.fullMatchId}`);
  await expect(page.getByText("매칭을 찾을 수 없어요.")).toBeVisible();
  await expect(page.getByRole("button", { name: "같이 치기", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "채팅방 열기" })).toHaveCount(0);

  await signIn(context, e2eUsers.applicant.id);
  await page.goto(`/matches/${fixture.fullMatchId}`);
  await expect(page.getByRole("link", { name: "채팅방 열기" })).toHaveAttribute("href", `/chats/${fixture.fullMatchId}`);
  await page.goto(`/matches/${fixture.legacyMatchId}`);
  await expect(page.getByText("아직 정해진 코트가 없어요. 기존 참가자와 함께 확인해 주세요.")).toBeVisible();
  await expect(page.locator("header").getByText("미정", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "카카오맵 길찾기" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "같이 치기", exact: true })).toHaveCount(0);

  await prisma.matchApplication.update({ where: { id: fixture.fullMatchApplicationId }, data: { status: "WITHDRAWN" } });
  await prisma.match.update({ where: { id: fixture.fullMatchId }, data: { totalCourtFeeKrw: 0 } });
  await page.goto(`/matches/${fixture.fullMatchId}`);
  await expect(page.getByRole("link", { name: "신청 내역 보기", exact: true })).toBeVisible();
  await expect(page.getByText(/검토 중/)).toHaveCount(0);
  await expect(page.locator("header").getByText("0원", { exact: true })).toBeVisible();
});

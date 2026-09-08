import { encode } from "next-auth/jwt";
import { expect, test, type BrowserContext } from "@playwright/test";

import { E2E_AUTH_SECRET, E2E_BASE_URL } from "./e2e-environment";
import { disconnectE2eDatabase, e2eUsers, resetE2eDatabase, type E2eFixture } from "./fixtures";

async function signInAs(context: BrowserContext, userId: string) {
  const value = await encode({
    token: { sub: userId, userId },
    secret: E2E_AUTH_SECRET,
    salt: "authjs.session-token",
    maxAge: 60 * 60,
  });
  await context.addCookies([{ name: "authjs.session-token", value, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
}

let fixture: E2eFixture;

test.beforeEach(async () => {
  fixture = await resetE2eDatabase();
});

test.afterAll(async () => {
  await disconnectE2eDatabase();
});

test("코트 매칭은 모바일에서도 상단 제목과 하단 메뉴를 유지한다", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await signInAs(context, e2eUsers.host.id);
  const page = await context.newPage();

  await page.goto("/partner-sessions");

  await expect(page.getByRole("heading", { name: "코트 매칭" })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "주요 메뉴" });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link", { name: "매칭", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "코트 매칭", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(navigation.getByRole("link", { name: "채팅", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "마이", exact: true })).toBeVisible();

  await context.close();
});

test("참가 신청과 수락 뒤 채팅은 멤버에게만 열리고 제3자는 읽지 못한다", async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await signInAs(hostContext, e2eUsers.host.id);
  const hostPage = await hostContext.newPage();

  await hostPage.goto("/matches/new");
  await expect(hostPage.getByRole("heading", { name: "매칭 개설" })).toBeVisible();
  await expect(hostPage.getByRole("heading", { name: "매칭 기본 정보" })).toBeVisible();
  await expect(hostPage.getByRole("link", { name: /코트 매칭 둘러보기/ })).toHaveCount(0);
  const courtSearchButton = hostPage.getByRole("button", { name: "테니스장 검색" });
  await expect(courtSearchButton).toBeVisible();
  await courtSearchButton.click();
  const courtSearchDialog = hostPage.getByRole("dialog", { name: "테니스장 검색" });
  await courtSearchDialog.getByRole("button", { name: "테니스장 직접 입력" }).click();
  const manualEntryDialog = hostPage.getByRole("dialog", { name: "테니스장 직접 입력" });
  await manualEntryDialog.getByLabel("코트장 이름").fill("E2E 테니스장");
  await manualEntryDialog.getByLabel("코트장 주소").fill("서울시 E2E 마포구 1");
  await manualEntryDialog.getByRole("button", { name: "입력 완료" }).click();
  const startsOn = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString().slice(0, 10);
  await hostPage.getByLabel("매칭 날짜").fill(startsOn);
  await hostPage.getByLabel("시작 시간").fill("10:00");
  await hostPage.getByLabel("종료 시간").fill("13:30");
  await expect(hostPage.getByLabel("매칭 제목")).toHaveCount(0);
  await hostPage.getByRole("button", { name: "랠리", exact: true }).click();
  await hostPage.getByLabel("은행", { exact: true }).fill("테스트은행");
  await hostPage.getByLabel("계좌번호", { exact: true }).fill("123-456-789");
  await hostPage.getByLabel("예금주", { exact: true }).fill("테스트모집자");
  await hostPage.getByLabel("매칭 소개글", { exact: true }).fill("편하게 함께 연습해요.");
  await expect(hostPage.getByRole("button", { name: "자동으로 소개 만들기" })).toHaveCount(0);
  await hostPage.getByLabel("전체 코트 비용").fill("24000");
  await hostPage.getByRole("button", { name: "미리보기" }).click();
  const previewDialog = hostPage.getByRole("dialog", { name: "미리보기" });
  await previewDialog.getByRole("button", { name: "매칭 공개하기" }).click();
  await expect(hostPage).toHaveURL(/\/matches\/[0-9a-f-]{36}$/);
  await expect(hostPage.getByText("모집자가 코트를 예약했어요")).toBeVisible();
  const matchId = new URL(hostPage.url()).pathname.split("/").at(-1);
  if (!matchId) throw new Error("생성된 Match ID를 확인하지 못했어요.");

  const applicantContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await signInAs(applicantContext, e2eUsers.applicant.id);
  const applicantPage = await applicantContext.newPage();

  await applicantPage.goto(`/matches/${matchId}`);
  await expect(applicantPage.getByRole("heading", { name: "E2E 테니스장" })).toBeVisible();
  await expect(applicantPage.getByRole("heading", { name: "정산 정보" })).toHaveCount(0);
  await applicantPage.getByRole("button", { name: "같이 치기" }).click();
  await applicantPage.getByLabel(/모집자에게 한마디/).fill("천천히 랠리하며 함께 연습하고 싶어요.");
  await applicantPage.getByRole("button", { name: "신청하기", exact: true }).click();
  await expect(applicantPage.getByRole("heading", { name: "신청을 보냈어요" })).toBeVisible();

  await hostPage.goto(`/activity/received/${matchId}`);
  await expect(hostPage.getByText("검토할 신청 1건").first()).toBeVisible();
  await hostPage.getByRole("link", { name: /신청 내용 보기/ }).click();
  await expect(hostPage.getByRole("heading", { name: `${e2eUsers.applicant.nickname}님을 검토해요` })).toBeVisible();
  await hostPage.getByRole("button", { name: "수락하기" }).click();
  await hostPage.getByRole("button", { name: "네, 함께 칠게요" }).click();
  await expect(hostPage.getByRole("heading", { name: "같이 치기로 했어요" })).toBeVisible();

  await applicantPage.goto(`/matches/${matchId}`);
  await expect(applicantPage.getByText("123-456-789", { exact: true })).toBeVisible();
  await applicantPage.goto("/activity/sent");
  const externalReservedCard = applicantPage.locator("article").filter({ hasText: "E2E 테니스장" });
  await expect(externalReservedCard.getByText("같이 치게 됐어요. 매칭 정보를 확인해 주세요.")).toBeVisible();
  await externalReservedCard.getByRole("link", { name: "채팅방 열기" }).click();
  await expect(applicantPage.getByRole("heading", { name: "E2E 테니스장" })).toBeVisible();
  await expect(applicantPage.getByRole("button", { name: "사진 추가" })).toBeVisible();
  await applicantPage.getByLabel("메시지").fill("E2E 자동화 메시지");
  const [messageResponse] = await Promise.all([
    applicantPage.waitForResponse((response) => response.url().includes(`/api/v1/matches/${matchId}/conversation/messages`) && response.request().method() === "POST"),
    applicantPage.getByRole("button", { name: "보내기" }).click(),
  ]);
  expect(messageResponse.ok()).toBeTruthy();
  await expect(applicantPage.getByText("E2E 자동화 메시지")).toBeVisible();
  await expect(applicantPage.getByLabel("아직 읽지 않은 상대 1명")).toBeVisible();

  await hostPage.goto(`/chats/${matchId}`);
  await expect(hostPage.getByText("E2E 자동화 메시지")).toBeVisible();
  await expect(applicantPage.getByLabel("아직 읽지 않은 상대 1명")).toHaveCount(0, { timeout: 12_000 });

  const outsiderContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await signInAs(outsiderContext, e2eUsers.outsider.id);
  const outsiderPage = await outsiderContext.newPage();
  await outsiderPage.goto(`/chats/${matchId}`);
  await expect(outsiderPage.getByText("E2E 자동화 메시지")).toHaveCount(0);
  await expect(outsiderPage.getByRole("link", { name: "채팅 목록" })).toBeVisible();

  await applicantContext.close();
  await hostContext.close();
  await outsiderContext.close();
});

test("공개된 코트 시간은 하나의 코트 매칭으로 열고 신청·수락·채팅까지 이어진다", async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await signInAs(hostContext, e2eUsers.host.id);
  const hostPage = await hostContext.newPage();

  await hostPage.goto(`/partner-sessions/${fixture.partnerSlotId}`);
  await expect(hostPage.getByText("Rally On에서 준비한 코트", { exact: true })).toBeVisible();
  await expect(hostPage.getByText("E2E 준비된 테니스장")).toBeVisible();
  await expect(hostPage.getByRole("link", { name: "이 시간으로 코트 매칭 열기" })).toBeVisible();
  await hostPage.getByRole("link", { name: "이 시간으로 코트 매칭 열기" }).click();
  await expect(hostPage.getByRole("heading", { name: /함께 칠 메이트를/ })).toBeVisible();
  await expect(hostPage.getByLabel("매칭 제목")).toHaveCount(0);
  await hostPage.getByRole("button", { name: "기타", exact: true }).click();
  await hostPage.getByRole("button", { name: "미리보기" }).click();
  const partnerPreviewDialog = hostPage.getByRole("dialog", { name: "미리보기" });
  await partnerPreviewDialog.getByRole("button", { name: "이 시간으로 코트 매칭 열기" }).click();
  await expect(hostPage).toHaveURL(/\/matches\/[0-9a-f-]{36}$/);
  await expect(hostPage.getByText("Rally On에서 준비한 코트예요")).toBeVisible();
  const matchId = new URL(hostPage.url()).pathname.split("/").at(-1);
  if (!matchId) throw new Error("생성된 코트 매칭 ID를 확인하지 못했어요.");

  const applicantContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await signInAs(applicantContext, e2eUsers.applicant.id);
  const applicantPage = await applicantContext.newPage();
  await applicantPage.goto(`/matches/${matchId}`);
  await expect(applicantPage.getByRole("heading", { name: "E2E 준비된 테니스장" })).toBeVisible();
  await expect(applicantPage.getByText("Rally On에서 준비한 코트예요")).toBeVisible();
  await applicantPage.getByRole("button", { name: "같이 치기" }).click();
  await applicantPage.getByRole("button", { name: "신청하기", exact: true }).click();
  await expect(applicantPage.getByRole("heading", { name: "신청을 보냈어요" })).toBeVisible();

  await hostPage.goto(`/activity/received/${matchId}`);
  await hostPage.getByRole("link", { name: /신청 내용 보기/ }).click();
  await hostPage.getByRole("button", { name: "수락하기" }).click();
  await hostPage.getByRole("button", { name: "네, 함께 칠게요" }).click();
  await expect(hostPage.getByRole("heading", { name: "같이 치기로 했어요" })).toBeVisible();

  await applicantPage.goto("/activity/sent");
  await applicantPage.locator("article").filter({ hasText: "E2E 준비된 테니스장" }).getByRole("link", { name: "채팅방 열기" }).click();
  await applicantPage.getByLabel("메시지").fill("준비된 코트 E2E 메시지");
  await applicantPage.getByRole("button", { name: "보내기" }).click();
  await expect(applicantPage.getByText("준비된 코트 E2E 메시지")).toBeVisible();
  await hostPage.goto(`/chats/${matchId}`);
  await expect(hostPage.getByText("준비된 코트 E2E 메시지")).toBeVisible();

  await applicantContext.close();
  await hostContext.close();
});

test("과거 코트 미정 매칭은 비공개·신청 불가이지만 기존 참여자의 이력과 채팅·완료 처리는 유지한다", async ({ browser }) => {
  const applicantContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await signInAs(applicantContext, e2eUsers.applicant.id);
  const applicantPage = await applicantContext.newPage();

  await applicantPage.goto("/");
  await expect(applicantPage.getByText(fixture.legacyMatchTitle)).toHaveCount(0);
  await applicantPage.goto(`/chats/${fixture.legacyMatchId}`);
  await expect(applicantPage.getByRole("heading", { name: fixture.legacyMatchTitle })).toBeVisible();
  await expect(applicantPage.getByText("과거 매칭 기록이에요.")).toBeVisible();

  const outsiderContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await signInAs(outsiderContext, e2eUsers.outsider.id);
  const outsiderPage = await outsiderContext.newPage();
  await outsiderPage.goto("/");
  const applicationAttempt = await outsiderPage.evaluate(async (matchId) => {
    const response = await fetch(`/api/v1/matches/${matchId}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: null }),
    });
    const body = await response.json() as { error?: { code?: string } };
    return { status: response.status, code: body.error?.code ?? null };
  }, fixture.legacyMatchId);
  expect(applicationAttempt).toEqual({ status: 409, code: "LEGACY_MATCH_NOT_JOINABLE" });
  await outsiderPage.goto(`/matches/${fixture.legacyMatchId}`);
  await expect(outsiderPage.getByText("매칭을 찾을 수 없어요.")).toBeVisible();

  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await signInAs(hostContext, e2eUsers.host.id);
  const hostPage = await hostContext.newPage();
  await hostPage.goto(`/matches/${fixture.legacyMatchId}`);
  await expect(hostPage.getByRole("heading", { name: "코트 미정" })).toBeVisible();
  const completion = await hostPage.evaluate(async (matchId) => {
    const response = await fetch(`/api/v1/matches/${matchId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedVersion: 1 }),
    });
    const body = await response.json() as { status?: string };
    return { status: response.status, matchStatus: body.status ?? null };
  }, fixture.legacyMatchId);
  expect(completion).toEqual({ status: 200, matchStatus: "COMPLETED" });

  await applicantContext.close();
  await outsiderContext.close();
  await hostContext.close();
});

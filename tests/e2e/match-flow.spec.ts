import { encode } from "next-auth/jwt";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

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

/**
 * 매칭 날짜·시간은 텍스트 입력이 아니라 바텀시트 휠 피커로 고른다.
 * 휠은 스크롤이 멈춘 뒤에야 선택을 확정하므로, 여러 칸을 한 번에 움직이면
 * 스냅과 겹쳐 값이 어긋난다. 한 칸씩 누르고 확정을 기다리며 목표까지 좁힌다.
 */
async function pickSchedule(page: Page, label: string, value: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
  const sheet = page.getByRole("dialog", { name: label });
  const spin = async (wheel: string, expected: string) => {
    const list = sheet.getByRole("listbox", { name: wheel, exact: true });
    const options = (await list.getByRole("option").allTextContents()).map((text) => text.trim());
    const target = options.indexOf(expected);
    if (target < 0) throw new Error(`${wheel} 휠에 ${expected} 항목이 없어요.`);
    await list.focus();
    for (let attempt = 0; attempt <= options.length; attempt += 1) {
      const current = ((await list.getByRole("option", { selected: true }).textContent()) ?? "").trim();
      if (current === expected) return;
      await list.press(options.indexOf(current) < target ? "ArrowDown" : "ArrowUp");
      await page.waitForTimeout(140);
    }
    throw new Error(`${wheel} 휠을 ${expected}로 맞추지 못했어요.`);
  };
  if (value.includes("-")) {
    const [year, month, day] = value.split("-").map(Number);
    await spin("연도", `${year}년`);
    await spin("월", `${month}월`);
    await spin("일", `${day}일`);
  } else {
    const [hour, minute] = value.split(":").map(Number);
    await spin("오전·오후", hour < 12 ? "오전" : "오후");
    await spin("시", String(hour % 12 || 12).padStart(2, "0"));
    await spin("분", String(minute).padStart(2, "0"));
  }
  await sheet.getByRole("button", { name: "완료", exact: true }).click();
  await expect(sheet).toHaveCount(0);
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
  await pickSchedule(hostPage, "매칭 날짜", startsOn);
  await pickSchedule(hostPage, "시작 시간", "10:00");
  await pickSchedule(hostPage, "종료 시간", "13:30");
  await expect(hostPage.getByLabel("매칭 제목")).toHaveCount(0);
  await hostPage.getByRole("button", { name: "기타", exact: true }).click();
  await hostPage.getByRole("button", { name: /스트로크 연습/ }).click();
  // 은행은 자유 입력이 아니라 은행 목록에서 고르는 select다.
  await hostPage.getByLabel("은행", { exact: true }).selectOption("KB국민은행");
  await hostPage.getByLabel("계좌번호", { exact: true }).fill("123-456-789");
  await hostPage.getByLabel("예금주", { exact: true }).fill("테스트모집자");
  // 필수 항목의 접근성 이름에는 "*"가 붙는다("매칭 소개글 *"). exact로 찾으면 안 잡힌다.
  await hostPage.getByLabel("매칭 소개글").fill("편하게 함께 연습해요.");
  await expect(hostPage.getByRole("button", { name: "자동으로 소개 만들기" })).toHaveCount(0);
  await hostPage.getByLabel("게스트 참가비용").fill("24000");
  await hostPage.getByRole("button", { name: "미리보기" }).click();
  const previewDialog = hostPage.getByRole("dialog", { name: "미리보기" });
  // 직접 예약 코트임을 알리는 문구는 미리보기 시트에 있다. 매칭 상세의 출처 배지는
  // 6479506에서 의도적으로 뺐으므로 상세에서 찾으면 안 된다.
  await expect(previewDialog.getByText("모집자가 코트를 예약했어요")).toBeVisible();
  await previewDialog.getByRole("button", { name: "매칭 공개하기" }).click();
  await expect(hostPage).toHaveURL(/\/matches\/[0-9a-f-]{36}$/);
  const matchId = new URL(hostPage.url()).pathname.split("/").at(-1);
  if (!matchId) throw new Error("생성된 Match ID를 확인하지 못했어요.");

  const applicantContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await signInAs(applicantContext, e2eUsers.applicant.id);
  const applicantPage = await applicantContext.newPage();

  await applicantPage.goto(`/matches/${matchId}`);
  await expect(applicantPage.getByRole("heading", { name: "E2E 테니스장" })).toBeVisible();
  await expect(applicantPage.getByRole("heading", { name: "정산 정보" })).toHaveCount(0);
  await applicantPage.getByRole("button", { name: "같이 치기" }).click();
  const applyDialog = applicantPage.getByRole("dialog", { name: "참가 신청" });
  await applyDialog.getByLabel(/모집자에게 보낼 자기소개/).fill("천천히 랠리하며 함께 연습하고 싶어요.");
  await applyDialog.getByRole("button", { name: "참가 신청", exact: true }).click();
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

test("공개된 코트 매칭은 신청·입금 알림·운영자 확정·채팅까지 이어진다", async ({ browser }) => {
  // 운영자가 코트 매칭을 열고, 참가자가 신청해 계좌이체로 참가를 확정하는 흐름.
  // 이 픽스처의 코트 매칭은 자동 승인이라 신청 즉시 입금 안내가 나온다.
  const applicantContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await signInAs(applicantContext, e2eUsers.applicant.id);
  const applicantPage = await applicantContext.newPage();

  await applicantPage.goto(`/partner-sessions/${fixture.partnerSlotId}`);
  await expect(applicantPage.getByRole("heading", { name: "E2E 준비된 테니스장" })).toBeVisible();
  await expect(applicantPage.getByText("선착순 자동 승인")).toBeVisible();

  await applicantPage.getByRole("button", { name: "참가 신청하기" }).click();
  const applyDialog = applicantPage.getByRole("dialog", { name: "참가 신청" });
  await applyDialog.getByRole("button", { name: "참가 신청" }).click();

  // 자동 승인이므로 바로 입금 안내가 뜬다. 식별코드는 서버가 발급한다.
  await expect(applicantPage.getByText("입금할 금액")).toBeVisible();
  await expect(applicantPage.getByText("E2E은행")).toBeVisible();
  const depositorName = applicantPage.getByLabel("실제로 보낸 입금자명");
  await expect(depositorName).toBeVisible();
  await depositorName.fill("E2E입금자");
  await applicantPage.getByRole("button", { name: "입금했어요" }).click();
  await expect(applicantPage.getByText("입금 알림을 보냈어요", { exact: false })).toBeVisible();

  // 운영자는 자기 관리 화면에서 통장과 대조한 뒤 확정한다.
  const operatorContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await signInAs(operatorContext, e2eUsers.operator.id);
  const operatorPage = await operatorContext.newPage();

  await operatorPage.goto(`/partner/court-matches/${fixture.partnerMatchId}`);
  await expect(operatorPage.getByRole("heading", { name: /입금 대기/ })).toBeVisible();
  await expect(operatorPage.getByText(e2eUsers.applicant.nickname)).toBeVisible();
  await expect(operatorPage.getByText("E2E입금자")).toBeVisible();
  await operatorPage.getByRole("button", { name: "입금 확인하고 확정" }).click();
  await expect(operatorPage.getByRole("heading", { name: /참가 확정 1명/ })).toBeVisible();

  // 확정되면 참가자에게 채팅방이 열린다.
  await applicantPage.reload();
  await expect(applicantPage.getByText("운영자가 입금을 확인했어요", { exact: false })).toBeVisible();
  await applicantPage.getByRole("link", { name: "채팅방 열기" }).click();
  await applicantPage.getByLabel("메시지").fill("코트 매칭 E2E 메시지");
  // 채팅은 서버 응답 전에 임시 말풍선을 먼저 그린다. 화면에 보이는 것만 확인하고
  // 상대 화면으로 넘어가면 저장 전에 조회해 간헐적으로 실패한다.
  const [courtMessageResponse] = await Promise.all([
    applicantPage.waitForResponse((response) => response.url().includes(`/api/v1/matches/${fixture.partnerMatchId}/conversation/messages`) && response.request().method() === "POST"),
    applicantPage.getByRole("button", { name: "보내기" }).click(),
  ]);
  expect(courtMessageResponse.ok()).toBeTruthy();
  await expect(applicantPage.getByText("코트 매칭 E2E 메시지")).toBeVisible();
  await operatorPage.goto(`/chats/${fixture.partnerMatchId}`);
  await expect(operatorPage.getByText("코트 매칭 E2E 메시지")).toBeVisible();

  await applicantContext.close();
  await operatorContext.close();
});

test("코트 매칭은 일반 매칭 목록과 매칭 상세 주소에 섞이지 않는다", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await signInAs(context, e2eUsers.applicant.id);
  const page = await context.newPage();

  // 매칭 탭은 직접 예약 매칭만 보여 준다.
  await page.goto("/");
  await expect(page.getByText(fixture.partnerMatchTitle)).toHaveCount(0);

  // 옛 주소로 들어와도 코트 매칭 전용 상세로 넘긴다.
  await page.goto(`/matches/${fixture.partnerMatchId}`);
  await expect(page).toHaveURL(new RegExp(`/partner-sessions/${fixture.partnerSlotId}$`));

  await context.close();
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

test("본문이 비어 있는 요청에는 서버 오류가 아니라 400으로 답한다", async ({ browser }) => {
  // 브라우저가 탭을 닫는 순간 전송되던 요청은 본문이 끊긴 채 도착한다.
  // 그때 500 INTERNAL_ERROR가 나가면 서버 잘못처럼 보이고 오류 로그도 쌓인다.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await signInAs(context, e2eUsers.applicant.id);
  const page = await context.newPage();
  await page.goto("/");

  const result = await page.evaluate(async (matchId) => {
    const response = await fetch(`/api/v1/court-matches/${matchId}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const body = await response.json() as { error?: { code?: string } };
    return { status: response.status, code: body.error?.code ?? null };
  }, fixture.partnerMatchId);
  expect(result).toEqual({ status: 400, code: "INVALID_REQUEST_BODY" });

  await context.close();
});

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

const kstInputNow = () => new Date(Date.now() + 9 * 60 * 60_000).toISOString().slice(0, 19);
async function saveAction(page: Page, name: string, path: string, method = "POST") {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(path) && r.request().method() === method),
    page.getByRole("button", { name, exact: true }).click(),
  ]);
  expect(response.ok(), await response.text()).toBeTruthy();
}
async function fillTransferTime(page: Page) {
  const input = page.getByLabel("실제 송금 시각 (한국 시간)");
  await expect(input).toBeVisible();
  await input.fill(kstInputNow());
}
async function recordReceipt(page: Page, amount = "36000") {
  await page.getByText("입금 대조·정정", { exact: true }).click();
  await page.getByLabel("누적 수령 금액").fill(amount);
  await page.getByLabel("은행 수령 시각 (한국 시간)").fill(kstInputNow());
  await page.getByLabel("대조·정정 사유").fill("E2E 통장 입금 대조");
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/receipt") && r.request().method() === "POST"),
    page.getByRole("button", { name: "수령 기록 저장" }).click(),
  ]);
  expect(response.ok(), await response.text()).toBeTruthy();
  await expect(page.getByText("E2E 통장 입금 대조", { exact: false }).first()).toBeAttached();
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
  const [published] = await Promise.all([
    hostPage.waitForResponse((r) => r.url().endsWith("/api/v1/matches") && r.request().method() === "POST"),
    previewDialog.getByRole("button", { name: "매칭 공개하기" }).click(),
  ]);
  expect(published.ok(), await published.text()).toBeTruthy();
  await expect(hostPage).toHaveURL(/\/matches\/[0-9a-f-]{36}$/, { timeout: 15000 });
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
  await recordReceipt(operatorPage);
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

test("확정한 참가자가 스스로 취소하면 환불 금액과 함께 환불 대기가 된다", async ({ browser }) => {
  // 픽스처의 코트 매칭은 10일 뒤라 이틀 전보다 이르다. 전액 환불 구간이다.
  const applicantContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await signInAs(applicantContext, e2eUsers.applicant.id);
  const applicantPage = await applicantContext.newPage();

  await applicantPage.goto(`/partner-sessions/${fixture.partnerSlotId}`);
  await applicantPage.getByRole("button", { name: "참가 신청하기" }).click();
  await applicantPage.getByRole("dialog", { name: "참가 신청" }).getByRole("button", { name: "참가 신청" }).click();
  await applicantPage.getByLabel("실제로 보낸 입금자명").fill("E2E입금자");
  await applicantPage.getByRole("button", { name: "입금했어요" }).click();
  await expect(applicantPage.getByText("입금 알림을 보냈어요", { exact: false })).toBeVisible();

  const operatorContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await signInAs(operatorContext, e2eUsers.operator.id);
  const operatorPage = await operatorContext.newPage();
  await operatorPage.goto(`/partner/court-matches/${fixture.partnerMatchId}`);
  await recordReceipt(operatorPage);
  await operatorPage.getByRole("button", { name: "입금 확인하고 확정" }).click();
  await expect(operatorPage.getByRole("heading", { name: /참가 확정 1명/ })).toBeVisible();

  // 참가자가 스스로 취소한다. 누르기 전에 얼마가 돌아오는지 먼저 보여 준다.
  await applicantPage.reload();
  await expect(applicantPage.getByText("운영자가 입금을 확인했어요", { exact: false })).toBeVisible();
  await applicantPage.getByRole("button", { name: "참가 취소", exact: true }).click();
  await expect(applicantPage.getByText("36,000원", { exact: false }).first()).toBeVisible();
  const [cancelled] = await Promise.all([
    applicantPage.waitForResponse((r) => r.url().endsWith("/cancel") && r.request().method() === "POST"),
    applicantPage.getByRole("button", { name: "참가 취소하기" }).click(),
  ]);
  expect(cancelled.ok(), await cancelled.text()).toBeTruthy();
  await expect(applicantPage.getByText("참가를 취소했어요", { exact: false })).toBeVisible();

  // 취소 뒤에는 환불받을 계좌를 받는다.
  await applicantPage.getByLabel("은행").fill("E2E은행");
  await applicantPage.getByLabel("계좌번호").fill("555-666-777");
  await applicantPage.getByLabel("예금주").fill("E2E참가자");
  await saveAction(applicantPage, "환불 계좌 저장", "/refund-account", "PUT");
  await expect(applicantPage.getByText("환불 계좌를 저장했어요")).toBeVisible();

  // 운영자에게는 보낼 금액과 참가자가 입력한 계좌가 보인다.
  await operatorPage.reload();
  await expect(operatorPage.getByRole("heading", { name: "반환·환불 처리" })).toBeVisible();
  await expect(operatorPage.getByText("36,000원", { exact: false }).first()).toBeVisible();
  await expect(operatorPage.getByText("555-666-777")).toBeVisible();
  await saveAction(operatorPage, "환불 처리 시작 · 36,000원", "/refund/start", "POST");
  await expect(operatorPage.getByText("송금 처리 중 · 36,000원", { exact: true })).toBeVisible();
  await applicantPage.reload();
  await expect(applicantPage.getByText("운영자가 환불을 처리하고 있어요.", { exact: false })).toBeVisible();
  await expect(applicantPage.getByRole("button", { name: "환불 계좌 저장" })).toHaveCount(0);
  await fillTransferTime(operatorPage);
  await operatorPage.getByLabel("처리 근거·메모").fill("E2E 은행에서 송금 확인");
  await saveAction(operatorPage, "송금 결과 저장", "/refund", "POST");
  await expect(operatorPage.getByText("송금 완료 기록 · 36,000원", { exact: true })).toBeVisible();
  await applicantPage.reload();
  await expect(applicantPage.getByText("실제 입금 여부는 통장에서 확인해 주세요.", { exact: false })).toBeVisible();

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

test("미확정 입금 문의를 운영자와 대조하고 전액 반환한 뒤 회원에게 답변·해결한다", async ({ browser }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  const contexts = await Promise.all([e2eUsers.applicant, e2eUsers.operator, e2eUsers.reviewer].map(async (user) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await signInAs(context, user.id);
    const page = await context.newPage(); page.on("pageerror", (error) => errors.push(error.message));
    return { context, page };
  }));
  const [member, operator, reviewer] = contexts.map((c) => c.page);
  await member.goto(`/partner-sessions/${fixture.partnerSlotId}`);
  await member.getByRole("button", { name: "참가 신청하기" }).click();
  await member.getByRole("dialog", { name: "참가 신청" }).getByRole("button", { name: "참가 신청" }).click();
  await member.getByRole("button", { name: "참가 취소", exact: true }).click();
  await member.getByRole("button", { name: "참가 취소하기" }).click();
  await expect(member.getByText("신청 철회", { exact: true }).first()).toBeVisible();
  await member.getByRole("link", { name: "입금·환불 문의" }).click();
  await member.getByLabel("문의 내용", { exact: true }).fill("취소 전에 보낸 입금이 있습니다. 확인 부탁드립니다.");
  await saveAction(member, "문의 보내기", "/support-inquiries", "POST");
  await expect(member.getByText("문의가 접수됐어요.", { exact: false })).toBeVisible();

  await reviewer.goto("/internal/support-inquiries");
  await saveAction(reviewer, "문의 담당하기", "/support-inquiries/", "POST");
  await reviewer.getByLabel("처리 유형").selectOption("REQUEST_OPERATOR");
  await reviewer.getByLabel("답변 내용").fill("이 신청의 입금을 통장에서 대조해 주세요.");
  await saveAction(reviewer, "답변·처리 저장", "/support-inquiries/", "POST");
  await expect(reviewer.getByText("운영자 확인 중", { exact: true }).last()).toBeVisible();
  await operator.goto("/partner/support-inquiries");
  await expect(operator.getByText("취소 전에 보낸 입금이 있습니다.", { exact: false })).toHaveCount(0);
  await operator.getByRole("link", { name: "해당 매칭 입금·환불 대조 →" }).click();
  await recordReceipt(operator, "18000");
  await expect(operator.getByRole("heading", { name: "반환·환불 처리" })).toBeVisible();
  await member.goto(`/partner-sessions/${fixture.partnerSlotId}`);
  await member.getByLabel("은행", { exact: true }).fill("E2E은행");
  await member.getByLabel("계좌번호").fill("555-666-777");
  await member.getByLabel("예금주").fill("E2E참가자");
  await saveAction(member, "환불 계좌 저장", "/refund-account", "PUT");
  await expect(member.getByText("환불 계좌를 저장했어요")).toBeVisible();
  await operator.reload();
  await saveAction(operator, "환불 처리 시작 · 18,000원", "/refund/start", "POST");
  await fillTransferTime(operator);
  await operator.getByLabel("처리 근거·메모").fill("E2E 미확정 입금 전액 반환 확인");
  await saveAction(operator, "송금 결과 저장", "/refund", "POST");
  await expect(operator.getByText("송금 완료 기록 · 18,000원", { exact: true })).toBeVisible();
  await operator.goto("/partner/support-inquiries");
  await operator.getByLabel("답변 내용").fill("은행 내역 대조 후 18000원 전액을 반환했습니다.");
  await saveAction(operator, "답변·처리 저장", "/support-inquiries/", "POST");
  await expect(operator.getByText("검토 중", { exact: true }).last()).toBeVisible();
  await reviewer.reload();
  await reviewer.getByLabel("답변 내용").fill("확인된 입금 18000원이 전액 반환됐습니다. 통장을 확인해 주세요.");
  await saveAction(reviewer, "답변·처리 저장", "/support-inquiries/", "POST");
  await expect(reviewer.getByText("답변 완료", { exact: true }).last()).toBeVisible();
  await reviewer.getByLabel("처리 유형").selectOption("RESOLVE");
  await reviewer.getByLabel("답변 내용").fill("전액 반환과 안내를 완료했습니다.");
  await saveAction(reviewer, "답변·처리 저장", "/support-inquiries/", "POST");
  await expect(reviewer.getByText("해결 완료", { exact: true }).last()).toBeVisible();
  await member.goto("/support/inquiry");
  await expect(member.getByText("확인된 입금 18000원이 전액 반환됐습니다.", { exact: false })).toBeVisible();
  await expect(member.getByText("해결 완료", { exact: true })).toBeVisible();
  await expect(member.getByText("이 신청의 입금을 통장에서 대조해 주세요.")).toHaveCount(0);
  await member.screenshot({ path: "/tmp/rally-money-support-member.png", fullPage: true });
  await operator.screenshot({ path: "/tmp/rally-money-support-operator.png", fullPage: true });
  expect(await member.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await Promise.all(contexts.map((c) => c.context.close()));
});

test("수락된 참가자가 취소하면 자리가 비고 모집자가 다시 모집한다", async ({ browser }) => {
  // 픽스처의 매칭은 정원 1명이 모두 차서 마감된 상태다. 참가자가 빠지면 자리가 하나 생긴다.
  const applicantContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await signInAs(applicantContext, e2eUsers.applicant.id);
  const applicantPage = await applicantContext.newPage();

  await applicantPage.goto("/activity/sent");
  await expect(applicantPage.getByRole("heading", { name: "내가 보낸 신청" })).toBeVisible();
  const card = applicantPage.locator("article").filter({ hasText: "E2E 마감 테니스장" });
  await card.getByRole("button", { name: "참가 취소" }).click();
  await expect(applicantPage.getByText("자리는 바로 비워지고", { exact: false })).toBeVisible();
  await applicantPage.getByRole("button", { name: "네, 취소할게요" }).click();
  await expect(card.getByText("참가를 취소했어요.")).toBeVisible();

  // 모집자 화면은 이름이 내용과 맞고, 비워진 자리를 다시 열 수 있다.
  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await signInAs(hostContext, e2eUsers.host.id);
  const hostPage = await hostContext.newPage();

  await hostPage.goto("/");
  await hostPage.getByRole("link", { name: /내가 만든 매칭/ }).click();
  await expect(hostPage).toHaveURL(/\/activity\/received$/);
  await expect(hostPage.getByRole("heading", { name: "내가 만든 매칭" })).toBeVisible();

  const hostedCard = hostPage.locator("section").filter({ hasText: "E2E 마감 테니스장" }).first();
  await expect(hostedCard.getByText("수락 0명 / 모집 1명", { exact: false })).toBeVisible();
  await hostedCard.getByRole("button", { name: "다시 모집하기" }).click();
  await expect(hostPage.getByText("빈 자리만큼 새 신청을 받을 수 있어요", { exact: false })).toBeVisible();
  await hostPage.getByRole("button", { name: "네, 다시 모집할게요" }).click();
  await expect(hostedCard.getByText("모집 중")).toBeVisible();

  await applicantContext.close();
  await hostContext.close();
});

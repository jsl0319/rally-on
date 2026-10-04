import { PrismaPg } from "@prisma/adapter-pg";
import { encode } from "next-auth/jwt";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { PrismaClient } from "@/generated/prisma/client";
import { E2E_AUTH_SECRET, E2E_BASE_URL, requireE2eDatabaseUrl } from "./e2e-environment";
import { disconnectE2eDatabase, e2eUsers, resetE2eDatabase } from "./fixtures";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: requireE2eDatabaseUrl() }) });
test.afterAll(async () => { await prisma.$disconnect(); await disconnectE2eDatabase(); });

async function session(browser: Browser, id: string, errors: string[]) {
  const context = await browser.newContext({ baseURL: E2E_BASE_URL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const value = await encode({ token: { sub: id, userId: id }, secret: E2E_AUTH_SECRET, salt: "authjs.session-token", maxAge: 3600 });
  await context.addCookies([{ name: "authjs.session-token", value, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page };
}

async function saveAction(page: Page, name: string, path: string, method = "POST") {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith(path) && r.request().method() === method),
    page.getByRole("button", { name, exact: true }).click(),
  ]);
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

const kstNow = () => new Date(Date.now() + 9 * 60 * 60_000).toISOString().slice(0, 19);

test("모바일 최초 코트 설정부터 직접 승인·입금 확인·채팅·취소·환불까지 화면에서 이어진다", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  await resetE2eDatabase();
  // 카카오 인증과 외부 사업자 심사는 대체한다. 이후 업무 데이터는 모두 화면에서 만든다.
  const approval = await prisma.courtOperatorApplication.create({ data: {
    applicantUserId: e2eUsers.host.id, status: "PUBLISH_APPROVED", businessName: "E2E 모바일 운영",
    businessRegistrationNumberHash: "e2e-mobile-journey", businessVerificationStatus: "VERIFIED", venueVerificationStatus: "MATCHED",
    venueName: "E2E 모바일 테니스장", venueAddress: "서울시 E2E 마포구 30", normalizedVenueKey: "e2e-mobile-court",
    publishApprovedAt: new Date(),
  } });
  const errors: string[] = [];
  const operator = await session(browser, e2eUsers.host.id, errors);
  const member = await session(browser, e2eUsers.applicant.id, errors);
  try {
    await test.step("최초 코트·연락처 설정과 경기 초안 저장", async () => {
      await operator.page.goto("/partner/application");
      await operator.page.getByRole("link", { name: "운영자 홈으로", exact: true }).click();
      await operator.page.getByRole("link", { name: "코트 기본정보 설정하기", exact: true }).click();
      const setup = operator.page.getByRole("region", { name: "최초 코트 설정" });
      await expect(setup).toContainText(approval.venueName);
      await operator.page.getByPlaceholder("예) 마포구").fill("마포");
      await setup.getByRole("button", { name: "E2E서울 · E2E 마포구", exact: true }).click();
      await setup.getByRole("button", { name: "코트 기본정보 저장·연락처 등록" }).click();
      const dialog = operator.page.getByRole("dialog");
      await dialog.getByLabel("운영자 전화번호", { exact: true }).fill("02-1234-5678");
      await dialog.getByLabel("연락 가능 시간", { exact: true }).fill("매일 09:00~18:00");
      await dialog.getByRole("checkbox").check();
      await dialog.getByRole("button", { name: "연락처 저장하기" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(operator.page.getByRole("region", { name: "문의 연락처", exact: true })).toContainText("02-1234-5678");

      await operator.page.getByLabel("코트 면", { exact: true }).fill("모바일 1번");
      const date = new Date(Date.now() + 10 * 24 * 60 * 60_000).toISOString().slice(0, 10);
      await operator.page.getByLabel("날짜", { exact: true }).fill(date);
      await operator.page.getByLabel("시작 시간", { exact: true }).fill("10:00");
      await operator.page.getByLabel("종료 시간", { exact: true }).fill("12:00");
      await operator.page.getByLabel("게스트 참가비", { exact: true }).fill("15000");
      await operator.page.getByRole("button", { name: "기타", exact: true }).click();
      await operator.page.getByRole("button", { name: /^직접 승인/ }).click();
      for (const label of ["테니스공", "장비 대여", "레슨", "현장 경기 진행"]) {
        await operator.page.getByRole("group", { name: new RegExp(label) }).getByRole("radio", { name: "미포함", exact: true }).check();
      }
      const note = operator.page.getByPlaceholder("예) 실내 전용 테니스화를 준비해 주세요.");
      // 줄어든 화면 높이에서도 마지막 입력과 저장 버튼에 접근한다. 실제 OS 키보드 검증은 별도다.
      await operator.page.setViewportSize({ width: 320, height: 480 });
      await note.fill("개인 라켓과 테니스공을 준비해 주세요.");
      await noHorizontalOverflow(operator.page);
      await operator.page.route("**/api/v1/operator/courts/*/slots", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "초안 저장에 실패했어요. 다시 시도해 주세요." } }) }), { times: 1 });
      await operator.page.getByRole("button", { name: "초안 저장하기", exact: true }).click();
      await expect(operator.page.getByRole("main").getByRole("alert")).toContainText("초안 저장에 실패했어요");
      await expect(note).toHaveValue("개인 라켓과 테니스공을 준비해 주세요.");
      await expect(operator.page.getByLabel("날짜", { exact: true })).toHaveValue(date);
      await operator.page.getByRole("button", { name: "초안 저장하기", exact: true }).click();
      await expect(operator.page).toHaveURL(/\/partner\/slots$/);
      await operator.page.setViewportSize({ width: 390, height: 844 });
    });

    const court = await prisma.court.findUniqueOrThrow({ where: { operatorApplicationId: approval.id } });
    expect(court).toMatchObject({ name: approval.venueName, address: approval.venueAddress, operatorContactPhone: "0212345678" });
    const drafts = await prisma.courtSlot.findMany({ where: { courtUnit: { courtId: court.id } } });
    expect(drafts).toHaveLength(1);
    const slot = drafts[0];
    expect(slot).toMatchObject({ visibility: "PRIVATE", status: "DRAFT", approvalMode: "OPERATOR", priceKrw: 15000 });

    await test.step("입금 계좌가 없으면 공개를 막고 계좌 등록 후 공개한다", async () => {
      await operator.page.getByRole("button", { name: "공개하기", exact: true }).click();
      await expect(operator.page.getByRole("main").getByRole("alert")).toContainText("계좌");
      await operator.page.getByRole("link", { name: "이전 화면으로 돌아가기" }).click();
      await operator.page.getByRole("link", { name: "입금 계좌 등록하기", exact: true }).click();
      await operator.page.getByLabel("은행").selectOption("KB국민은행");
      await operator.page.getByLabel("계좌번호").fill("111-222-333");
      await operator.page.getByLabel("예금주").fill("E2E모바일운영");
      await saveAction(operator.page, "저장하기", "/settlement-account", "PUT");
      await expect(operator.page.getByRole("status")).toContainText("입금 계좌를 저장했어요");
      await operator.page.goBack();
      await operator.page.getByRole("link", { name: "시간 관리 보기", exact: true }).click();
      await saveAction(operator.page, "공개하기", "/publish");
      await expect(operator.page.getByRole("link", { name: "참가자 관리", exact: true })).toBeVisible();
      for (const width of [320, 390]) {
        await operator.page.setViewportSize({ width, height: 844 });
        await noHorizontalOverflow(operator.page);
        // 좁은 화면에서도 상태 배지와 시간 범위가 글자 중간에서 끊기지 않는다.
        for (const label of ["공개·모집 중", "10:00–12:00"]) {
          const element = operator.page.getByText(label, { exact: true });
          const lineCount = await element.evaluate((node) => {
            const range = document.createRange();
            range.selectNodeContents(node);
            return new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size;
          });
          expect(lineCount, `${width}px에서 ${label}을 한 줄로 표시`).toBe(1);
        }
        await operator.page.screenshot({ path: testInfo.outputPath(`operator-published-${width}.png`), fullPage: true });
      }
    });

    const match = await prisma.match.findFirstOrThrow({ where: { courtSlotId: slot.id } });
    expect(match).toMatchObject({ hostUserId: e2eUsers.host.id, status: "OPEN" });
    const detailPath = `/partner-sessions/${slot.id}`;
    const managementPath = `/partner/court-matches/${match.id}`;

    await test.step("목록에서 상세 확인·뒤로 가기·신청 실패 후 입력을 유지하며 재시도", async () => {
      await member.page.goto("/partner-sessions");
      await member.page.getByRole("link").filter({ hasText: approval.venueName }).click();
      await expect(member.page).toHaveURL(new RegExp(`${detailPath}$`));
      await expect(member.page.getByRole("heading", { name: approval.venueName, exact: true, level: 1 })).toBeVisible();
      await member.page.goBack();
      await expect(member.page).toHaveURL(/\/partner-sessions$/);
      await member.page.getByRole("link").filter({ hasText: approval.venueName }).click();
      await expect(member.page).toHaveURL(new RegExp(`${detailPath}$`));
      await expect(member.page.getByRole("link", { name: "운영자에게 전화", exact: true })).toHaveCount(0);
      await expect(member.page.getByText("111-222-333", { exact: true })).toHaveCount(0);
      await member.page.getByRole("button", { name: "같이 치기", exact: true }).click();
      const dialog = member.page.getByRole("dialog", { name: "같이 치기", exact: true });
      await expect(dialog.getByRole("button", { name: "신청 보내기", exact: true })).toBeDisabled();
      await member.page.setViewportSize({ width: 320, height: 480 });
      await dialog.getByLabel(/운영자에게 보낼 자기소개/).fill("짧은 랠리를 연습 중이에요. 함께 배우고 싶어요.");
      await dialog.getByRole("checkbox").check();
      await noHorizontalOverflow(member.page);
      await member.page.route(`**/api/v1/court-matches/${match.id}/applications`, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "신청을 보내지 못했어요. 다시 시도해 주세요." } }) }), { times: 1 });
      await dialog.getByRole("button", { name: "신청 보내기", exact: true }).click();
      await expect(dialog.getByRole("alert")).toContainText("신청을 보내지 못했어요");
      await expect(dialog.getByLabel(/운영자에게 보낼 자기소개/)).toHaveValue("짧은 랠리를 연습 중이에요. 함께 배우고 싶어요.");
      await member.page.setViewportSize({ width: 390, height: 844 });
      await dialog.screenshot({ path: testInfo.outputPath("application-retry.png") });
      await dialog.getByRole("button", { name: "신청 보내기", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(member.page.getByText("운영자가 신청을 검토하고 있어요.", { exact: false })).toBeVisible();
      await expect(member.page.getByRole("link", { name: "운영자에게 전화", exact: true })).toHaveAttribute("href", "tel:0212345678");
      await expect(member.page.getByRole("link", { name: "채팅방 열기", exact: true })).toHaveCount(0);
      await expect(member.page.getByText("111-222-333", { exact: true })).toHaveCount(0);
    });

    const applications = await prisma.matchApplication.findMany({ where: { matchId: match.id } });
    expect(applications).toHaveLength(1);
    const applicationId = applications[0].id;
    expect(applications[0]).toMatchObject({ status: "PENDING", applicantUserId: e2eUsers.applicant.id, message: "짧은 랠리를 연습 중이에요. 함께 배우고 싶어요." });
    expect(applications[0].courtNoticeAcceptedAt).not.toBeNull();

    await test.step("운영자 승인·참가자 입금 알림·통장 대조·참가 확정", async () => {
      await operator.page.getByRole("link", { name: "참가자 관리", exact: true }).click();
      await expect(operator.page).toHaveURL(new RegExp(`${managementPath}$`));
      await expect(operator.page.getByRole("heading", { name: "승인 대기 1명" })).toBeVisible();
      await saveAction(operator.page, "승인", "/decision");
      await expect(operator.page.getByRole("heading", { name: /입금 대기/ })).toBeVisible();
      await member.page.reload();
      await expect(member.page.getByText("111-222-333", { exact: true })).toBeVisible();
      await member.page.getByLabel("실제로 보낸 입금자명").fill("E2E모바일입금");
      await member.page.getByRole("button", { name: "입금했어요", exact: true }).click();
      await expect(member.page.getByText("입금 알림을 보냈어요", { exact: false })).toBeVisible();
      await operator.page.reload();
      await expect(operator.page.getByText("E2E모바일입금", { exact: true })).toBeVisible();
      await operator.page.getByText("입금 대조·정정", { exact: true }).click();
      await operator.page.getByLabel("누적 수령 금액").fill("15000");
      await operator.page.getByLabel("은행 수령 시각 (한국 시간)").fill(kstNow());
      await operator.page.getByLabel("대조·정정 사유").fill("E2E 모바일 통장 대조");
      await saveAction(operator.page, "수령 기록 저장", "/receipt");
      await saveAction(operator.page, "입금 확인하고 확정", "/confirm");
      await expect(operator.page.getByRole("heading", { name: "참가 확정 1명" })).toBeVisible();
      expect(await prisma.matchApplication.findUniqueOrThrow({ where: { id: applicationId } })).toMatchObject({ status: "CONFIRMED", receivedAmountKrw: 15000 });
    });

    await test.step("확정 후 채팅과 운영자 연락처", async () => {
      await member.page.reload();
      await expect(member.page.getByText("운영자가 입금을 확인했어요", { exact: false })).toBeVisible();
      for (const width of [320, 390]) {
        await member.page.setViewportSize({ width, height: 844 });
        await noHorizontalOverflow(member.page);
        await member.page.screenshot({ path: testInfo.outputPath(`participant-confirmed-${width}.png`), fullPage: true });
      }
      await member.page.getByRole("link", { name: "채팅방 열기", exact: true }).click();
      await member.page.getByLabel("메시지", { exact: true }).fill("모바일 코트 매칭에서 만나요.");
      await saveAction(member.page, "보내기", "/messages");
      await operator.page.goto(`/chats/${match.id}`);
      await expect(operator.page.getByText("모바일 코트 매칭에서 만나요.", { exact: true })).toBeVisible();
      await member.page.goBack();
      await expect(member.page).toHaveURL(new RegExp(`${detailPath}$`));
    });

    await test.step("취소 예상액 확인·환불 계좌·송금 기록·완료 확인", async () => {
      await member.page.getByRole("button", { name: "참가 취소", exact: true }).click();
      await expect(member.page.getByText("15,000원", { exact: false }).first()).toBeVisible();
      await saveAction(member.page, "참가 취소하기", "/cancel");
      await expect(member.page.getByText("참가를 취소했어요", { exact: false })).toBeVisible();
      await member.page.setViewportSize({ width: 320, height: 480 });
      await member.page.getByLabel("은행", { exact: true }).fill("KB국민은행");
      await member.page.getByLabel("계좌번호", { exact: true }).fill("555-666-777");
      await member.page.getByLabel("예금주", { exact: true }).fill("E2E모바일참가자");
      await saveAction(member.page, "환불 계좌 저장", "/refund-account", "PUT");
      await expect(member.page.getByText("환불 계좌를 저장했어요", { exact: false })).toBeVisible();
      await noHorizontalOverflow(member.page);
      await expect(member.page.getByRole("link", { name: "운영자에게 전화", exact: true })).toHaveAttribute("href", "tel:0212345678");
      await member.page.setViewportSize({ width: 390, height: 844 });

      await operator.page.goto(managementPath);
      await expect(operator.page.getByText("555-666-777", { exact: true })).toBeVisible();
      await saveAction(operator.page, "환불 처리 시작 · 15,000원", "/refund/start");
      await expect(operator.page.getByText("송금 처리 중 · 15,000원", { exact: true })).toBeVisible();
      await member.page.reload();
      await expect(member.page.getByText("운영자가 환불을 처리하고 있어요.", { exact: false })).toBeVisible();
      await expect(member.page.getByRole("button", { name: "환불 계좌 저장", exact: true })).toHaveCount(0);
      await operator.page.getByLabel("실제 송금 시각 (한국 시간)").fill(kstNow());
      await operator.page.getByLabel("처리 근거·메모").fill("E2E 모바일 환불 송금 기록");
      await saveAction(operator.page, "송금 결과 저장", "/refund");
      await expect(operator.page.getByText("송금 완료 기록 · 15,000원", { exact: true })).toBeVisible();
      await member.page.reload();
      await expect(member.page.getByText("실제 입금 여부는 통장에서 확인해 주세요.", { exact: false })).toBeVisible();
      await expect(member.page.getByRole("link", { name: "운영자에게 전화", exact: true })).toHaveCount(0);
      await member.page.screenshot({ path: testInfo.outputPath("participant-refunded.png"), fullPage: true });
      const completed = await prisma.matchApplication.findUniqueOrThrow({ where: { id: applicationId }, include: { refundAttempts: true } });
      expect(completed).toMatchObject({ status: "CANCELLED", refundAmountKrw: 15000, refundAccountNumber: "555-666-777" });
      expect(completed.refundCompletedAt).not.toBeNull();
      expect(completed.refundAttempts).toHaveLength(1);
      expect(completed.refundAttempts[0]).toMatchObject({ status: "PAID", amountKrw: 15000 });
    });
    expect(errors).toEqual([]);
  } finally {
    await member.context.close();
    await operator.context.close();
  }
});

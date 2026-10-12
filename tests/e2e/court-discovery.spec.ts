import { expect, test } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { PrismaClient } from "@/generated/prisma/client";
import { createPrismaPg } from "../../src/server/db/prisma-adapter";
import { E2E_AUTH_SECRET, E2E_BASE_URL, requireE2eDatabaseUrl } from "./e2e-environment";
import { disconnectE2eDatabase, e2eUsers, resetE2eDatabase } from "./fixtures";
const prisma = new PrismaClient({ adapter: createPrismaPg(requireE2eDatabaseUrl()) });
test.afterAll(async () => { await prisma.$disconnect(); await disconnectE2eDatabase(); });

test("코트 목록 필터·가격 정렬·빈 결과 복구와 모바일 상세의 핵심 안내", async ({ page, context }) => {
  const f = await resetE2eDatabase();
  const slot = await prisma.courtSlot.update({ where: { id: f.partnerSlotId }, data: { ballDiscountEnabled: true, approvalMode: "AUTO" } });
  const later = new Date(slot.startsAt.getTime() + 86400000);
  const extra = await prisma.courtSlot.create({ data: {
    courtUnitId: slot.courtUnitId, startsAt: later, endsAt: new Date(later.getTime() + 7200000), priceKrw: 18000,
    ballDiscountEnabled: true, maxParticipantCount: 4, minParticipantCount: 4, gameType: "WOMENS_DOUBLES", maleCapacity: 0, femaleCapacity: 4,
    approvalMode: "OPERATOR", visibility: "PUBLIC", status: "AVAILABLE", publishedAt: new Date(),
  } });
  await prisma.match.create({ data: { courtSlotId: extra.id, hostUserId: e2eUsers.operator.id, clientRequestId: crypto.randomUUID(), title: "E2E 여복 코트",
    courtSource: "PARTNER_COURT", startsAt: extra.startsAt, endsAt: extra.endsAt, recruitCount: 4, maleRecruitCount: 0, femaleRecruitCount: 4,
    gameType: "WOMENS_DOUBLES", totalCourtFeeKrw: extra.priceKrw, partnerPreference: "COMPLETE_BEGINNER_WELCOME", courtCompositionPolicyVersion: 1,
  } });
  const value = await encode({ token: { sub: e2eUsers.applicant.id, userId: e2eUsers.applicant.id }, secret: E2E_AUTH_SECRET, salt: "authjs.session-token", maxAge: 3600 });
  await context.addCookies([{ name: "authjs.session-token", value, url: E2E_BASE_URL, httpOnly: true, sameSite: "Lax" }]);
  const errors: string[] = [];page.on("pageerror", e => errors.push(e.message));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/partner-sessions");
  const cards = page.locator(".rally-discovery-card");
  await expect(cards).toHaveCount(2);
  await expect(page.getByText("자동 승인", { exact: true })).toHaveCount(0);
  await expect(cards.first().getByText("5,000원 할인", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "시간 빠른순" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "날짜", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /낮은 가격순.*할인 전/ }).click();
  await expect(cards.first()).toHaveAttribute("href", `/partner-sessions/${extra.id}`);
  await page.getByRole("button", { name: "게임 유형", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("정렬", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "여복", exact: true }).click();
  await page.getByRole("button", { name: "적용하기", exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(page.getByRole("button", { name: "낮은 가격순" })).toBeVisible();
  await page.getByRole("button", { name: "날짜", exact: true }).click();
  await page.getByRole("button", { name: "오늘", exact: true }).click();
  await page.getByRole("button", { name: "적용하기", exact: true }).click();
  await expect(page.getByText("조건에 맞는 코트 매칭이 없어요.")).toBeVisible();
  await page.getByRole("button", { name: "필터 초기화", exact: true }).click();
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveAttribute("href", `/partner-sessions/${extra.id}`);
  expect((await page.request.get("/api/v1/partner-session-slots?date=2030-02-30")).status()).toBe(400);
  const kstDate = new Date(extra.startsAt.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const filtered = await (await page.request.get(`/api/v1/partner-session-slots?date=${kstDate}&gameType=WOMENS_DOUBLES&sort=priceLow`)).json();
  expect(filtered.items.map((s: { id: string }) => s.id)).toEqual([extra.id]);
  await page.screenshot({ path: "/private/tmp/rally-court-list-refined-375.png" });
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto(`/partner-sessions/${f.partnerSlotId}`);
  await expect(page.getByText("공 준비로 참가하면", { exact: true })).toBeVisible();
  await expect(page.getByText("5,000원 할인", { exact: true })).toBeVisible();
  await expect(page.getByText("새 공 1캔 · 최소 2구 · 선착순 1명")).toBeVisible();
  await expect(page.getByText("신청 후 바로 입금 안내를 받아요.", { exact: false })).toBeVisible();
  await page.screenshot({ path: "/private/tmp/rally-court-detail-refined-375.png" });
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole("button", { name: "같이 치기", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "신청 보내기" })).toBeDisabled();
  await dialog.getByRole("radio", { name: /공 준비 참가/ }).check();
  await expect(dialog.getByText(/미지참 시 5,000원/).first()).toBeVisible();
  await expect(dialog.getByText(/확정 전 전액 반환/)).toHaveCount(0);
  await dialog.getByRole("radio", { name: /공 준비 참가/ }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/private/tmp/rally-court-apply-refined-375.png" });
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await page.getByRole("heading", { name: "참가 전 알아두세요" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/private/tmp/rally-court-policies-refined-375.png" });
  await expect(page.getByText("코트 매칭", { exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

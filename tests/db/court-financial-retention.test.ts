import { randomUUID } from "node:crypto";
import { createPrismaPg } from "../../src/server/db/prisma-adapter";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { auditCourtFinancialRetention } from "@/server/domain/court-financial-retention-audit";
import { getCourtFinancialReview, recordCourtFinancialReview } from "@/server/domain/court-financial-review-service";
import { financialReviewInputSchema, type FinancialReviewInput } from "@/server/domain/court-financial-review";
import { requireE2eDatabaseUrl } from "../e2e/e2e-environment";

const databaseUrl = process.env.E2E_DATABASE_URL?.trim() ? requireE2eDatabaseUrl() : null;

describe.skipIf(!databaseUrl)("금융 원문 점검 · 실제 DB", () => {
  let prisma: PrismaClient;
  let operatorId: string;
  let unitId: string;
  let sequence = 0;

  beforeAll(() => { prisma = new PrismaClient({ adapter: createPrismaPg(databaseUrl!) }); });
  afterAll(async () => { await prisma?.$disconnect(); });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "users", "regions" RESTART IDENTITY CASCADE');
    sequence = 0;
    const operator = await prisma.user.create({ data: { nickname: "가상 운영자" } });
    operatorId = operator.id;
    await prisma.region.create({ data: { code: "RETENTION", name: "가상 지역", shortName: "가상", type: "CITY" } });
    const application = await prisma.courtOperatorApplication.create({ data: {
      applicantUserId: operatorId, status: "PUBLISH_APPROVED", businessName: "가상 코트", venueName: "가상 코트", venueAddress: "가상 주소",
      businessRegistrationNumberHash: `fixture-${randomUUID()}`, normalizedVenueKey: randomUUID(),
    } });
    const court = await prisma.court.create({ data: {
      operatorApplicationId: application.id, name: "가상 코트", address: "가상 주소", regionCode: "RETENTION", normalizedVenueKey: randomUUID(),
      settlementBank: "가상 은행", settlementAccountNumber: "SHARED-COURT-ACCOUNT", settlementAccountHolder: "공용 계좌 예금주",
    } });
    unitId = (await prisma.courtUnit.create({ data: { courtId: court.id, name: "1번 코트" } })).id;
  });

  async function makeMatch(overrides: Partial<Prisma.MatchUncheckedCreateInput> = {}) {
    const startsAt = new Date(Date.UTC(2020, 0, 1) + sequence++ * 3 * 60 * 60_000);
    const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60_000);
    const slot = await prisma.courtSlot.create({ data: { courtUnitId: unitId, startsAt, endsAt, priceKrw: 12_000, maxParticipantCount: 4 } });
    return prisma.match.create({ data: {
      hostUserId: operatorId, clientRequestId: randomUUID(), title: "가상 경기", startsAt, endsAt, courtSource: "PARTNER_COURT", courtSlotId: slot.id,
      recruitCount: 3, partnerPreference: "COMPLETE_BEGINNER_WELCOME", totalCourtFeeKrw: 12_000, status: "COMPLETED",
      settlementBank: "가상 은행", settlementAccountNumber: "MATCH-ACCOUNT-RAW", settlementAccountHolder: "가상 경기 예금주", ...overrides,
    } });
  }
  async function makeApplication(matchId: string, overrides: Partial<Prisma.MatchApplicationUncheckedCreateInput> = {}) {
    const user = await prisma.user.create({ data: { nickname: `가상 ${randomUUID().slice(0, 8)}` } });
    return prisma.matchApplication.create({ data: {
      matchId, applicantUserId: user.id, profileSnapshot: {}, status: "WITHDRAWN", depositorName: "가상 입금자", ...overrides,
    } });
  }
  async function audit() {
    const client = new Client({ connectionString: databaseUrl! });
    await client.connect();
    try { return await auditCourtFinancialRetention(client); }
    finally { await client.end(); }
  }
  const reasonCount = (report: Awaited<ReturnType<typeof audit>>, code: string) => report.reasons.find((r) => r.code === code)!;

  it("빈 목록과 일반 매칭을 안전하게 제외한다", async () => {
    await makeMatch({ courtSource: "EXTERNAL_RESERVED", courtSlotId: null });
    const report = await audit();
    expect(report.scanned).toEqual({ matches: 0, applications: 0 });
    expect(report.rawLocations).toEqual({ applicationRecords: 0, refundAttemptRecords: 0, matchRecords: 0 });
  });

  it("신청·송금 복사본을 세되 원문·ID·금액을 반환하거나 변경하지 않는다", async () => {
    const match = await makeMatch();
    const a = await makeApplication(match.id, { receivedAmountKrw: 12345, refundAmountKrw: 12345,
      refundBank: "가상 은행", refundAccountNumber: "APPLICATION-RAW", refundAccountHolder: "가상 환불 예금주" });
    for (const status of ["FAILED", "PAID"] as const) {
      await prisma.courtRefundAttempt.create({ data: {
        applicationId: a.id, actorUserId: operatorId, clientRequestId: randomUUID(), amountKrw: 12345,
        status, bank: "가상 은행", accountNumber: `ATTEMPT-${status}-RAW`, accountHolder: "과거 송금 예금주", accountVersion: 1,
      } });
    }
    const before = await prisma.match.findUniqueOrThrow({ where: { id: match.id }, include: { applications: { include: { refundAttempts: true } } } });
    const report = await audit();
    expect(report.rawLocations).toEqual({ applicationRecords: 1, refundAttemptRecords: 2, matchRecords: 1 });
    expect(report.applicationsWithRaw).toEqual({ records: 1, retain: 0, reviewRequired: 1 });
    expect(report.deletionEnabled).toBe(false);
    const serialized = JSON.stringify(report);
    for (const secret of [a.id, a.applicantUserId, match.id, "12345", "APPLICATION-RAW", "MATCH-ACCOUNT-RAW", "ATTEMPT-PAID-RAW", "가상 입금자", "과거 송금 예금주"]) {
      expect(serialized).not.toContain(secret);
    }
    expect(await prisma.match.findUniqueOrThrow({ where: { id: match.id }, include: { applications: { include: { refundAttempts: true } } } })).toEqual(before);
    expect((await prisma.court.findFirstOrThrow()).settlementAccountNumber).toBe("SHARED-COURT-ACCOUNT");
    await prisma.matchApplication.update({ where: { id: a.id }, data: { depositorName: null, refundAccountNumber: null, refundAccountHolder: null } });
    const copiesOnly = await audit();
    expect(copiesOnly.rawLocations.applicationRecords).toBe(0);
    expect(copiesOnly.rawLocations.refundAttemptRecords).toBe(2);
    expect(copiesOnly.applicationsWithRaw.records).toBe(1);
  });

  it("자기 원문이 없는 미해결 신청도 매칭 공용 계좌의 보존 사유가 된다", async () => {
    const match = await makeMatch();
    await makeApplication(match.id, { depositorName: null, receivedAmountKrw: 5_000 });
    const report = await audit();
    expect(report.applicationsWithRaw.records).toBe(0);
    expect(report.matchAccountsWithRaw.retain).toBe(1);
    expect(reasonCount(report, "REFUND_OUTSTANDING")).toMatchObject({ applications: 0, matchAccounts: 1 });
  });

  it("문의는 해당 신청과 공용 계좌에만 반영하고 다른 경기로 확장하지 않는다", async () => {
    const first = await makeMatch();
    const second = await makeMatch();
    const a = await makeApplication(first.id);
    await makeApplication(first.id);
    await makeApplication(second.id, { applicantUserId: a.applicantUserId });
    const inquiry = await prisma.supportInquiry.create({ data: { userId: a.applicantUserId, matchId: first.id, applicationId: a.id, message: "민감한 문의 원문" } });
    let report = await audit();
    expect(reasonCount(report, "OPEN_INQUIRY")).toMatchObject({ applications: 1, matchAccounts: 1 });
    // 경기만 연결된 본인의 문의도 해당 신청에서 확인하되 다른 참가자에게 전파하지 않는다.
    await prisma.supportInquiry.update({ where: { id: inquiry.id }, data: { applicationId: null } });
    report = await audit();
    expect(reasonCount(report, "OPEN_INQUIRY")).toMatchObject({ applications: 1, matchAccounts: 1 });
    await prisma.supportInquiry.update({ where: { id: inquiry.id }, data: { status: "RESOLVED" } });
    report = await audit();
    expect(reasonCount(report, "OPEN_INQUIRY").applications).toBe(0);
    expect(reasonCount(report, "INQUIRY_HISTORY_REVIEW")).toMatchObject({ applications: 1, matchAccounts: 1 });
  });

  it("입금 알림 뒤 기록을 구분하되 새 수령 기록만으로 최종 대조를 증명하지 않는다", async () => {
    const match = await makeMatch();
    const claimedAt = new Date("2020-01-03T00:00:00Z");
    const a = await makeApplication(match.id, { depositClaimedAt: claimedAt, receivedAmountKrw: 0 });
    await prisma.courtReceiptRecord.create({ data: {
      applicationId: a.id, actorUserId: operatorId, clientRequestId: randomUUID(), version: 1, previousAmountKrw: 0, amountKrw: 0,
      note: "가상 입금 확인", createdAt: new Date(claimedAt.getTime() - 1),
    } });
    expect(reasonCount(await audit(), "DEPOSIT_CHECK_REQUIRED").applications).toBe(1);
    await prisma.courtReceiptRecord.create({ data: {
      applicationId: a.id, actorUserId: operatorId, clientRequestId: randomUUID(), version: 2, previousAmountKrw: 0, amountKrw: 0,
      note: "가상 입금 확인", createdAt: claimedAt,
    } });
    const report = await audit();
    expect(reasonCount(report, "DEPOSIT_CHECK_REQUIRED").applications).toBe(0);
    expect(reasonCount(report, "FINAL_RECONCILIATION_UNRECORDED").applications).toBe(1);
  });

  it("100건 페이지 경계에서도 빠짐없이 한 읽기 전용 스냅샷을 사용한다", async () => {
    for (let i = 0; i < 101; i++) await makeMatch();
    const lastMatch = await prisma.match.findFirstOrThrow({ orderBy: { id: "desc" } });
    const client = new Client({ connectionString: databaseUrl! });
    await client.connect();
    const query = client.query.bind(client);
    let checked = false;
    let updatedBetweenPages = false;
    const spy = vi.spyOn(client, "query").mockImplementation((async (...args: unknown[]) => {
      if (!checked && String(args[0]).includes("SELECT CURRENT_TIMESTAMP")) {
        checked = true;
        expect((await query("SHOW transaction_read_only")).rows[0].transaction_read_only).toBe("on");
        expect((await query("SHOW transaction_isolation")).rows[0].transaction_isolation).toBe("repeatable read");
      }
      const result = await Reflect.apply(query, client, args);
      if (!updatedBetweenPages && String(args[0]).includes("FROM matches m")) {
        updatedBetweenPages = true;
        // A separate transaction changes the second page after the audit snapshot was taken.
        await prisma.$executeRaw`UPDATE matches SET ends_at = CURRENT_TIMESTAMP + INTERVAL '1 minute', status = 'OPEN' WHERE id = ${lastMatch.id}::uuid`;
      }
      return result;
    }) as typeof client.query);
    try {
      const report = await auditCourtFinancialRetention(client);
      expect(report.scanned.matches).toBe(101);
      expect(report.matchAccountsWithRaw.records).toBe(101);
      expect(report.matchAccountsWithRaw.retain).toBe(0);
      expect(updatedBetweenPages).toBe(true);
      expect((await audit()).matchAccountsWithRaw.retain).toBe(1);
      expect(checked).toBe(true);
    } finally { spy.mockRestore(); await client.end(); }
  });

  it("조회 오류 시 부분 결과를 반환하지 않고 트랜잭션을 되돌린다", async () => {
    const client = new Client({ connectionString: databaseUrl! });
    await client.connect();
    const query = client.query.bind(client);
    const failure = new Error("가상 조회 실패");
    const spy = vi.spyOn(client, "query").mockImplementation((async (...args: unknown[]) => {
      if (String(args[0]).includes("FROM matches m")) throw failure;
      return Reflect.apply(query, client, args);
    }) as typeof client.query);
    try {
      await expect(auditCourtFinancialRetention(client)).rejects.toBe(failure);
      expect(spy.mock.calls.some(([sql]) => sql === "ROLLBACK")).toBe(true);
      expect((await query("SHOW transaction_read_only")).rows[0].transaction_read_only).toBe("off");
    } finally { spy.mockRestore(); await client.end(); }
  });
  async function settled(overrides: Partial<Prisma.MatchApplicationUncheckedCreateInput> = {}) {
    const match = await makeMatch();
    const a = await makeApplication(match.id, { receivedAmountKrw: 0, receiptVersion: 1, ...overrides });
    await prisma.courtReceiptRecord.create({ data: {
      applicationId: a.id, actorUserId: operatorId, clientRequestId: randomUUID(), version: 1,
      previousAmountKrw: 0, amountKrw: a.receivedAmountKrw ?? 0, note: "은행 내역 직접 확인",
    } });
    return { match, a };
  }
  async function inputFor(id: string, action: Record<string, unknown> = { action: "RECONCILE", bankChecked: true }) {
    const state = await getCourtFinancialReview(prisma, operatorId, id);
    return financialReviewInputSchema.parse({ clientRequestId: randomUUID(), expectedFingerprint: state.expectedFingerprint, ...action });
  }
  const holdInput = (scopes = ["DEPOSITOR_NAME"]) => ({ action: "HOLD", scopes, reason: "문의 처리 근거 확인을 위해 보존", caseReference: "CASE-TEST", reviewDueAt: new Date(Date.now() + 86400000).toISOString() });

  it("명시적 대조를 중복 없이 기록하고 원문·법정 보존 판정은 변경하지 않는다", async () => {
    const { a } = await settled();
    const input = await inputFor(a.id);
    const result = await recordCourtFinancialReview(prisma, operatorId, a.id, input);
    expect(await recordCourtFinancialReview(prisma, operatorId, a.id, input)).toEqual(result);
    expect(await prisma.courtFinancialReview.count()).toBe(1);
    expect((await getCourtFinancialReview(prisma, operatorId, a.id)).reconciliation?.current).toBe(true);
    const report = await audit();
    expect(reasonCount(report, "FINAL_RECONCILIATION_UNRECORDED").applications).toBe(0);
    expect(reasonCount(report, "FINAL_RECONCILIATION_STALE").applications).toBe(0);
    expect(reasonCount(report, "RETENTION_BASIS_UNASSESSED").applications).toBe(1);
    expect(report.deletionEnabled).toBe(false);
    expect((await prisma.matchApplication.findUniqueOrThrow({ where: { id: a.id } })).depositorName).toBe("가상 입금자");
    await expect(recordCourtFinancialReview(prisma, operatorId, a.id, { ...input, ...holdInput() } as FinancialReviewInput)).rejects.toThrow();
    const stored = JSON.stringify(await prisma.courtFinancialReview.findMany());
    expect(stored).not.toContain("가상 입금자");
  });

  it("실제 대조 근거 누락·송금 진행·늦은 입금 알림·진행 중 참가를 차단한다", async () => {
    const { a } = await settled();
    await prisma.matchApplication.update({ where: { id: a.id }, data: { receivedAmountKrw: null } });
    await expect(recordCourtFinancialReview(prisma, operatorId, a.id, await inputFor(a.id))).rejects.toThrow();
    await prisma.matchApplication.update({ where: { id: a.id }, data: { receivedAmountKrw: 0, depositClaimedAt: new Date(Date.now() + 1000) } });
    expect((await getCourtFinancialReview(prisma, operatorId, a.id)).blockers.join()).toContain("최근 입금 알림");
    await prisma.matchApplication.update({ where: { id: a.id }, data: { depositClaimedAt: null, status: "PENDING" } });
    expect((await getCourtFinancialReview(prisma, operatorId, a.id)).canReconcile).toBe(false);
    await prisma.matchApplication.update({ where: { id: a.id }, data: { status: "WITHDRAWN" } });
    await prisma.courtRefundAttempt.create({ data: { applicationId: a.id, actorUserId: operatorId, clientRequestId: randomUUID(), amountKrw: 100,
      status: "PROCESSING", bank: "은행", accountNumber: "PRIVATE", accountHolder: "가상", accountVersion: 1 } });
    await expect(recordCourtFinancialReview(prisma, operatorId, a.id, await inputFor(a.id))).rejects.toThrow("반환 또는 송금 확인");
  });

  it("조회 이후 거래 변경과 대조 이후 문의 재개를 탐지한다", async () => {
    const { a, match } = await settled();
    const oldInput = await inputFor(a.id);
    await prisma.matchApplication.update({ where: { id: a.id }, data: { refundAccountVersion: { increment: 1 } } });
    await expect(recordCourtFinancialReview(prisma, operatorId, a.id, oldInput)).rejects.toThrow("거래 상태가 바뀌었어요");
    const inquiry = await prisma.supportInquiry.create({ data: { userId: a.applicantUserId, matchId: match.id, applicationId: a.id, status: "RESOLVED", message: "가상 문의" } });
    await recordCourtFinancialReview(prisma, operatorId, a.id, await inputFor(a.id));
    expect((await getCourtFinancialReview(prisma, operatorId, a.id)).reconciliation?.current).toBe(true);
    expect(reasonCount(await audit(), "FINAL_RECONCILIATION_STALE").applications).toBe(0);
    await prisma.supportInquiry.update({ where: { id: inquiry.id }, data: { status: "OPEN", version: { increment: 1 } } });
    expect((await getCourtFinancialReview(prisma, operatorId, a.id)).reconciliation?.current).toBe(false);
    expect(reasonCount(await audit(), "FINAL_RECONCILIATION_STALE").applications).toBe(1);
    await expect(recordCourtFinancialReview(prisma, operatorId, a.id, await inputFor(a.id))).rejects.toThrow("관련 문의");
  });

  it("보존 범위와 재검토 기한을 지키고 해제 기록을 남긴다", async () => {
    const { a } = await settled();
    const result = await recordCourtFinancialReview(prisma, operatorId, a.id, await inputFor(a.id, holdInput()));
    await prisma.courtFinancialReview.update({ where: { id: result.id }, data: { reviewDueAt: new Date(0) } });
    expect((await getCourtFinancialReview(prisma, operatorId, a.id)).holds[0].overdue).toBe(true);
    expect(reasonCount(await audit(), "PRESERVATION_HOLD")).toMatchObject({ applications: 1, matchAccounts: 0 });
    expect(reasonCount(await audit(), "PRESERVATION_REVIEW_OVERDUE").applications).toBe(1);
    const second = await makeApplication(a.matchId);
    const release = { action: "RELEASE_HOLD", holdId: result.id, reason: "관련 문의 처리가 완료되어 보존 해제" };
    await expect(recordCourtFinancialReview(prisma, operatorId, second.id, await inputFor(second.id, release))).rejects.toThrow();
    await recordCourtFinancialReview(prisma, operatorId, a.id, await inputFor(a.id, release));
    expect((await getCourtFinancialReview(prisma, operatorId, a.id)).holds).toEqual([]);
    expect(await prisma.courtFinancialReview.count()).toBe(2);
    await expect(recordCourtFinancialReview(prisma, operatorId, a.id, await inputFor(a.id, release))).rejects.toThrow();
    await recordCourtFinancialReview(prisma, operatorId, a.id, await inputFor(a.id, holdInput(["MATCH_ACCOUNT"])));
    expect(reasonCount(await audit(), "PRESERVATION_HOLD")).toMatchObject({ applications: 0, matchAccounts: 1 });
    await expect(recordCourtFinancialReview(prisma, operatorId, a.id, await inputFor(a.id, { ...holdInput(), reviewDueAt: new Date(0).toISOString() }))).rejects.toThrow("재검토일");
  });

  it("다른 사용자·본인 신청·권한 상실과 미배정 인계 접근을 차단한다", async () => {
    const { a, match } = await settled();
    const input = await inputFor(a.id);
    await expect(getCourtFinancialReview(prisma, a.applicantUserId, a.id)).rejects.toThrow();
    const self = await makeApplication(match.id, { applicantUserId: operatorId });
    await expect(getCourtFinancialReview(prisma, operatorId, self.id)).rejects.toThrow("본인 신청");
    const reviewer = await prisma.user.create({ data: { nickname: "내부 검토자", role: "INTERNAL_REVIEWER" } });
    await prisma.user.update({ where: { id: operatorId }, data: { status: "SUSPENDED" } });
    await expect(recordCourtFinancialReview(prisma, operatorId, a.id, input)).rejects.toThrow();
    await expect(getCourtFinancialReview(prisma, reviewer.id, a.id, true)).rejects.toThrow("인계를 맡아");
    await prisma.courtTransactionHandoff.create({ data: { matchId: match.id, assigneeUserId: reviewer.id } });
    const view = await getCourtFinancialReview(prisma, reviewer.id, a.id, true);
    await recordCourtFinancialReview(prisma, reviewer.id, a.id, { ...input, expectedFingerprint: view.expectedFingerprint }, true);
    expect((await getCourtFinancialReview(prisma, reviewer.id, a.id, true)).reconciliation?.current).toBe(true);
    await prisma.user.update({ where: { id: reviewer.id }, data: { role: "MEMBER" } });
    await expect(getCourtFinancialReview(prisma, reviewer.id, a.id, true)).rejects.toThrow();
  });

  it("같은 지문의 동시 기록 중 하나만 반영한다", async () => {
    const { a } = await settled();
    const input = await inputFor(a.id);
    const results = await Promise.allSettled([
      recordCourtFinancialReview(prisma, operatorId, a.id, input),
      recordCourtFinancialReview(prisma, operatorId, a.id, { ...input, clientRequestId: randomUUID() }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.courtFinancialReview.count()).toBe(1);
  });

  it("기본 DB 시간대가 달라도 UTC 저장 시각과 기존 접속 옵션을 유지한다", async () => {
    const url = new URL(databaseUrl!);
    url.searchParams.set("options", "-c timezone=Asia/Seoul -c application_name=financial-timezone-test");
    const connection = new PrismaClient({ adapter: createPrismaPg(url.toString()) });
    const raw = new Client({ connectionString: databaseUrl! });
    await raw.connect();
    try {
      const settings = await connection.$queryRaw<{ tz: string; app: string }[]>`SELECT current_setting('TimeZone') AS tz, current_setting('application_name') AS app`;
      expect(settings[0]).toEqual({ tz: "UTC", app: "financial-timezone-test" });
      const time = new Date("2026-10-10T06:12:34.567Z");
      const user = await connection.user.create({ data: { nickname: "시각 검증", createdAt: time } });
      expect(user.createdAt).toEqual(time);
      const result = await raw.query('SELECT created_at FROM users WHERE id = $1', [user.id]);
      expect(result.rows[0].created_at).toEqual(time);
    } finally { await raw.end(); await connection.$disconnect(); }
  });

});

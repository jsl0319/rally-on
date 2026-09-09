import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ProfileWithRelations } from "./profile-service";
import {
  applyToCourtMatch, claimCourtMatchDeposit, completeCourtMatchRefund,
  confirmCourtMatchDeposit, decideCourtMatchApplication, reconcileCourtMatch,
  reconcileCourtMatches, submitCourtMatchRefundAccount,
} from "./court-match-service";
import { recordApplicationNotification } from "./notification-service";

vi.mock("./notification-service", () => ({ recordApplicationNotification: vi.fn() }));
vi.mock("./match-chat-service", () => ({ addAcceptedMemberToConversation: vi.fn(), makeConversationReadOnly: vi.fn() }));
vi.mock("./match-service", () => ({ toProfileSnapshot: vi.fn().mockReturnValue({}) }));

const start = new Date("2030-01-01T10:00:00Z"); // 한국 시각 19시, 판정 16시
const judgement = new Date("2030-01-01T07:00:00Z");
const before = new Date("2030-01-01T06:59:59Z");
const after = new Date("2030-01-01T08:00:00Z");
const operator = { id: "operator" };
const viewer = { id: "participant", profile: { gender: "MALE" } as ProfileWithRelations };
const refundInput = { bank: "새은행", accountNumber: "222", accountHolder: "참가자" };

function applicant(id: string, status: string) {
  return {
    id, matchId: "match", applicantUserId: id === "application" ? viewer.id : id,
    applicantGender: "MALE", status, paymentDueAt: judgement, depositCode: null,
    confirmedAt: status === "CONFIRMED" ? before : null,
    refundCompletedAt: null as Date | null, refundBank: "기존은행",
    refundAccountNumber: "111", refundAccountHolder: "참가자",
  };
}
type Row = ReturnType<typeof applicant>;
type Where = { id?: string | { in: string[] }; matchId?: string; status?: string | { in: string[] }; paymentDueAt?: { lte: Date }; confirmedAt?: { lte: Date }; applicantGender?: string };

// 실제 서비스 함수를 실행하며, 트랜잭션이 예외로 끝나면 저장 상태를 되돌린다.
function fixture(status = "PENDING", confirmed = 0) {
  const match = {
    id: "match", hostUserId: operator.id, courtSource: "PARTNER_COURT", title: "테스트 코트",
    status: "OPEN", startsAt: start, recruitCount: 4, maleRecruitCount: null, femaleRecruitCount: null,
    courtSlot: { id: "slot", status: "AVAILABLE", approvalMode: "OPERATOR", minParticipantCount: 2,
      courtUnit: { court: { status: "ACTIVE", operatorApplication: { applicantUserId: operator.id, status: "PUBLISH_APPROVED" } } } },
  };
  const rows = [applicant("application", status), ...Array.from({ length: confirmed }, (_, i) => applicant(`confirmed-${i}`, "CONFIRMED"))];
  const matches = (row: Row, where: Where) => {
    if (where.id && !(typeof where.id === "string" ? row.id === where.id : where.id.in.includes(row.id))) return false;
    if (where.status && !(typeof where.status === "string" ? row.status === where.status : where.status.in.includes(row.status))) return false;
    if (where.paymentDueAt && row.paymentDueAt > where.paymentDueAt.lte) return false;
    if (where.confirmedAt && (!row.confirmedAt || row.confirmedAt > where.confirmedAt.lte)) return false;
    return true;
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    match: {
      findUnique: vi.fn(async () => ({ ...match })), findMany: vi.fn(async () => [{ ...match }]),
      update: vi.fn(async ({ data }: { data: object }) => Object.assign(match, data)),
      updateMany: vi.fn(async ({ data }: { data: object }) => { Object.assign(match, data); return { count: 1 }; }),
    },
    matchApplication: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; matchId_applicantUserId?: { applicantUserId: string } } }) => {
        const row = rows.find((r) => where.id ? r.id === where.id : r.applicantUserId === where.matchId_applicantUserId?.applicantUserId);
        return row ? { ...row, match: { ...match } } : null;
      }),
      findMany: vi.fn(async ({ where }: { where: Where }) => rows.filter((row) => matches(row, where)).map((r) => ({ ...r }))),
      count: vi.fn(async ({ where }: { where: Where }) => rows.filter((row) => matches(row, where)).length),
      update: vi.fn(async ({ where, data }: { where: Where; data: object }) => Object.assign(rows.find((row) => matches(row, where))!, data)),
      updateMany: vi.fn(async ({ where, data }: { where: Where; data: object }) => {
        const found = rows.filter((row) => matches(row, where));
        found.forEach((row) => Object.assign(row, data));
        return { count: found.length };
      }),
      create: vi.fn(async ({ data }: { data: { applicantUserId: string } }) => {
        const row = { ...applicant("new-application", "PENDING"), ...data };
        rows.push(row);
        return { ...row };
      }),
    },
  };
  const transaction = vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
    const savedMatch = structuredClone(match);
    const savedRows = structuredClone(rows);
    try { return await callback(tx); }
    catch (error) { Object.assign(match, savedMatch); rows.splice(0, rows.length, ...savedRows); throw error; }
  });
  const prisma = { ...tx, $transaction: transaction } as unknown as PrismaClient;
  return { prisma, tx, match, rows, transaction };
}

beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(before); });
afterEach(() => vi.useRealTimers());

describe("코트 매칭 시간 판정", () => {
  it("기한에 도달한 승인 건을 만료하고 자리를 반환하며 재실행해도 알림을 중복 생성하지 않는다", async () => {
    const f = fixture("ACCEPTED", 2);
    vi.setSystemTime(judgement);
    await expect(reconcileCourtMatches(f.prisma)).resolves.toMatchObject({ expired: 1, cancelled: 0 });
    expect(f.rows[0].status).toBe("EXPIRED_UNPAID");
    await expect(reconcileCourtMatches(f.prisma)).resolves.toMatchObject({ expired: 0, cancelled: 0 });
    expect(recordApplicationNotification).toHaveBeenCalledTimes(1);
  });

  it.each(["apply", "decision", "deposit", "confirm"] as const)("%s: 판정 시점 이후 미달 매칭은 거절하고 취소 상태는 커밋한다", async (action) => {
    const f = fixture(action === "deposit" || action === "confirm" ? "ACCEPTED" : "PENDING", 1);
    f.rows[0].paymentDueAt = new Date("2030-01-01T09:30:00Z");
    vi.setSystemTime(after);
    const request = () => {
      if (action === "apply") return applyToCourtMatch(f.prisma, { ...viewer, id: "new-user" }, "match");
      if (action === "decision") return decideCourtMatchApplication(f.prisma, operator, "application", { accept: true });
      if (action === "deposit") return claimCourtMatchDeposit(f.prisma, viewer, "application", { depositorName: "참가자" });
      return confirmCourtMatchDeposit(f.prisma, operator, "application");
    };
    await expect(request()).rejects.toMatchObject({ code: "COURT_MATCH_MINIMUM_NOT_MET" });
    expect(f.match.status).toBe("CANCELLED");
    expect(f.rows.every((r) => r.status === "CANCELLED")).toBe(true);
    expect(f.rows[1].confirmedAt).toEqual(before); // 환불 대상 이력을 보존한다.
    expect(recordApplicationNotification).toHaveBeenCalledTimes(3);
  });

  it("입금 기한이 지난 확인 요청을 거절해도 만료 처리를 되돌리지 않는다", async () => {
    const f = fixture("ACCEPTED", 2);
    vi.setSystemTime(judgement);
    await expect(confirmCourtMatchDeposit(f.prisma, operator, "application")).rejects.toMatchObject({ code: "DEPOSIT_DEADLINE_PASSED" });
    expect(f.rows[0].status).toBe("EXPIRED_UNPAID");
  });

  it("판정 직전에는 최소 인원 미달이어도 승인할 수 있다", async () => {
    const f = fixture();
    await expect(decideCourtMatchApplication(f.prisma, operator, "application", { accept: true })).resolves.toMatchObject({ status: "ACCEPTED", paymentDueAt: judgement.toISOString() });
  });

  it("판정 시점까지 최소 인원이 확정됐다면 이후 승인과 입금 확인을 허용한다", async () => {
    const f = fixture("PENDING", 2);
    vi.setSystemTime(after);
    await expect(decideCourtMatchApplication(f.prisma, operator, "application", { accept: true })).resolves.toMatchObject({ status: "ACCEPTED", paymentDueAt: "2030-01-01T09:30:00.000Z" });
    await expect(confirmCourtMatchDeposit(f.prisma, operator, "application")).resolves.toMatchObject({ status: "CONFIRMED" });
  });

  it("과거 버그로 판정 이후 확정된 인원을 최소 인원에 포함하지 않는다", async () => {
    const f = fixture("PENDING", 2);
    f.rows[2].confirmedAt = after;
    vi.setSystemTime(after);
    await expect(reconcileCourtMatch(f.prisma, "match")).resolves.toMatchObject({ didCancel: true });
  });

  it("잠금 대기 중 판정 시점에 도달하면 최신 시간으로 취소한다", async () => {
    const f = fixture();
    f.tx.$queryRaw.mockImplementationOnce(async () => { vi.setSystemTime(judgement); return []; });
    await expect(decideCourtMatchApplication(f.prisma, operator, "application", { accept: true })).rejects.toMatchObject({ code: "COURT_MATCH_MINIMUM_NOT_MET" });
    expect(f.match.status).toBe("CANCELLED");
  });

  it("신청 직전에 만료된 다른 신청의 자리를 즉시 재사용한다", async () => {
    const f = fixture("ACCEPTED", 2);
    f.match.recruitCount = 3;
    f.rows[0].paymentDueAt = before;
    f.match.courtSlot.approvalMode = "AUTO";
    await expect(applyToCourtMatch(f.prisma, { ...viewer, id: "new-user" }, "match")).resolves.toMatchObject({ status: "ACCEPTED" });
    expect(f.rows[0].status).toBe("EXPIRED_UNPAID");
    expect(f.rows.filter((r) => ["ACCEPTED", "CONFIRMED"].includes(r.status))).toHaveLength(3);
  });

  it("시작 30분 전에는 모집을 닫고 대기를 취소한 뒤 요청을 거절한다", async () => {
    const f = fixture("PENDING", 2);
    vi.setSystemTime(new Date("2030-01-01T09:30:00Z"));
    await expect(decideCourtMatchApplication(f.prisma, operator, "application", { accept: true })).rejects.toMatchObject({ code: "COURT_MATCH_APPLICATION_CLOSED" });
    expect(f.match.status).toBe("CLOSED");
    expect(f.rows[0].status).toBe("CANCELLED");
  });

  it("옛 모집자 주최 코트 매칭은 자동 판정에서 제외한다", async () => {
    const f = fixture();
    f.match.hostUserId = "legacy-host";
    vi.setSystemTime(after);
    await expect(reconcileCourtMatch(f.prisma, "match")).resolves.toEqual({ expiredCount: 0, didCancel: false });
    expect(f.match.status).toBe("OPEN");
  });
});

describe("환불 계좌와 완료의 동시 처리", () => {
  it("완료 표시가 먼저 잠금을 얻으면 대기하던 계좌 수정은 완료 여부를 다시 읽고 거절한다", async () => {
    const f = fixture("CANCELLED");
    f.rows[0].confirmedAt = before;
    f.tx.$queryRaw.mockImplementationOnce(async () => {
      // 다른 트랜잭션이 완료한 뒤 잠금을 반환하는 순서.
      f.rows[0].refundCompletedAt = before;
      return [];
    });
    await expect(submitCourtMatchRefundAccount(f.prisma, viewer, "application", refundInput)).rejects.toMatchObject({ code: "REFUND_ALREADY_COMPLETED" });
    expect(f.tx.matchApplication.update).not.toHaveBeenCalled();
    expect(f.rows[0].refundAccountNumber).toBe("111");
  });

  it("계좌 수정이 먼저 끝나면 완료 처리가 새 계좌와 같은 잠금을 사용한다", async () => {
    const f = fixture("CANCELLED");
    f.rows[0].confirmedAt = before;
    await submitCourtMatchRefundAccount(f.prisma, viewer, "application", refundInput);
    await completeCourtMatchRefund(f.prisma, operator, "application");
    expect(f.rows[0]).toMatchObject({ refundAccountNumber: "222", refundCompletedAt: before });
    expect(f.tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(f.tx.$queryRaw.mock.calls[0]).toEqual(f.tx.$queryRaw.mock.calls[1]);
    await expect(submitCourtMatchRefundAccount(f.prisma, viewer, "application", refundInput)).rejects.toMatchObject({ code: "REFUND_ALREADY_COMPLETED" });
  });

  it("본인 신청이 아니면 환불 계좌를 수정할 수 없다", async () => {
    const f = fixture("CANCELLED");
    f.rows[0].confirmedAt = before;
    await expect(submitCourtMatchRefundAccount(f.prisma, { id: "other" }, "application", refundInput)).rejects.toMatchObject({ code: "APPLICATION_NOT_FOUND" });
    expect(f.tx.matchApplication.update).not.toHaveBeenCalled();
  });
});

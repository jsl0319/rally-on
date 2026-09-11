import { lockAccountTransactions, assertActiveTransactionUser } from "./account-transaction-lock";
import { z } from "zod";
import { Prisma, type PrismaClient, type SupportInquiryStatus } from "@/generated/prisma/client";
import { DomainError } from "./profile-service";
import { assertInternalReviewer } from "./operator-application-service";
import { courtMoneySummary } from "./court-match-money";
import { lockApplicationMatch } from "./court-match-service";

export const supportInquiryInputSchema = z.object({
  message: z.string().trim().min(10, "문의 내용을 10자 이상 입력해 주세요.").max(1000, "문의 내용은 1000자 이하로 입력해 주세요."),
  matchId: z.uuid().nullable().optional(),
});
export type SupportInquiryInput = z.infer<typeof supportInquiryInputSchema>;
export type SupportAudience = "member" | "reviewer" | "operator";
export const supportActionInputSchema = z.object({
  action: z.enum(["CLAIM", "REPLY", "REQUEST_OPERATOR", "OPERATOR_REPLY", "RESOLVE"]),
  body: z.string().trim().min(2).max(2000), expectedVersion: z.number().int().positive(), clientRequestId: z.uuid(),
});
export const supportListQuerySchema = z.object({ cursor: z.uuid().optional(), status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_OPERATOR", "ANSWERED", "RESOLVED"]).optional() });
const statusLabels: Record<SupportInquiryStatus, string> = { OPEN: "접수됨", IN_PROGRESS: "검토 중", WAITING_OPERATOR: "운영자 확인 중", ANSWERED: "답변 완료", RESOLVED: "해결 완료" };
const include = {
  assignee: { select: { status: true, role: true } },
  application: { select: { depositCode: true, applicantUser: { select: { nickname: true } } } },
  match: {
    select: {
      id: true, title: true, startsAt: true, hostUserId: true, courtSlotId: true, courtSource: true, host: { select: { status: true } },
      courtSlot: { select: { courtUnit: { select: { court: {
        select: { name: true, operatorApplication: { select: { applicantUserId: true } } },
      } } } } },
    },
  },
  messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
} satisfies Prisma.SupportInquiryInclude;
type Inquiry = Prisma.SupportInquiryGetPayload<{ include: typeof include }>;
function conflict(message = "문의가 갱신됐어요. 새로고침 후 다시 확인해 주세요."): never { throw new DomainError("SUPPORT_STATE_CONFLICT", 409, message); }
function toView(i: Inquiry, audience: SupportAudience, viewerId: string) {
  const operator = audience === "operator";
  return {
    id: i.id, message: operator ? null : i.message, status: i.status, statusLabel: statusLabels[i.status], version: i.version,
    assignedToMe: i.assigneeUserId === viewerId, assigned: Boolean(i.assigneeUserId), canReassign: Boolean(i.assignee && (i.assignee.status !== "ACTIVE" || i.assignee.role !== "INTERNAL_REVIEWER")),
    applicationId: audience === "member" ? null : i.applicationId,
    applicantLabel: audience === "member" || !i.application ? null : `${i.application.applicantUser.nickname}${i.application.depositCode ? ` · 입금 코드 ${i.application.depositCode}` : ""}`,
    createdAt: i.createdAt.toISOString(),
    match: i.match ? { id: i.match.id, title: i.match.courtSlot?.courtUnit.court.name ?? i.match.title, startsAt: i.match.startsAt.toISOString(), slotId: i.match.courtSlotId } : null,
    messages: i.messages.filter((m) => audience === "reviewer" || m.visibility === (operator ? "OPERATOR" : "PUBLIC")).map((m) => ({
      id: m.id, body: m.body, visibility: m.visibility, createdAt: m.createdAt.toISOString(),
      authorLabel: m.authorUserId === i.userId ? (viewerId === i.userId ? "나의 문의" : "회원") : m.authorUserId === i.match?.hostUserId ? "코트 운영자" : "담당자",
    })),
  };
}
export type SupportInquiryView = ReturnType<typeof toView>;
export async function createSupportInquiry(prisma: PrismaClient, userId: string, input: SupportInquiryInput, limited = false) {
  const matchId = input.matchId ? (await prisma.match.findFirst({ where: { id: input.matchId, OR: [{ hostUserId: userId }, { applications: { some: { applicantUserId: userId } } }] }, select: { id: true } }))?.id ?? null : null;
  if (limited && (!matchId || !(await prisma.match.count({ where: { id: matchId, courtSource: "PARTNER_COURT" } })))) throw new DomainError("SUPPORT_TRANSACTION_REQUIRED", 403, "본인의 기존 코트 매칭에 대해서만 문의할 수 있어요.");
  const application = matchId ? await prisma.matchApplication.findUnique({ where: { matchId_applicantUserId: { matchId, applicantUserId: userId } }, select: { id: true } }) : null;
  const inquiry = await prisma.supportInquiry.create({ data: { userId, matchId, applicationId: application?.id, message: input.message }, include });
  return toView(inquiry, "member", userId);
}
export async function listMySupportInquiries(prisma: PrismaClient, userId: string, limited = false) {
  const items = await prisma.supportInquiry.findMany({ where: { userId, ...(limited ? { match: { courtSource: "PARTNER_COURT" } } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], include });
  return { items: items.map((i) => toView(i, "member", userId)) };
}
export async function listSupportQueue(prisma: PrismaClient, viewer: { id: string; role: string }, audience: "reviewer" | "operator", query: z.infer<typeof supportListQuerySchema>) {
  if (audience === "reviewer") assertInternalReviewer(viewer);
  const items = await prisma.supportInquiry.findMany({
    where: { ...(query.status ? { status: query.status } : {}), ...(audience === "operator" ? {
      match: { hostUserId: viewer.id, courtSlot: { courtUnit: { court: { operatorApplication: { applicantUserId: viewer.id } } } } },
      messages: { some: { action: "REQUEST_OPERATOR" } },
    } : {}) },
    include, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  return { items: items.slice(0, 50).map((i) => toView(i, audience, viewer.id)), nextCursor: items.length > 50 ? items[49].id : null };
}

export async function actOnSupportInquiry(prisma: PrismaClient, viewer: { id: string; role: string }, inquiryId: string, audience: SupportAudience, input: z.infer<typeof supportActionInputSchema>, limited = false) {
  if (audience === "reviewer") assertInternalReviewer(viewer);
  return prisma.$transaction(async (tx) => {
    await lockAccountTransactions(tx);
    if (!limited) {
      const actor = await assertActiveTransactionUser(tx, viewer.id);
      if (audience === "reviewer") assertInternalReviewer(actor);
    }
    await tx.$queryRaw(Prisma.sql`SELECT id FROM support_inquiries WHERE id = ${inquiryId}::uuid FOR UPDATE`);
    const inquiry = await tx.supportInquiry.findUnique({ where: { id: inquiryId }, include });
    if (!inquiry || (audience === "member" && inquiry.userId !== viewer.id) || (audience === "operator" && (inquiry.match?.hostUserId !== viewer.id || inquiry.match.courtSlot?.courtUnit.court.operatorApplication.applicantUserId !== viewer.id || !inquiry.messages.some((m) => m.action === "REQUEST_OPERATOR")))) {
      throw new DomainError("SUPPORT_NOT_FOUND", 404, "문의를 찾을 수 없어요.");
    }
    if (limited && (audience !== "member" || inquiry.match?.courtSource !== "PARTNER_COURT")) throw new DomainError("SUPPORT_TRANSACTION_REQUIRED", 403, "본인의 기존 코트 매칭 문의만 처리할 수 있어요.");
    if (audience === "reviewer" && (inquiry.userId === viewer.id || inquiry.match?.hostUserId === viewer.id)) throw new DomainError("SELF_REVIEW_NOT_ALLOWED", 403, "본인 관련 문의는 다른 담당자가 처리해야 해요.");
    const existing = inquiry.messages.find((m) => m.clientRequestId === input.clientRequestId);
    if (existing) {
      if (existing.authorUserId !== viewer.id || existing.body !== input.body || existing.action !== input.action) conflict();
      return { id: inquiryId };
    }
    if (input.expectedVersion !== inquiry.version) conflict();
    let status: SupportInquiryStatus;
    if (audience === "member") {
      if (input.action !== "REPLY") throw new DomainError("SUPPORT_ACTION_FORBIDDEN", 403, "추가 문의만 보낼 수 있어요.");
      status = inquiry.assigneeUserId ? "IN_PROGRESS" : "OPEN";
    } else if (audience === "operator") {
      if (input.action !== "OPERATOR_REPLY" || inquiry.status !== "WAITING_OPERATOR") conflict("담당자의 확인 요청을 받은 문의에만 답변할 수 있어요.");
      status = "IN_PROGRESS";
    } else {
      if (input.action === "CLAIM") {
        if (inquiry.assigneeUserId && inquiry.assigneeUserId !== viewer.id && inquiry.assignee?.status === "ACTIVE" && inquiry.assignee.role === "INTERNAL_REVIEWER") conflict("다른 담당자가 맡고 있어요.");
        status = "IN_PROGRESS";
      } else {
        if (inquiry.assigneeUserId !== viewer.id) conflict("먼저 문의 담당을 맡아 주세요.");
        if (input.action === "REQUEST_OPERATOR") {
          if (!inquiry.match?.courtSlot || inquiry.match.hostUserId !== inquiry.match.courtSlot.courtUnit.court.operatorApplication.applicantUserId) conflict("운영자 주최 코트 매칭 문의에만 대조를 요청할 수 있어요.");
          if (inquiry.match.host.status !== "ACTIVE") conflict("운영자가 비활성 상태예요. 거래 인계 화면에서 확인해 주세요.");
          status = "WAITING_OPERATOR";
        } else if (input.action === "REPLY") status = "ANSWERED";
        else if (input.action === "RESOLVE") {
          if (inquiry.status !== "ANSWERED" || !inquiry.messages.some((m) => m.visibility === "PUBLIC" && m.action === "REPLY" && m.authorUserId === viewer.id)) conflict("회원에게 답변을 먼저 남겨 주세요.");
          if (inquiry.applicationId) {
            await lockApplicationMatch(tx, inquiry.applicationId);
            const a = await tx.matchApplication.findUnique({ where: { id: inquiry.applicationId }, include: { refundAttempts: true, match: { select: { courtSource: true, totalCourtFeeKrw: true } } } });
            if (a?.match.courtSource === "PARTNER_COURT") {
              const money = courtMoneySummary(a, a.match.totalCourtFeeKrw ?? 0);
              if (money.outstandingKrw || money.reservedKrw || money.needsReview) conflict("반환이나 송금 확인이 남아 있어요. 금전 처리를 마친 뒤 해결 완료로 표시해 주세요.");
            }
          }
          status = "RESOLVED";
        } else throw new DomainError("SUPPORT_ACTION_FORBIDDEN", 403, "허용되지 않은 처리예요.");
      }
    }
    await tx.supportInquiryMessage.create({ data: { inquiryId, authorUserId: viewer.id, clientRequestId: input.clientRequestId, action: input.action, ...(input.action === "CLAIM" ? { previousAssigneeUserId: inquiry.assigneeUserId, nextAssigneeUserId: viewer.id } : {}), visibility: ["REQUEST_OPERATOR", "OPERATOR_REPLY"].includes(input.action) ? "OPERATOR" : "PUBLIC", body: input.body } });
    await tx.supportInquiry.update({ where: { id: inquiryId }, data: { status, version: { increment: 1 }, ...(input.action === "CLAIM" ? { assigneeUserId: viewer.id } : {}) } });
    return { id: inquiryId };
  });
}

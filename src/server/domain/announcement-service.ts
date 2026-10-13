import { z } from "zod";
import type { Announcement, PrismaClient } from "@/generated/prisma/client";
import { assertInternalReviewer } from "./operator-application-service";
import { assertActiveTransactionUser, lockAccountTransactions } from "./account-transaction-lock";
import { DomainError } from "./profile-service";

const content = {
  title: z.string().trim().min(1, "제목을 입력해 주세요.").max(120),
  body: z.string().trim().min(1, "내용을 입력해 주세요.").max(2000),
  isPinned: z.boolean(),
};
export const announcementCreateSchema = z.object({ ...content, id: z.uuid() }).strict();
export const announcementUpdateSchema = z.object({ ...content, status: z.enum(["DRAFT", "PUBLISHED", "HIDDEN"]), expectedVersion: z.number().int().positive() }).strict();
export const announcementListSchema = z.object({ status: z.enum(["DRAFT", "PUBLISHED", "HIDDEN"]).optional(), cursor: z.uuid().optional() });

function toAdminView(item: Announcement) {
  return { id: item.id, title: item.title, body: item.body, status: item.status, isPinned: item.isPinned, version: item.version, publishedAt: item.publishedAt?.toISOString() ?? null, updatedAt: item.updatedAt.toISOString() };
}
export type AdminAnnouncement = ReturnType<typeof toAdminView>;

export async function listAnnouncements(prisma: PrismaClient) {
  const items = await prisma.announcement.findMany({
    where: { status: "PUBLISHED", publishedAt: { not: null } },
    orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }, { id: "desc" }], take: 50,
  });
  return { items: items.map(item => ({ id: item.id, title: item.title, body: item.body, isPinned: item.isPinned, publishedAt: item.publishedAt!.toISOString() })) };
}

export async function requireServiceAdmin(prisma: PrismaClient, viewer: { id: string; role: string }) {
  assertInternalReviewer(viewer);
  assertInternalReviewer(await assertActiveTransactionUser(prisma, viewer.id));
}

export async function listAdminAnnouncements(prisma: PrismaClient, viewer: { id: string; role: string }, query: z.infer<typeof announcementListSchema>) {
  await requireServiceAdmin(prisma, viewer);
  const items = await prisma.announcement.findMany({ where: query.status ? { status: query.status } : {}, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 51, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}) });
  return { items: items.slice(0, 50).map(toAdminView), nextCursor: items.length > 50 ? items[49].id : null };
}

export async function getAdminAnnouncement(prisma: PrismaClient, viewer: { id: string; role: string }, id: string) {
  await requireServiceAdmin(prisma, viewer);
  const item = await prisma.announcement.findUnique({ where: { id } });
  if (!item) throw new DomainError("ANNOUNCEMENT_NOT_FOUND", 404, "공지를 찾을 수 없어요.");
  return toAdminView(item);
}

export async function createAnnouncement(prisma: PrismaClient, viewer: { id: string; role: string }, input: z.infer<typeof announcementCreateSchema>) {
  assertInternalReviewer(viewer);
  return prisma.$transaction(async tx => {
    await lockAccountTransactions(tx);
    assertInternalReviewer(await assertActiveTransactionUser(tx, viewer.id));
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`announcement:${input.id}`}, 0))::text`;
    const existing = await tx.announcement.findUnique({ where: { id: input.id } });
    if (existing) {
      if (existing.createdByUserId !== viewer.id || existing.title !== input.title || existing.body !== input.body || existing.isPinned !== input.isPinned) throw new DomainError("ANNOUNCEMENT_CONFLICT", 409, "이미 저장된 공지예요. 목록에서 다시 열어 주세요.");
      return toAdminView(existing);
    }
    return toAdminView(await tx.announcement.create({ data: { ...input, createdByUserId: viewer.id, updatedByUserId: viewer.id } }));
  });
}

export async function updateAnnouncement(prisma: PrismaClient, viewer: { id: string; role: string }, id: string, input: z.infer<typeof announcementUpdateSchema>) {
  assertInternalReviewer(viewer);
  return prisma.$transaction(async tx => {
    await lockAccountTransactions(tx);
    assertInternalReviewer(await assertActiveTransactionUser(tx, viewer.id));
    const previous = await tx.announcement.findUnique({ where: { id } });
    if (!previous) throw new DomainError("ANNOUNCEMENT_NOT_FOUND", 404, "공지를 찾을 수 없어요.");
    if (input.status === "DRAFT" && previous.status !== "DRAFT") throw new DomainError("ANNOUNCEMENT_STATUS_CONFLICT", 409, "공개한 공지는 숨김으로 변경해 주세요.");
    const { expectedVersion, ...data } = input;
    const result = await tx.announcement.updateMany({ where: { id, version: expectedVersion }, data: { ...data, publishedAt: previous.publishedAt ?? (data.status === "PUBLISHED" ? new Date() : null), updatedByUserId: viewer.id, version: { increment: 1 } } });
    if (!result.count) throw new DomainError("ANNOUNCEMENT_CONFLICT", 409, "다른 화면에서 수정됐어요. 입력 내용을 복사한 뒤 공지를 다시 열어 주세요.");
    return toAdminView(await tx.announcement.findUniqueOrThrow({ where: { id } }));
  });
}

import { Prisma } from "@/generated/prisma/client";
import type { MatchConversationMemberRole, PrismaClient, User } from "@/generated/prisma/client";

import {
  CHAT_MESSAGE_PAGE_SIZE,
  CHAT_MESSAGE_RATE_LIMIT_PER_MINUTE,
  type MatchChatMessageInput,
  type MatchChatModerationActionInput,
  type MatchChatReadInput,
  type MatchChatReportInput,
} from "@/server/domain/match-chat";
import { DomainError } from "@/server/domain/profile-service";

export type MatchTransaction = Prisma.TransactionClient;

type MessageWithSender = {
  id: string;
  type: "USER" | "SYSTEM";
  body: string;
  visibility: "VISIBLE" | "HIDDEN";
  createdAt: Date;
  sender: { id: string; nickname: string } | null;
  imageUploads?: { id: string; position: number | null }[];
};

type ConversationMember = {
  id: string;
  userId: string;
  role: MatchConversationMemberRole;
  sendingSuspendedAt: Date | null;
  lastReadMessageId: string | null;
  user: { nickname: string };
};

type MessageCursor = { id: string; createdAt: Date };

const messageInclude = {
  sender: { select: { id: true, nickname: true } },
  imageUploads: { where: { status: "ATTACHED" }, select: { id: true, position: true }, orderBy: [{ position: "asc" }, { id: "asc" }] },
} satisfies Prisma.MatchChatMessageInclude;

const conversationInclude = {
  match: { select: { id: true, title: true, startsAt: true, endsAt: true, status: true, hostUserId: true } },
  members: { include: { user: { select: { nickname: true } } } },
} satisfies Prisma.MatchConversationInclude;

function toMessageView(message: MessageWithSender, viewerUserId?: string) {
  return {
    id: message.id,
    type: message.type,
    body: message.visibility === "HIDDEN" ? "운영 검토로 숨겨진 메시지예요." : message.body,
    isHidden: message.visibility === "HIDDEN",
    sender: message.sender ? { nickname: message.sender.nickname } : null,
    images: message.visibility === "VISIBLE" ? (message.imageUploads ?? []).map((image) => ({ id: image.id })) : [],
    isMine: Boolean(viewerUserId && message.sender?.id === viewerUserId),
    createdAt: message.createdAt.toISOString(),
  };
}

function toCursor(message: Pick<MessageWithSender, "id" | "createdAt">) {
  return Buffer.from(JSON.stringify({ createdAt: message.createdAt.toISOString(), id: message.id })).toString("base64url");
}

function parseCursor(cursor: string) {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!decoded || typeof decoded !== "object" || typeof (decoded as { createdAt?: unknown }).createdAt !== "string" || typeof (decoded as { id?: unknown }).id !== "string") throw new Error();
    const createdAt = new Date((decoded as { createdAt: string }).createdAt);
    if (Number.isNaN(createdAt.getTime())) throw new Error();
    return { createdAt, id: (decoded as { id: string }).id };
  } catch {
    throw new DomainError("INVALID_REQUEST", 400, "메시지 목록을 다시 불러와 주세요.");
  }
}

function afterCursorWhere(cursor: { createdAt: Date; id: string }) {
  return {
    OR: [
      { createdAt: { gt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { gt: cursor.id } },
    ],
  };
}

function beforeCursorWhere(cursor: { createdAt: Date; id: string }) {
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

function isAtOrAfterCursor(candidate: MessageCursor, target: MessageCursor) {
  return candidate.createdAt > target.createdAt || candidate.createdAt.getTime() === target.createdAt.getTime() && candidate.id >= target.id;
}

export async function findMatchConversationForMember(prisma: PrismaClient | MatchTransaction, matchId: string, userId: string) {
  const conversation = await prisma.matchConversation.findFirst({
    where: { matchId, members: { some: { userId } } },
    include: conversationInclude,
  });
  if (!conversation || conversation.status === "ARCHIVED") {
    throw new DomainError("MATCH_CONVERSATION_NOT_FOUND", 404, "채팅방을 찾을 수 없어요.");
  }
  const member = conversation.members.find((item) => item.userId === userId);
  if (!member) throw new DomainError("MATCH_CONVERSATION_NOT_FOUND", 404, "채팅방을 찾을 수 없어요.");
  return { conversation, member: member as ConversationMember };
}

export async function requireOpenMatchConversationForSending(transaction: MatchTransaction, userId: string, matchId: string) {
  const { conversation, member } = await findMatchConversationForMember(transaction, matchId, userId);
  if (shouldBecomeReadOnlyAfterMatch(conversation)) {
    await makeConversationReadOnly(transaction, matchId, "이용 시간이 지나 이 채팅방은 읽기 전용이에요.");
    throw new DomainError("MATCH_CONVERSATION_NOT_OPEN", 409, "읽기 전용 채팅방에는 메시지를 보낼 수 없어요.");
  }
  if (conversation.status !== "OPEN") throw new DomainError("MATCH_CONVERSATION_NOT_OPEN", 409, "읽기 전용 채팅방에는 메시지를 보낼 수 없어요.");
  if (member.sendingSuspendedAt) throw new DomainError("CHAT_SENDING_SUSPENDED", 403, "현재 이 채팅방에서 메시지를 보낼 수 없어요.");
  return { conversation, member };
}

async function unreadCount(prisma: PrismaClient | MatchTransaction, conversationId: string, lastReadMessageId: string | null) {
  if (!lastReadMessageId) {
    return prisma.matchChatMessage.count({ where: { conversationId, visibility: "VISIBLE" } });
  }
  const lastRead = await prisma.matchChatMessage.findFirst({ where: { id: lastReadMessageId, conversationId }, select: { createdAt: true, id: true } });
  if (!lastRead) return prisma.matchChatMessage.count({ where: { conversationId, visibility: "VISIBLE" } });
  return prisma.matchChatMessage.count({ where: { conversationId, visibility: "VISIBLE", ...afterCursorWhere(lastRead) } });
}

async function getLastSentMessageRead(prisma: PrismaClient, conversation: { id: string; members: ConversationMember[] }, userId: string) {
  const latestSentMessage = await prisma.matchChatMessage.findFirst({
    where: { conversationId: conversation.id, senderUserId: userId, type: "USER", visibility: "VISIBLE" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, createdAt: true },
  });
  if (!latestSentMessage) return null;

  const otherMembers = conversation.members.filter((member) => member.userId !== userId);
  if (otherMembers.length === 0) return { messageId: latestSentMessage.id, unreadOtherMemberCount: 0 };

  const markerIds = otherMembers.flatMap((member) => member.lastReadMessageId ? [member.lastReadMessageId] : []);
  if (markerIds.length === 0) return { messageId: latestSentMessage.id, unreadOtherMemberCount: otherMembers.length };

  const markers = await prisma.matchChatMessage.findMany({
    where: { conversationId: conversation.id, id: { in: markerIds } },
    select: { id: true, createdAt: true },
  });
  const markerById = new Map(markers.map((marker) => [marker.id, marker]));
  const unreadOtherMemberCount = otherMembers.filter((member) => {
    const marker = member.lastReadMessageId ? markerById.get(member.lastReadMessageId) : null;
    return !marker || !isAtOrAfterCursor(marker, latestSentMessage);
  }).length;

  return { messageId: latestSentMessage.id, unreadOtherMemberCount };
}

function toConversationView(conversation: Prisma.MatchConversationGetPayload<{ include: typeof conversationInclude }>, member: ConversationMember, unreadMessageCount: number) {
  return {
    match: {
      id: conversation.match.id,
      title: conversation.match.title,
      startsAt: conversation.match.startsAt.toISOString(),
      endsAt: conversation.match.endsAt.toISOString(),
      status: conversation.match.status,
    },
    status: conversation.status,
    canSend: conversation.status === "OPEN" && member.sendingSuspendedAt === null,
    sendingSuspended: member.sendingSuspendedAt !== null,
    unreadMessageCount,
    members: conversation.members.map((item) => ({ nickname: item.user.nickname, role: item.role })),
  };
}

function shouldBecomeReadOnlyAfterMatch(conversation: { status: string; match: { endsAt: Date } }, now = new Date()) {
  return conversation.status === "OPEN" && conversation.match.endsAt <= new Date(now.getTime() - 24 * 60 * 60 * 1000);
}

export async function addAcceptedMemberToConversation(
  transaction: MatchTransaction,
  input: { matchId: string; hostUserId: string; applicantUserId: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const existing = await transaction.matchConversation.findUnique({ where: { matchId: input.matchId }, select: { id: true } });

  if (!existing) {
    await transaction.matchConversation.create({
      data: {
        matchId: input.matchId,
        members: {
          create: [
            { userId: input.hostUserId, role: "HOST" },
            { userId: input.applicantUserId, role: "PARTICIPANT" },
          ],
        },
        messages: { create: { type: "SYSTEM", body: "매칭이 성사됐어요. 당일 준비를 편하게 조율해 보세요." } },
      },
    });
    return;
  }

  await transaction.matchConversationMember.createMany({
    data: [
      { conversationId: existing.id, userId: input.hostUserId, role: "HOST" },
      { conversationId: existing.id, userId: input.applicantUserId, role: "PARTICIPANT" },
    ],
    skipDuplicates: true,
  });
  await transaction.matchConversation.update({ where: { id: existing.id }, data: { updatedAt: now } });
}

/**
 * 참가를 취소한 사람은 대화방에서 뺀다. 남아 있으면 자기가 가지 않는 매칭의
 * 준비 대화를 계속 보게 된다. 방과 지난 메시지는 남은 사람들을 위해 유지한다.
 */
export async function removeParticipantFromConversation(
  transaction: MatchTransaction,
  input: { matchId: string; userId: string; now?: Date },
) {
  const conversation = await transaction.matchConversation.findUnique({ where: { matchId: input.matchId }, select: { id: true } });
  if (!conversation) return;
  const removed = await transaction.matchConversationMember.deleteMany({
    where: { conversationId: conversation.id, userId: input.userId, role: "PARTICIPANT" },
  });
  if (removed.count === 0) return;
  await transaction.matchConversation.update({
    where: { id: conversation.id },
    data: {
      updatedAt: input.now ?? new Date(),
      messages: { create: { type: "SYSTEM", body: "참가자 한 명이 참가를 취소했어요." } },
    },
  });
}

export async function makeConversationReadOnly(transaction: MatchTransaction, matchId: string, message: string, now = new Date()) {
  const conversation = await transaction.matchConversation.findUnique({ where: { matchId }, select: { id: true, status: true } });
  if (!conversation || conversation.status !== "OPEN") return false;
  const updated = await transaction.matchConversation.updateMany({
    where: { id: conversation.id, status: "OPEN" },
    data: { status: "READ_ONLY", readOnlyAt: now, updatedAt: now },
  });
  if (updated.count !== 1) return false;
  await transaction.matchChatMessage.create({ data: { conversationId: conversation.id, type: "SYSTEM", body: message } });
  return true;
}

export async function reconcileExpiredConversations(prisma: PrismaClient, now = new Date()) {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const conversations = await prisma.matchConversation.findMany({
    where: { status: "OPEN", match: { endsAt: { lte: cutoff } } },
    select: { matchId: true },
  });
  const results = await Promise.all(conversations.map(({ matchId }) => prisma.$transaction((transaction) => makeConversationReadOnly(transaction, matchId, "이용 시간이 지나 이 채팅방은 읽기 전용이에요.", now))));
  return { checked: conversations.length, readOnly: results.filter(Boolean).length };
}

export async function getMatchConversation(prisma: PrismaClient, userId: string, matchId: string) {
  const { conversation, member } = await findMatchConversationForMember(prisma, matchId, userId);
  if (shouldBecomeReadOnlyAfterMatch(conversation)) {
    return prisma.$transaction(async (transaction) => {
      await makeConversationReadOnly(transaction, matchId, "이용 시간이 지나 이 채팅방은 읽기 전용이에요.");
      const refreshed = await findMatchConversationForMember(transaction, matchId, userId);
      const unreadMessageCount = await unreadCount(transaction, refreshed.conversation.id, refreshed.member.lastReadMessageId);
      return toConversationView(refreshed.conversation, refreshed.member, unreadMessageCount);
    });
  }
  const unreadMessageCount = await unreadCount(prisma, conversation.id, member.lastReadMessageId);
  return toConversationView(conversation, member, unreadMessageCount);
}

export async function getMatchConversationMessages(prisma: PrismaClient, userId: string, matchId: string, query: { before?: string; after?: string }) {
  if (query.before && query.after) throw new DomainError("INVALID_REQUEST", 400, "메시지 목록을 다시 불러와 주세요.");
  const { conversation } = await findMatchConversationForMember(prisma, matchId, userId);
  const cursor = query.before ? parseCursor(query.before) : query.after ? parseCursor(query.after) : null;
  const direction = query.before || !query.after ? "before" : "after";
  const records = await prisma.matchChatMessage.findMany({
    where: {
      conversationId: conversation.id,
      visibility: "VISIBLE",
      ...(cursor ? direction === "before" ? beforeCursorWhere(cursor) : afterCursorWhere(cursor) : {}),
    },
    orderBy: direction === "before" ? [{ createdAt: "desc" }, { id: "desc" }] : [{ createdAt: "asc" }, { id: "asc" }],
    take: CHAT_MESSAGE_PAGE_SIZE + 1,
    include: messageInclude,
  });
  const hasMore = records.length > CHAT_MESSAGE_PAGE_SIZE;
  const visible = hasMore ? records.slice(0, CHAT_MESSAGE_PAGE_SIZE) : records;
  const chronological = direction === "before" ? [...visible].reverse() : visible;
  const lastSentMessageRead = await getLastSentMessageRead(prisma, conversation, userId);
  return {
    items: chronological.map((message) => toMessageView(message, userId)),
    pageInfo: {
      hasMoreBefore: direction === "before" ? hasMore : Boolean(query.before),
      nextBefore: direction === "before" && hasMore && chronological[0] ? toCursor(chronological[0]) : null,
      nextAfter: direction === "after" && hasMore && chronological.at(-1) ? toCursor(chronological.at(-1)!) : null,
      latestCursor: chronological.at(-1) ? toCursor(chronological.at(-1)!) : null,
    },
    lastSentMessageRead,
  };
}

export async function sendMatchChatMessage(prisma: PrismaClient, userId: string, matchId: string, input: MatchChatMessageInput) {
  const send = async (transaction: MatchTransaction) => {
    const { conversation, member } = await requireOpenMatchConversationForSending(transaction, userId, matchId);

    const existing = await transaction.matchChatMessage.findUnique({
      where: { senderUserId_clientRequestId: { senderUserId: userId, clientRequestId: input.clientRequestId } },
      include: messageInclude,
    });
    if (existing) {
      if (existing.conversationId !== conversation.id) throw new DomainError("CHAT_MESSAGE_DUPLICATE", 409, "같은 요청 식별자로 다른 메시지를 보낼 수 없어요.");
      return { message: toMessageView(existing, userId), created: false };
    }

    const minuteAgo = new Date(Date.now() - 60_000);
    const recentCount = await transaction.matchChatMessage.count({ where: { conversationId: conversation.id, senderUserId: userId, type: "USER", createdAt: { gte: minuteAgo } } });
    if (recentCount >= CHAT_MESSAGE_RATE_LIMIT_PER_MINUTE) throw new DomainError("CHAT_MESSAGE_RATE_LIMITED", 429, "메시지를 너무 빠르게 보내고 있어요. 잠시 후 다시 시도해 주세요.");

    const imageUploadIds = input.imageUploadIds ?? [];
    if (imageUploadIds.length > 0) {
      const pendingUploads = await transaction.matchChatImageUpload.findMany({
        where: { id: { in: imageUploadIds }, conversationId: conversation.id, ownerUserId: userId, status: "PENDING" },
        select: { id: true },
      });
      if (pendingUploads.length !== imageUploadIds.length) {
        throw new DomainError("CHAT_IMAGE_UPLOAD_INVALID", 409, "사진을 다시 선택한 뒤 보내 주세요.");
      }
    }

    const created = await transaction.matchChatMessage.create({
      data: { conversationId: conversation.id, senderUserId: userId, body: input.body, type: "USER", clientRequestId: input.clientRequestId },
      select: { id: true },
    });
    for (const [position, imageUploadId] of imageUploadIds.entries()) {
      const attached = await transaction.matchChatImageUpload.updateMany({
        where: { id: imageUploadId, conversationId: conversation.id, ownerUserId: userId, status: "PENDING" },
        data: { status: "ATTACHED", messageId: created.id, position, attachedAt: new Date(), cleanupClaimedAt: null },
      });
      if (attached.count !== 1) {
        throw new DomainError("CHAT_IMAGE_UPLOAD_INVALID", 409, "사진을 다시 선택한 뒤 보내 주세요.");
      }
    }
    const createdMessage = await transaction.matchChatMessage.findUnique({ where: { id: created.id }, include: messageInclude });
    if (!createdMessage) throw new DomainError("MATCH_CONVERSATION_NOT_FOUND", 404, "채팅방을 찾을 수 없어요.");
    await transaction.matchConversationMember.update({ where: { id: member.id }, data: { lastReadMessageId: created.id } });
    await transaction.matchConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    return { message: toMessageView(createdMessage, userId), created: true };
  };

  try {
    return await prisma.$transaction(send);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.matchChatMessage.findUnique({
        where: { senderUserId_clientRequestId: { senderUserId: userId, clientRequestId: input.clientRequestId } },
        include: messageInclude,
      });
      if (existing) return { message: toMessageView(existing, userId), created: false };
    }
    throw error;
  }
}

export async function markMatchConversationRead(prisma: PrismaClient, userId: string, matchId: string, input: MatchChatReadInput) {
  return prisma.$transaction(async (transaction) => {
    const { conversation, member } = await findMatchConversationForMember(transaction, matchId, userId);
    const message = await transaction.matchChatMessage.findFirst({ where: { id: input.messageId, conversationId: conversation.id, visibility: "VISIBLE" }, select: { id: true } });
    if (!message) throw new DomainError("MATCH_CONVERSATION_NOT_FOUND", 404, "채팅방을 찾을 수 없어요.");
    await transaction.matchConversationMember.update({ where: { id: member.id }, data: { lastReadMessageId: message.id } });
    return { lastReadMessageId: message.id };
  });
}

export async function reportMatchChatMessage(prisma: PrismaClient, userId: string, matchId: string, messageId: string, input: MatchChatReportInput) {
  try {
    return await prisma.$transaction(async (transaction) => {
      const { conversation } = await findMatchConversationForMember(transaction, matchId, userId);
      const message = await transaction.matchChatMessage.findFirst({ where: { id: messageId, conversationId: conversation.id, visibility: "VISIBLE" }, select: { id: true, senderUserId: true, type: true } });
      if (!message) throw new DomainError("MATCH_CONVERSATION_NOT_FOUND", 404, "채팅방을 찾을 수 없어요.");
      if (message.type !== "USER" || message.senderUserId === userId) throw new DomainError("CHAT_REPORT_NOT_ALLOWED", 422, "상대방이 보낸 메시지만 신고할 수 있어요.");
      const report = await transaction.matchChatReport.create({
        data: { messageId: message.id, reporterUserId: userId, reason: input.reason, description: input.description?.trim() || null },
        select: { id: true, status: true, createdAt: true },
      });
      return { id: report.id, status: report.status, createdAt: report.createdAt.toISOString() };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DomainError("CHAT_REPORT_DUPLICATE", 409, "이미 신고한 메시지예요.");
    }
    throw error;
  }
}

/**
 * 안 읽은 메시지가 있는 방의 수. 하단 메뉴 배지가 쓴다.
 *
 * 방마다 세면 방 수만큼 질의가 나가므로 한 번의 질의로 끝낸다. 읽음 기준은 채팅
 * 목록의 미읽음 수와 같아야 한다. 둘이 어긋나면 배지는 있는데 열어 보면 없는 일이
 * 생긴다. 그래서 `unreadCount`와 같은 (createdAt, id) 커서 비교를 쓴다.
 */
export async function countUnreadConversations(prisma: PrismaClient, userId: string) {
  const rows = await prisma.$queryRaw<{ rooms: bigint }[]>(Prisma.sql`
    SELECT COUNT(*) AS rooms
    FROM match_conversation_members member
    JOIN match_conversations conversation
      ON conversation.id = member.conversation_id AND conversation.status <> 'ARCHIVED'
    LEFT JOIN match_chat_messages last_read ON last_read.id = member.last_read_message_id
    WHERE member.user_id = ${userId}::uuid
      AND EXISTS (
        SELECT 1 FROM match_chat_messages message
        WHERE message.conversation_id = conversation.id
          AND message.visibility = 'VISIBLE'
          AND (
            last_read.id IS NULL
            OR (message.created_at, message.id) > (last_read.created_at, last_read.id)
          )
      )
  `);
  return Number(rows[0]?.rooms ?? 0);
}

/** 여러 방의 미읽음 수를 한 번의 질의로 센다. 기준은 `unreadCount`와 같다. */
async function countUnreadByConversation(prisma: PrismaClient, userId: string, conversationIds: string[]) {
  if (conversationIds.length === 0) return new Map<string, number>();
  const rows = await prisma.$queryRaw<{ conversationId: string; unread: bigint }[]>(Prisma.sql`
    SELECT member.conversation_id AS "conversationId", COUNT(message.id) AS unread
    FROM match_conversation_members member
    LEFT JOIN match_chat_messages last_read ON last_read.id = member.last_read_message_id
    LEFT JOIN match_chat_messages message
      ON message.conversation_id = member.conversation_id
     AND message.visibility = 'VISIBLE'
     AND (
       last_read.id IS NULL
       OR (message.created_at, message.id) > (last_read.created_at, last_read.id)
     )
    WHERE member.user_id = ${userId}::uuid
      AND member.conversation_id IN (${Prisma.join(conversationIds.map((id) => Prisma.sql`${id}::uuid`))})
    GROUP BY member.conversation_id
  `);
  return new Map(rows.map((row) => [row.conversationId, Number(row.unread)]));
}

export async function getMyMatchConversations(prisma: PrismaClient, userId: string, role: MatchConversationMemberRole) {
  const memberships = await prisma.matchConversationMember.findMany({
    where: { userId, role, conversation: { status: { not: "ARCHIVED" } } },
    include: {
      conversation: {
        include: {
          match: { select: { id: true, title: true, startsAt: true, endsAt: true, status: true } },
          messages: { where: { visibility: "VISIBLE" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, include: messageInclude },
        },
      },
    },
    orderBy: { conversation: { updatedAt: "desc" } },
  });
  // 방마다 미읽음을 세면 방 수만큼 질의가 나간다. 한 번에 세서 붙인다.
  const unreadByConversation = await countUnreadByConversation(prisma, userId, memberships.map((membership) => membership.conversationId));

  return Promise.all(memberships.map(async (membership) => {
    const lastMessage = membership.conversation.messages[0] ?? null;
    const unreadMessageCount = unreadByConversation.get(membership.conversationId) ?? 0;
    return {
      match: {
        id: membership.conversation.match.id,
        title: membership.conversation.match.title,
        startsAt: membership.conversation.match.startsAt.toISOString(),
        status: membership.conversation.match.status,
      },
      status: shouldBecomeReadOnlyAfterMatch(membership.conversation) ? "READ_ONLY" : membership.conversation.status,
      unreadMessageCount,
      lastMessage: lastMessage ? toMessageView(lastMessage) : null,
    };
  }));
}

function requireInternalReviewer(reviewer: Pick<User, "role">) {
  if (reviewer.role !== "INTERNAL_REVIEWER") throw new DomainError("INTERNAL_REVIEWER_REQUIRED", 403, "내부 심사자만 처리할 수 있어요.");
}

export async function getMatchChatReports(prisma: PrismaClient, reviewer: Pick<User, "role">, status: "OPEN" | "RESOLVED") {
  requireInternalReviewer(reviewer);
  const reports = await prisma.matchChatReport.findMany({
    where: { status },
    orderBy: { createdAt: "asc" },
    include: {
      reporter: { select: { nickname: true } },
      message: { include: { sender: { select: { nickname: true } }, conversation: { include: { match: { select: { id: true, title: true } } } } } },
    },
  });
  return {
    items: reports.map((report) => ({
      id: report.id,
      status: report.status,
      reason: report.reason,
      description: report.description,
      createdAt: report.createdAt.toISOString(),
      reporter: { nickname: report.reporter.nickname },
      message: {
        id: report.message.id,
        body: report.message.body,
        senderNickname: report.message.sender?.nickname ?? null,
      },
      match: { id: report.message.conversation.match.id, title: report.message.conversation.match.title },
    })),
  };
}

export async function moderateMatchChatReport(prisma: PrismaClient, reviewer: Pick<User, "id" | "role">, reportId: string, input: MatchChatModerationActionInput) {
  requireInternalReviewer(reviewer);
  return prisma.$transaction(async (transaction) => {
    const report = await transaction.matchChatReport.findUnique({
      where: { id: reportId },
      include: { message: { include: { conversation: { include: { match: { select: { id: true } } } } } } },
    });
    if (!report) throw new DomainError("CHAT_REPORT_NOT_FOUND", 404, "신고를 찾을 수 없어요.");
    if (report.status !== "OPEN") throw new DomainError("CHAT_REPORT_ALREADY_RESOLVED", 409, "이미 검토한 신고예요.");
    const now = new Date();
    await transaction.matchChatModerationAction.create({ data: { reportId: report.id, reviewerUserId: reviewer.id, action: input.action, reason: input.reason?.trim() || null } });
    if (input.action === "HIDE_MESSAGE") {
      await transaction.matchChatMessage.update({ where: { id: report.messageId }, data: { visibility: "HIDDEN" } });
    }
    if (input.action === "SUSPEND_SENDING") {
      if (!report.message.senderUserId) throw new DomainError("CHAT_MODERATION_TARGET_INVALID", 422, "시스템 메시지는 발신 제한할 수 없어요.");
      await transaction.matchConversationMember.updateMany({ where: { conversationId: report.message.conversationId, userId: report.message.senderUserId }, data: { sendingSuspendedAt: now } });
    }
    if (input.action === "SET_READ_ONLY") {
      await makeConversationReadOnly(transaction, report.message.conversation.match.id, "운영 검토로 이 채팅방은 읽기 전용이에요.", now);
    }
    await transaction.matchChatReport.update({ where: { id: report.id }, data: { status: "RESOLVED", resolvedAt: now } });
    return { id: report.id, status: "RESOLVED" as const };
  });
}

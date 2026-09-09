import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";

export const supportInquiryInputSchema = z.object({
  message: z.string().trim().min(10, "문의 내용을 10자 이상 입력해 주세요.").max(1000, "문의 내용은 1000자 이하로 입력해 주세요."),
  /// 코트 매칭에서 넘어온 문의는 어느 건인지 함께 남긴다(03-2 §3.7).
  matchId: z.string().uuid().nullable().optional(),
});

export type SupportInquiryInput = z.infer<typeof supportInquiryInputSchema>;

const statusLabels: Record<"OPEN" | "ANSWERED", string> = { OPEN: "접수됨", ANSWERED: "답변 완료" };

export async function createSupportInquiry(prisma: PrismaClient, userId: string, input: SupportInquiryInput) {
  // 남의 매칭 번호를 적어 보내도 붙이지 않는다. 내가 주최했거나 신청한 건만 인정한다.
  const matchId = input.matchId
    ? (await prisma.match.findFirst({
      where: { id: input.matchId, OR: [{ hostUserId: userId }, { applications: { some: { applicantUserId: userId } } }] },
      select: { id: true },
    }))?.id ?? null
    : null;
  const inquiry = await prisma.supportInquiry.create({ data: { userId, matchId, message: input.message } });
  return toView(inquiry);
}

export async function listMySupportInquiries(prisma: PrismaClient, userId: string) {
  const items = await prisma.supportInquiry.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { match: { select: { title: true, startsAt: true, courtSlot: { select: { courtUnit: { select: { court: { select: { name: true } } } } } } } } },
  });
  return { items: items.map(toView) };
}

type InquiryMatch = { title: string; startsAt: Date; courtSlot: { courtUnit: { court: { name: string } } } | null } | null;

function toView(inquiry: { id: string; message: string; status: "OPEN" | "ANSWERED"; createdAt: Date; match?: InquiryMatch }) {
  return {
    id: inquiry.id,
    message: inquiry.message,
    status: inquiry.status,
    statusLabel: statusLabels[inquiry.status],
    createdAt: inquiry.createdAt.toISOString(),
    // 코트 매칭이면 코트 이름이 매칭 제목보다 알아보기 쉽다.
    match: inquiry.match
      ? { title: inquiry.match.courtSlot?.courtUnit.court.name ?? inquiry.match.title, startsAt: inquiry.match.startsAt.toISOString() }
      : null,
  };
}

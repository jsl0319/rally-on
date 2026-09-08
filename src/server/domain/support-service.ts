import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";

export const supportInquiryInputSchema = z.object({
  message: z.string().trim().min(10, "문의 내용을 10자 이상 입력해 주세요.").max(1000, "문의 내용은 1000자 이하로 입력해 주세요."),
});

export type SupportInquiryInput = z.infer<typeof supportInquiryInputSchema>;

const statusLabels: Record<"OPEN" | "ANSWERED", string> = { OPEN: "접수됨", ANSWERED: "답변 완료" };

export async function createSupportInquiry(prisma: PrismaClient, userId: string, input: SupportInquiryInput) {
  const inquiry = await prisma.supportInquiry.create({ data: { userId, message: input.message } });
  return toView(inquiry);
}

export async function listMySupportInquiries(prisma: PrismaClient, userId: string) {
  const items = await prisma.supportInquiry.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return { items: items.map(toView) };
}

function toView(inquiry: { id: string; message: string; status: "OPEN" | "ANSWERED"; createdAt: Date }) {
  return {
    id: inquiry.id,
    message: inquiry.message,
    status: inquiry.status,
    statusLabel: statusLabels[inquiry.status],
    createdAt: inquiry.createdAt.toISOString(),
  };
}

import { z } from "zod";

export type NotificationType = "APPLICATION_RECEIVED" | "APPLICATION_ACCEPTED" | "APPLICATION_REJECTED";

/**
 * In-app notification copy. Keep beginner-friendly, no numbers or jargon,
 * consistent with the rest of the product's tone (see AGENTS.md 5.1).
 */
export function buildNotificationContent(type: NotificationType, matchTitle: string): { title: string; body: string } {
  switch (type) {
    case "APPLICATION_RECEIVED":
      return { title: "새 신청이 도착했어요", body: `${matchTitle}에 함께 치고 싶다는 신청이 왔어요.` };
    case "APPLICATION_ACCEPTED":
      return { title: "신청이 수락됐어요", body: `${matchTitle} 모집자가 신청을 수락했어요. 채팅에서 일정을 확인해요.` };
    case "APPLICATION_REJECTED":
      return { title: "신청 결과를 확인해요", body: `${matchTitle} 신청이 이번엔 받아들여지지 않았어요.` };
  }
}

export const notificationReadInputSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100).optional(),
});

export type NotificationReadInput = z.infer<typeof notificationReadInputSchema>;

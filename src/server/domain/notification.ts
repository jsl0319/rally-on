import { z } from "zod";

export type NotificationType =
  | "APPLICATION_RECEIVED"
  | "APPLICATION_ACCEPTED"
  | "APPLICATION_REJECTED"
  | "COURT_MATCH_DEPOSIT_REQUIRED"
  | "COURT_MATCH_DEPOSIT_CLAIMED"
  | "COURT_MATCH_CONFIRMED"
  | "COURT_MATCH_DEPOSIT_EXPIRED"
  | "COURT_MATCH_CANCELLED"
  | "COURT_MATCH_PARTICIPANT_CANCELLED"
  | "COURT_MATCH_REFUND_COMPLETED"
  | "MATCH_CANCELLED"
  | "MATCH_CLOSED"
  | "MATCH_EXPIRED"
  | "MATCH_PARTICIPANT_LEFT";

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
    case "COURT_MATCH_DEPOSIT_REQUIRED":
      return { title: "자리가 잡혔어요", body: `${matchTitle} 참가비를 기한 안에 보내면 참가가 확정돼요.` };
    case "COURT_MATCH_DEPOSIT_CLAIMED":
      return { title: "입금 확인이 필요해요", body: `${matchTitle}에 참가비를 보냈다는 알림이 왔어요.` };
    case "COURT_MATCH_CONFIRMED":
      return { title: "참가가 확정됐어요", body: `${matchTitle} 참가비가 확인됐어요. 당일에 만나요.` };
    case "COURT_MATCH_DEPOSIT_EXPIRED":
      return { title: "자리가 풀렸어요", body: `${matchTitle} 참가비 기한이 지나 신청이 취소됐어요.` };
    case "COURT_MATCH_CANCELLED":
      return { title: "코트 매칭이 취소됐어요", body: `${matchTitle}에 인원이 모이지 않아 취소됐어요.` };
    case "COURT_MATCH_PARTICIPANT_CANCELLED":
      return { title: "참가자가 취소했어요", body: `${matchTitle} 참가자 한 명이 참가를 취소했어요. 환불 대상인지 확인해 주세요.` };
    case "COURT_MATCH_REFUND_COMPLETED":
      return { title: "환불 완료로 표시됐어요", body: `${matchTitle} 운영자가 환불했다고 표시했어요. 통장에서 확인해 주세요.` };
    case "MATCH_CANCELLED":
      return { title: "매칭이 취소됐어요", body: `${matchTitle} 모집자가 매칭을 취소했어요. 그날 일정은 비워 두셔도 돼요.` };
    case "MATCH_CLOSED":
      return { title: "모집이 마감됐어요", body: `${matchTitle} 모집이 마감돼 기다리던 신청이 정리됐어요.` };
    case "MATCH_EXPIRED":
      return { title: "시작 시각이 지났어요", body: `${matchTitle} 시작 시각이 지나 기다리던 신청이 정리됐어요.` };
    case "MATCH_PARTICIPANT_LEFT":
      return { title: "참가자가 취소했어요", body: `${matchTitle} 참가자 한 명이 취소해 자리가 다시 비었어요.` };
  }
}

export const notificationReadInputSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100).optional(),
});

export type NotificationReadInput = z.infer<typeof notificationReadInputSchema>;

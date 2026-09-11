import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { countUnreadConversations } from "@/server/domain/match-chat-service";
import { countUnreadNotifications } from "@/server/domain/notification-service";
import { handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";

/**
 * 하단 메뉴 배지용 최소 응답. 화면마다 알림 목록과 대화 목록을 통째로 불러오지 않고
 * 이 두 숫자만 가져간다.
 */
export async function GET() {
  try {
    const user = await getRateLimitedCurrentUser();
    const prisma = getPrisma();
    const [notifications, chats] = await Promise.all([
      countUnreadNotifications(prisma, user.id),
      countUnreadConversations(prisma, user.id),
    ]);
    return Response.json({ notifications, chats }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleApiError(error);
  }
}

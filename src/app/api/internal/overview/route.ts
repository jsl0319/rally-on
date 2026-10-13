import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { requireServiceAdmin } from "@/server/domain/announcement-service";
import { handleApiError } from "@/server/http/api-response";
export const runtime = "nodejs";
export async function GET() {
  try {
    const user = await getRateLimitedCurrentUser(); const db = getPrisma(); await requireServiceAdmin(db, user);
    const [needsReply, waitingOperator, drafts] = await Promise.all([
      db.supportInquiry.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      db.supportInquiry.count({ where: { status: "WAITING_OPERATOR" } }),
      db.announcement.count({ where: { status: "DRAFT" } }),
    ]);
    return Response.json({ needsReply, waitingOperator, drafts });
  } catch (error) { return handleApiError(error); }
}

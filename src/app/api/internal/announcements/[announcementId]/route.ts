import { z } from "zod";
import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { announcementUpdateSchema, getAdminAnnouncement, updateAnnouncement } from "@/server/domain/announcement-service";
import { handleApiError } from "@/server/http/api-response";
export const runtime = "nodejs";
type Context = { params: Promise<{ announcementId: string }> };
export async function GET(_request: Request, context: Context) {
  try { const user = await getRateLimitedCurrentUser(); const id = z.uuid().parse((await context.params).announcementId); return Response.json(await getAdminAnnouncement(getPrisma(), user, id)); }
  catch (error) { return handleApiError(error); }
}
export async function PATCH(request: Request, context: Context) {
  try { const user = await getRateLimitedCurrentUser(); const id = z.uuid().parse((await context.params).announcementId); return Response.json(await updateAnnouncement(getPrisma(), user, id, announcementUpdateSchema.parse(await request.json()))); }
  catch (error) { return handleApiError(error); }
}

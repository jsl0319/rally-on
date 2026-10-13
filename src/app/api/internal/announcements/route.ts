import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { announcementCreateSchema, announcementListSchema, createAnnouncement, listAdminAnnouncements } from "@/server/domain/announcement-service";
import { handleApiError } from "@/server/http/api-response";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { const user = await getRateLimitedCurrentUser(); return Response.json(await listAdminAnnouncements(getPrisma(), user, announcementListSchema.parse(Object.fromEntries(new URL(request.url).searchParams)))); }
  catch (error) { return handleApiError(error); }
}
export async function POST(request: Request) {
  try { const user = await getRateLimitedCurrentUser(); return Response.json(await createAnnouncement(getPrisma(), user, announcementCreateSchema.parse(await request.json())), { status: 201 }); }
  catch (error) { return handleApiError(error); }
}

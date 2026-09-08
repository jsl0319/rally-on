import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { withdrawAccount } from "@/server/domain/account-service";
import { handleApiError } from "@/server/http/api-response";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await getRateLimitedCurrentUser();
    return Response.json(await withdrawAccount(getPrisma(), user));
  } catch (error) {
    return handleApiError(error);
  }
}

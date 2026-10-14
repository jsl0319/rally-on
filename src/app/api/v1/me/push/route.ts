import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { getRateLimitedCurrentUser } from "@/server/auth/current-user";
import { getPrisma } from "@/server/db/prisma";
import { handleApiError, apiError } from "@/server/http/api-response";
import { currentDeviceHash, DEVICE_COOKIE, hashDevice } from "@/server/push/device";
import { pushConfig, subscriptionInput } from "@/server/push/policy";
import { schedulePushDispatch } from "@/server/push/schedule";

export const runtime = "nodejs";
const json = (body: unknown) => Response.json(body, { headers: { "Cache-Control": "no-store" } });
const actionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("subscribe"), subscription: subscriptionInput }).strict(),
  z.object({ action: z.literal("refresh"), subscriptionId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("unsubscribe") }).strict(),
  z.object({ action: z.literal("test") }).strict(),
]);
export async function GET() {
  const config = pushConfig();
  if (!config) return json({ enabled: false, subscriptionId: null });
  try {
    const user = await getRateLimitedCurrentUser();
    let deviceHash = await currentDeviceHash();
    if (!deviceHash) {
      const token = randomBytes(32).toString("hex");
      (await cookies()).set(DEVICE_COOKIE, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
      deviceHash = hashDevice(token);
    }
    const prisma = getPrisma();
    await prisma.pushSubscription.deleteMany({ where: { deviceHash, OR: [{ userId: { not: user.id } }, { expiresAt: { lte: new Date() } }] } });
    const subscription = await prisma.pushSubscription.findUnique({ where: { deviceHash }, select: { id: true } });
    return json({ enabled: true, publicKey: config.publicKey, subscriptionId: subscription?.id ?? null });
  } catch (error) { return handleApiError(error); }
}
export async function POST(request: Request) {
  const expectedOrigin = new URL(process.env.APP_BASE_URL || request.url).origin;
  if (request.headers.get("origin") !== expectedOrigin) return apiError(403, "INVALID_ORIGIN", "같은 서비스 화면에서 다시 시도해 주세요.");
  try {
    const user = await getRateLimitedCurrentUser();
    const deviceHash = await currentDeviceHash();
    if (!deviceHash) return apiError(409, "DEVICE_MISSING", "화면을 새로 열고 다시 시도해 주세요.");
    if (Number(request.headers.get("content-length")) > 5000) return apiError(413, "TOO_LARGE", "요청이 너무 커요.");
    const raw = await request.text();
    if (raw.length > 5000) return apiError(413, "TOO_LARGE", "요청이 너무 커요.");
    const input = actionInput.parse(JSON.parse(raw));
    const prisma = getPrisma();
    if (input.action === "unsubscribe") {
      await prisma.pushSubscription.deleteMany({ where: { deviceHash, userId: user.id } });
      return json({ subscriptionId: null });
    }
    if (!pushConfig()) return apiError(503, "PUSH_DISABLED", "외부 알림을 준비하고 있어요.");
    if (input.action === "refresh") {
      const refreshed = await prisma.pushSubscription.updateMany({ where: { id: input.subscriptionId, deviceHash, userId: user.id, expiresAt: { gt: new Date() } }, data: { expiresAt: new Date(Date.now() + 30 * 86_400_000) } });
      if (!refreshed.count) return apiError(409, "SUBSCRIPTION_GONE", "알림 연결이 해제됐어요. 다시 켜 주세요.");
      return json({ subscriptionId: input.subscriptionId });
    }
    if (input.action === "test") {
      const sent = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
        const subscription = await tx.pushSubscription.findFirst({ where: { deviceHash, userId: user.id, expiresAt: { gt: new Date() } } });
        if (!subscription) return false;
        const recent = await tx.notification.count({ where: { userId: user.id, type: "PUSH_TEST", createdAt: { gt: new Date(Date.now() - 60_000) } } });
        if (recent) return false;
        await tx.notification.create({ data: { userId: user.id, type: "PUSH_TEST", title: "테스트 알림을 요청했어요", body: "외부 알림이 도착했는지 확인해 주세요.", href: "/my/notifications" } });
        return true;
      });
      if (!sent) return apiError(429, "TEST_UNAVAILABLE", "알림을 켠 뒤 시도해 주세요. 테스트는 1분에 한 번 가능해요.");
      schedulePushDispatch();
      return json({ requested: true });
    }
    const { endpoint, keys } = input.subscription;
    const subscription = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
      const current = await tx.user.findUnique({ where: { id: user.id }, select: { status: true } });
      if (current?.status !== "ACTIVE") return null;
      const sameEndpoint = await tx.pushSubscription.findUnique({ where: { endpoint } });
      if (sameEndpoint && sameEndpoint.deviceHash !== deviceHash) return null;
      const old = await tx.pushSubscription.findUnique({ where: { deviceHash } });
      const expiresAt = new Date(Date.now() + 30 * 86_400_000);
      if (old && old.userId === user.id && old.endpoint === endpoint && old.p256dh === keys.p256dh && old.authKey === keys.auth) {
        return tx.pushSubscription.update({ where: { id: old.id }, data: { expiresAt }, select: { id: true } });
      }
      if (old) await tx.pushSubscription.delete({ where: { id: old.id } });
      if (await tx.pushSubscription.count({ where: { userId: user.id } }) >= 10) return null;
      return tx.pushSubscription.create({ data: { userId: user.id, deviceHash, endpoint, p256dh: keys.p256dh, authKey: keys.auth, expiresAt }, select: { id: true } });
    });
    if (!subscription) return apiError(409, "SUBSCRIPTION_CONFLICT", "기존 알림 연결을 끄고 다시 켜 주세요. 최대 10개 기기를 연결할 수 있어요.");
    return json({ subscriptionId: subscription.id });
  } catch (error) {
    if (error instanceof SyntaxError) return apiError(400, "INVALID_REQUEST_BODY", "요청 내용을 읽지 못했어요.");
    // Avoid echoing Prisma key conflicts (endpoint capability URLs) to logs.
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return apiError(409, "SUBSCRIPTION_CONFLICT", "알림 연결이 바뀌었어요. 다시 시도해 주세요.");
    return handleApiError(error);
  }
}

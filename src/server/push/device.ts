import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { getPrisma } from "@/server/db/prisma";

export const DEVICE_COOKIE = "rally-push-device";
export function hashDevice(value: string) { return createHash("sha256").update(value).digest("hex"); }
export async function currentDeviceHash() {
  const value = (await cookies()).get(DEVICE_COOKIE)?.value;
  return value && /^[a-f0-9]{64}$/.test(value) ? hashDevice(value) : null;
}
export async function detachPushDevice(userId?: string) {
  const deviceHash = await currentDeviceHash();
  if (deviceHash) await getPrisma().pushSubscription.deleteMany({ where: { deviceHash, ...(userId ? { userId } : {}) } });
}

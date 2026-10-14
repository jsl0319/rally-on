import { getSafeReturnTo } from "@/navigation/return-to";
import { z } from "zod";

// Never send to a user-controlled arbitrary host (SSRF). Browser push services only.
export function isPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash
      && (url.hostname === "fcm.googleapis.com" || url.hostname === "updates.push.services.mozilla.com"
        || url.hostname === "web.push.apple.com" || url.hostname.endsWith(".push.apple.com"));
  } catch { return false; }
}
export const subscriptionInput = z.object({
  endpoint: z.string().max(2048).refine(isPushEndpoint),
  keys: z.object({
    p256dh: z.string().regex(/^B[A-Za-z0-9_-]{86}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  }).strict(),
}).strict();
export function safeNotificationHref(href: string | null) {
  const safe = getSafeReturnTo(href, "/my/notifications");
  const path = new URL(safe, "https://rally.invalid").pathname;
  return /^\/(matches|partner-sessions|activity|my|partner|internal|support|account|chat)(\/|$)/.test(path)
    ? safe : "/my/notifications";
}
export function pushPayload(notificationId: string, subscriptionId: string) {
  return { version: 1, notificationId, subscriptionId, title: "랠리온", body: "새 알림이 있어요. 앱에서 확인해 주세요.", href: `/my/notifications/open/${notificationId}` };
}
export function pushConfig() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_SUBJECT;
  return process.env.WEB_PUSH_ENABLED === "true" && publicKey && privateKey && subject?.startsWith("mailto:")
    ? { publicKey, privateKey, subject } : null;
}

export type PushStatus = { enabled: boolean; publicKey?: string; subscriptionId: string | null };
export function pushEnvironment(): "native" | "install" | "unsupported" | "supported" {
  const native = window as Window & { Capacitor?: { isNativePlatform?: () => boolean }; };
  if (native.Capacitor?.isNativePlatform?.() || /RallyOnNativePrototype/.test(navigator.userAgent)) return "native";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios && !window.matchMedia("(display-mode: standalone)").matches && !(navigator as Navigator & { standalone?: boolean }).standalone) return "install";
  return window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window ? "supported" : "unsupported";
}
let bindingRevision = 0;
let syncInFlight: Promise<PushStatus> | null = null;

export async function setPushBinding(id: string | null) {
  bindingRevision++;
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration?.active || !registration.active.scriptURL.endsWith("/push-sw.js")) return;
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error("알림 연결을 확인하지 못했어요. 다시 시도해 주세요.")); }, 4000);
    channel.port1.onmessage = () => { clearTimeout(timer); channel.port1.close(); resolve(); };
    registration.active!.postMessage({ type: "RALLY_PUSH_BINDING", id }, [channel.port2]);
  });
}
export async function pushAction(input: unknown): Promise<PushStatus> {
  const response = await fetch("/api/v1/me/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || "알림 설정을 저장하지 못했어요.");
  return body;
}
export async function getPushStatus(): Promise<PushStatus> {
  const response = await fetch("/api/v1/me/push", { cache: "no-store" });
  if (response.status === 401 || response.status === 403) {
    await setPushBinding(null);
    return { enabled: false, subscriptionId: null };
  }
  if (!response.ok) throw new Error("알림 설정을 확인하지 못했어요.");
  return response.json();
}
async function synchronizePush(): Promise<PushStatus> {
  const revision = bindingRevision;
  const status = await getPushStatus();
  if (revision !== bindingRevision) return { ...status, subscriptionId: null };
  if (!status.enabled || !status.subscriptionId) { await setPushBinding(null); return status; }
  if (!("Notification" in window) || Notification.permission !== "granted") {
    await setPushBinding(null);
    await pushAction({ action: "unsubscribe" });
    return { ...status, subscriptionId: null };
  }
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) {
    await pushAction({ action: "unsubscribe" });
    await setPushBinding(null);
    return { ...status, subscriptionId: null };
  }
  const updated = await pushAction({ action: "refresh", subscriptionId: status.subscriptionId });
  if (revision !== bindingRevision) return { ...status, subscriptionId: null };
  await setPushBinding(updated.subscriptionId);
  return { ...status, subscriptionId: updated.subscriptionId };
}
export function syncPush(): Promise<PushStatus> {
  return syncInFlight ??= synchronizePush().finally(() => { syncInFlight = null; });
}
export async function disablePush() {
  await setPushBinding(null);
  await pushAction({ action: "unsubscribe" });
  const registration = await navigator.serviceWorker.getRegistration("/");
  await (await registration?.pushManager.getSubscription())?.unsubscribe();
}
export async function enablePush(publicKey: string) {
  // Called directly from a click: permission prompt must retain user activation on iOS.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("알림이 허용되지 않았어요. 기기·브라우저 설정에서 변경할 수 있어요.");
  await navigator.serviceWorker.register("/push-sw.js", { scope: "/", updateViaCache: "none" });
  const registration = await navigator.serviceWorker.ready;
  const key = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  let subscription = await registration.pushManager.getSubscription();
  if (subscription) await subscription.unsubscribe();
  subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  try {
    const status = await pushAction({ action: "subscribe", subscription: { endpoint: subscription.endpoint, keys: subscription.toJSON().keys } });
    await setPushBinding(status.subscriptionId);
    return status.subscriptionId;
  } catch (error) { await subscription.unsubscribe(); throw error; }
}

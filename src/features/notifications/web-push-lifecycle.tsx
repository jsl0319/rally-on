"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getClientEnvironment } from "@/lib/client-environment";
import { setPushBinding, syncPush } from "./web-push-client";

// Only already registered browsers are checked here; never prompt permission on app launch.
export function WebPushLifecycle() {
  const pathname = usePathname();
  useEffect(() => {
    let cancelled = false;
    async function sync() {
      if (getClientEnvironment().runtime === "native" || !("serviceWorker" in navigator)) return;
      const registration = await navigator.serviceWorker.getRegistration("/");
      if (!registration || cancelled) return;
      try {
        if (pathname === "/login") await setPushBinding(null);
        else await syncPush();
      } catch { /* Existing in-app notification UI remains usable when offline. */ }
    }
    void sync();
    window.addEventListener("focus", sync);
    return () => { cancelled = true; window.removeEventListener("focus", sync); };
  }, [pathname]);
  return null;
}

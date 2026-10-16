"use client";

import { useEffect } from "react";
import type { NotificationCounts } from "@/notifications/activity";
import { publishNotificationCounts } from "@/notifications/changed";

/** The server captures IDs before reading the list, so newly arriving news stays unread. */
export function useActivityReadReceipt(ids: string[] | undefined) {
  useEffect(() => {
    if (!ids?.length) return;
    const mark = async () => {
      try {
        for (let start = 0; start < ids.length; start += 100) {
          const response = await fetch("/api/v1/me/notifications/read", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: ids.slice(start, start + 100) }),
          });
          if (!response.ok) return;
          publishNotificationCounts(await response.json() as NotificationCounts);
        }
      } catch { /* Keep the badge on failure. A later successful list visit retries. */ }
    };
    // Run only after the list has committed; prefetched or failed lists never acknowledge news.
    const timer = window.setTimeout(() => { void mark(); }, 0);
    return () => window.clearTimeout(timer);
  }, [ids]);
}

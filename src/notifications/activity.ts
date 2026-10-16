export type ActivityScope = "received" | "sent";
export type NotificationCounts = { unreadCount: number; activityUnreadCounts: Record<ActivityScope, number> };

const sentTypes = new Set([
  "APPLICATION_ACCEPTED", "APPLICATION_REJECTED", "MATCH_CANCELLED", "MATCH_CLOSED", "MATCH_EXPIRED",
  "COURT_MATCH_DEPOSIT_REQUIRED", "COURT_MATCH_CONFIRMED", "COURT_MATCH_DEPOSIT_EXPIRED",
  "COURT_MATCH_CANCELLED", "COURT_MATCH_REFUND_COMPLETED",
]);

/** Only news represented by the activity lists. Payment disputes/details still require opening their notification. */
export function activityScope(notification: { type: string; href: string | null }): ActivityScope | null {
  const path = notification.href?.split(/[?#]/)[0] ?? "";
  if (["APPLICATION_RECEIVED", "MATCH_PARTICIPANT_LEFT"].includes(notification.type) &&
    /^\/(activity\/received|partner\/court-matches)\/[a-f0-9-]+$/.test(path)) return "received";
  if (sentTypes.has(notification.type) &&
    (path === "/activity/sent" || /^\/(partner-sessions|matches)\/[a-f0-9-]+$/.test(path))) return "sent";
  return null;
}

export function activityUnreadCounts(items: Array<{ type: string; href: string | null }>) {
  const counts = { received: 0, sent: 0 };
  for (const item of items) { const scope = activityScope(item); if (scope) counts[scope]++; }
  return counts;
}

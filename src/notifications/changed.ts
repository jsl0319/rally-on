import type { NotificationCounts } from "./activity";

export const notificationsChangedEvent = "rally:notifications-changed";

/** Share counts only, not notification text or account details. */
export function publishNotificationCounts(counts: NotificationCounts) {
  window.dispatchEvent(new CustomEvent<NotificationCounts>(notificationsChangedEvent, {
    detail: { unreadCount: counts.unreadCount, activityUnreadCounts: counts.activityUnreadCounts },
  }));
}

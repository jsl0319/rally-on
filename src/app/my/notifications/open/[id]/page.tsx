import { z } from "zod";
import { getCurrentUser } from "@/server/auth/current-user";
import { notFound, redirect } from "next/navigation";
import { requireActivePage } from "@/server/auth/require-onboarded-page";
import { getPrisma } from "@/server/db/prisma";
import { safeNotificationHref } from "@/server/push/policy";

export default async function OpenNotification({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  await requireActivePage(`/my/notifications/open/${id}`);
  const user = await getCurrentUser();
  const notification = await getPrisma().notification.findFirst({ where: { id, userId: user.id } });
  if (!notification) redirect("/my/notifications");
  await getPrisma().notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
  redirect(safeNotificationHref(notification.href));
}

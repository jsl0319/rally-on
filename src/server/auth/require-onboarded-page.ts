import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getOnboardingPath, getLoginPath } from "@/navigation/return-to";
import { getPrisma } from "@/server/db/prisma";

/**
 * Keeps protected page entry points aligned with the API authorization rules.
 * APIs remain the final authority; this only prevents a visitor from seeing a
 * misleading retry state before being sent through login and onboarding.
 */
export async function requireOnboardedPage(returnTo: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) redirect(getLoginPath(returnTo));

  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: { onboardingCompletedAt: true, status: true },
  });

  if (user && user.status !== "ACTIVE") redirect("/account/transactions");
  if (!user?.onboardingCompletedAt) redirect(getOnboardingPath(returnTo));
}

/** Operator registration is available before the tennis-profile onboarding. */
export async function requireActivePage(returnTo: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) redirect(getLoginPath(returnTo));

  const user = await getPrisma().user.findUnique({ where: { id: userId }, select: { status: true } });
  if (!user) redirect(getLoginPath(returnTo));
  if (user.status !== "ACTIVE") redirect("/account/transactions");
}

/**
 * Operator pages other than the registration entry point. Access itself is still decided by
 * the operator APIs, which scope every read and write to the caller's own application; this
 * only keeps a visitor who never applied from landing on a dashboard that can do nothing but
 * show a load error.
 */
export async function requireOperatorPage(returnTo: string) {
  await requireActivePage(returnTo);

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect(getLoginPath(returnTo));

  const application = await getPrisma().courtOperatorApplication.findFirst({
    where: { applicantUserId: userId },
    select: { id: true },
  });
  if (!application) redirect("/partner/apply");
}

/** Internal review pages use a role stored in the database, never a client-supplied flag. */
export async function requireInternalReviewerPage(returnTo: string) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) redirect(getLoginPath(returnTo));

  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: { status: true, role: true },
  });
  if (!user) redirect(getLoginPath(returnTo));
  if (user.status !== "ACTIVE") redirect("/account/transactions");
  if (user.role !== "INTERNAL_REVIEWER") redirect("/");
}

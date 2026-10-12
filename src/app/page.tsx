import { Suspense } from "react";
import { HomeLoading } from "@/features/matches/home-loading";
import { auth } from "@/auth";
import { getPrisma } from "@/server/db/prisma";
import { redirect } from "next/navigation";
import { RallyOnHome } from "@/features/matches/m3-home";
import { getSafeReturnTo } from "@/navigation/return-to";

async function HomeContent({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const session = await auth();
  const user = session?.user?.id
    ? await getPrisma().user.findUnique({
      where: { id: session.user.id },
      select: { id: true, status: true, onboardingCompletedAt: true },
    })
    : null;
  if (user && user.status !== "ACTIVE") redirect("/account/transactions");
  const initialScreen = !user ? "entry" : user.onboardingCompletedAt ? "home" : "onboarding";
  const { returnTo } = await searchParams;
  return <RallyOnHome key={`${user?.id ?? "guest"}:${initialScreen}`} initialScreen={initialScreen} returnTo={getSafeReturnTo(typeof returnTo === "string" ? returnTo : null)} />;
}

export default function Home(props: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  return <Suspense fallback={<HomeLoading />}><HomeContent {...props} /></Suspense>;
}

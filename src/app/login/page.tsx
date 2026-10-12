import { Suspense } from "react";
import { BrandLaunch } from "@/components/feedback/brand-launch";
import { auth } from "@/auth";
import { getPrisma } from "@/server/db/prisma";
import { redirect } from "next/navigation";
import { LoginPage } from "@/features/profile/login-page";
import { getSafeReturnTo } from "@/navigation/return-to";

async function LoginContent({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const session = await auth();
  if (session?.user?.id) {
    const user = await getPrisma().user.findUnique({ where: { id: session.user.id }, select: { status: true } });
    if (user && user.status !== "ACTIVE") redirect("/account/transactions");
  }
  const { returnTo } = await searchParams;
  return <LoginPage returnTo={getSafeReturnTo(typeof returnTo === "string" ? returnTo : null)} />;
}

export default function Login(props: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  return <Suspense fallback={<BrandLaunch />}><LoginContent {...props} /></Suspense>;
}

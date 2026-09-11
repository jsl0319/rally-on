import { auth } from "@/auth";
import { getPrisma } from "@/server/db/prisma";
import { redirect } from "next/navigation";
import { RallyOnHome } from "@/features/matches/m3-home";
import { getSafeReturnTo } from "@/navigation/return-to";

export default async function Home({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const session = await auth();
  if (session?.user?.id) {
    const user = await getPrisma().user.findUnique({ where: { id: session.user.id }, select: { status: true } });
    if (user && user.status !== "ACTIVE") redirect("/account/transactions");
  }
  const { returnTo } = await searchParams;
  return <RallyOnHome returnTo={getSafeReturnTo(typeof returnTo === "string" ? returnTo : null)} />;
}

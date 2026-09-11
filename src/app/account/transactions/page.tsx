import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AccountTransactions } from "@/features/profile/account-transactions";
export default async function TransactionsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?returnTo=%2Faccount%2Ftransactions");
  return <AccountTransactions />;
}

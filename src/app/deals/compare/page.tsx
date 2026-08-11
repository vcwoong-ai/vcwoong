import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AppLayout } from "@/components/layout/app-layout";
import { DealsCompareClient } from "./deals-compare-client";

export default async function DealsComparePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  return (
    <AppLayout title="딜 비교">
      <DealsCompareClient />
    </AppLayout>
  );
}

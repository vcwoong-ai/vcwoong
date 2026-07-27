import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { SourcingPageClient } from "./sourcing-page-client";

export default async function SourcingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const leads = await prisma.inboundDeal.findMany({
    where: { userId: session.user.id },
    orderBy: [{ createdAt: "desc" }],
  });

  return (
    <AppLayout title="딜소싱">
      <SourcingPageClient leads={JSON.parse(JSON.stringify(leads))} />
    </AppLayout>
  );
}

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { DealsPageClient } from "./deals-page-client";

export default async function DealsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const deals = await prisma.deal.findMany({
    where: { userId: session.user.id },
    include: {
      documents: { select: { id: true } },
      reports: {
        select: { id: true, status: true },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <AppLayout title="딜 관리">
      <DealsPageClient deals={JSON.parse(JSON.stringify(deals))} />
    </AppLayout>
  );
}

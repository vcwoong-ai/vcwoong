import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessScope, ownedOrShared } from "@/lib/team";
import { isAIConfigured } from "@/lib/claude";
import { AppLayout } from "@/components/layout/app-layout";
import { DealDetailClient } from "./deal-detail-client";

export default async function DealDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const scope = await getAccessScope(session.user.id);

  const deal = await prisma.deal.findFirst({
    where: { id: params.id, ...ownedOrShared(scope) },
    include: {
      documents: true,
      reports: {
        include: { sections: { orderBy: { order: "asc" } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!deal) notFound();

  return (
    <AppLayout title={deal.companyName}>
      <Suspense fallback={<div className="p-8 text-center text-gray-400">로딩 중...</div>}>
        <DealDetailClient
          deal={JSON.parse(JSON.stringify(deal))}
          demoMode={!isAIConfigured()}
          currentUserId={session.user.id}
          hasTeam={scope.teamId !== null}
        />
      </Suspense>
    </AppLayout>
  );
}

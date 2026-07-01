import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

  const deal = await prisma.deal.findFirst({
    where: { id: params.id, userId: session.user.id },
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
        />
      </Suspense>
    </AppLayout>
  );
}

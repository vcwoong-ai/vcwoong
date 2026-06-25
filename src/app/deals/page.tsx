import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { DealCard } from "@/components/deals/deal-card";
import { CreateDealDialog } from "@/components/deals/create-deal-dialog";
import { Briefcase } from "lucide-react";

export default async function DealsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const deals = await prisma.deal.findMany({
    where: { userId: session.user.id },
    include: {
      documents: { select: { id: true } },
      reports: { select: { id: true, status: true }, orderBy: { createdAt: "desc" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <AppLayout title="딜 관리">
      <div className="max-w-5xl space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">{deals.length}개 딜</p>
          <CreateDealDialog />
        </div>

        {deals.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl py-16 text-center">
            <Briefcase className="w-10 h-10 mx-auto text-gray-200 mb-3" />
            <p className="text-sm font-medium text-gray-600">등록된 딜이 없습니다</p>
            <p className="text-xs text-gray-400 mt-1">새 딜을 등록하여 투자심의 보고서를 자동으로 생성하세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {deals.map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { DealCard } from "@/components/deals/deal-card";
import { CreateDealDialog } from "@/components/deals/create-deal-dialog";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

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
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="딜 또는 기업명 검색..."
              className="pl-9"
            />
          </div>
          <CreateDealDialog />
        </div>

        {deals.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-6xl mb-4">📋</div>
            <p className="text-lg font-medium text-gray-600">
              등록된 딜이 없습니다
            </p>
            <p className="text-sm mt-1">새 딜을 등록하여 투자심의 보고서를 자동으로 생성해보세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {deals.map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

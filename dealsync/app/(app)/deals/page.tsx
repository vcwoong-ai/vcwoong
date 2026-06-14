import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import TopBar from "@/components/layout/TopBar";
import DealsClient from "./DealsClient";

export default async function DealsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const deals = await prisma.deal.findMany({
    where: { userId: session.user.id },
    include: {
      _count: { select: { documents: true, reports: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col h-full">
      <TopBar
        title="딜 관리"
        subtitle="진행 중인 투자 검토 딜을 관리합니다"
        action={{ label: "새 딜 추가", href: "/deals/new" }}
      />
      <div className="flex-1 overflow-auto p-6">
        <DealsClient deals={JSON.parse(JSON.stringify(deals))} />
      </div>
    </div>
  );
}

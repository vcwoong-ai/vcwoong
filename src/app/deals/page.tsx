import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { DealsPageClient } from "./deals-page-client";
import { getUserTeamContext, dealReadWhere } from "@/lib/team-access";
import { DEALS_PAGE_SIZE } from "@/lib/list-paging";

export default async function DealsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const where = dealReadWhere(session.user.id, teamId);

  // 예전엔 상한 없이 전부 조회해서, 딜이 쌓일수록 쿼리와 HTML 페이로드가
  // 선형으로 무거워졌다(연관 documents·reports까지 함께). 첫 화면은
  // DEALS_PAGE_SIZE개만 불러오고, 나머지는 클라이언트에서 "더 보기"로
  // /api/deals(이미 페이지네이션을 지원하지만 아무도 안 쓰던 라우트)를
  // 통해 이어 받는다.
  const [deals, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      include: {
        documents: { select: { id: true } },
        reports: {
          select: { id: true, status: true },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: DEALS_PAGE_SIZE,
    }),
    prisma.deal.count({ where }),
  ]);

  return (
    <AppLayout title="딜 관리">
      <DealsPageClient
        deals={JSON.parse(JSON.stringify(deals))}
        total={total}
        pageSize={DEALS_PAGE_SIZE}
        currentUserId={session.user.id}
        currentTeamId={teamId}
        role={role}
      />
    </AppLayout>
  );
}

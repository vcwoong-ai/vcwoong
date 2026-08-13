import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildAlerts } from "@/lib/portfolio";
import { getUserTeamContext, portfolioReadWhere } from "@/lib/team-access";

/**
 * 헤더 알림 벨이 읽어가는 알림 목록.
 *
 * 별도 Notification 테이블을 두지 않고 포트폴리오 상태에서 그때그때 계산한다
 * (마일스톤 지연·런웨이 부족·모니터링 노트 미작성). 읽음 처리 같은 상태가
 * 없어도 되는 종류라 저장할 이유가 없고, 항상 현재 상태와 일치한다는 게
 * 오히려 장점이다.
 *
 * 포트폴리오는 플랜 게이트가 걸린 기능이지만 여기서는 막지 않는다 — 권한이
 * 없으면 애초에 조회되는 회사가 없어 알림도 0건이 되므로, 402를 띄워
 * 헤더에 에러를 내는 것보다 조용히 비는 편이 낫다.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { teamId } = await getUserTeamContext(session.user.id);

  const companies = await prisma.portfolioCompany.findMany({
    where: portfolioReadWhere(session.user.id, teamId),
    select: {
      id: true,
      companyName: true,
      status: true,
      milestones: { select: { title: true, dueDate: true, status: true } },
      kpis: { select: { metric: true, value: true, unit: true, period: true } },
      updates: { select: { period: true } },
    },
  });

  const alerts = buildAlerts(companies);

  return NextResponse.json({
    data: {
      // 벨 옆 배지가 세 자리 숫자가 되면 보기 흉해서 목록만 자른다.
      // 개수는 전체를 그대로 준다(99+ 표기는 화면에서 처리).
      alerts: alerts.slice(0, 20),
      total: alerts.length,
      highCount: alerts.filter((a) => a.severity === "high").length,
    },
  });
}

import { FirstDealGuide } from "@/components/onboarding/first-deal-guide";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Clock,
  ArrowRight,
  Cpu,
  AlertTriangle,
  Plus,
} from "lucide-react";
import Link from "next/link";
import styles from "@/components/ui/investment-workspace.module.css";
import { DealStage, ReportStatus, DealSector } from "@prisma/client";
import { STAGE_LABEL } from "@/lib/deal-labels";
import { DashboardCharts } from "./dashboard-charts";
import { DashboardQuickActions } from "@/components/dashboard/quick-actions";
import {
  DashboardReviewQueue,
  type DashboardPeItem,
  type DashboardVcItem,
} from "@/components/dashboard/dashboard-review-queue";
import { CreateDealDialog } from "@/components/deals/create-deal-dialog";
import { CreateMaDealDialog } from "@/components/ma-deals/create-ma-deal-dialog";
import { maDealReadWhere } from "@/lib/pe/ma-team-access";
import { loadMaDealListReadinessSummaries } from "@/lib/pe/ma-deal-list-readiness";
import { MA_DEAL_TYPE_LABEL } from "@/lib/pe/ma-deal-labels";
import { peQueueUrgencyScore, pickPeNextAction } from "@/lib/pe/ma-deal-queue";
import { computeReportDecision, REPORT_FOR_DECISION_INCLUDE } from "@/lib/vc-decision-loader";
import { queueUrgencyScore, summarizeDealDecision } from "@/lib/vc-deal-queue";
import { SECTOR_LABEL } from "@/lib/deal-labels";
import {
  getUserTeamContext,
  dealReadWhere,
  reportReadWhere,
  portfolioReadWhere,
} from "@/lib/team-access";
import { buildAlerts } from "@/lib/portfolio";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;
  const { teamId } = await getUserTeamContext(userId);
  const dealScope = dealReadWhere(userId, teamId);
  const reportScope = reportReadWhere(userId, teamId);
  const portfolioScope = portfolioReadWhere(userId, teamId);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalDeals,
    activeDeals,
    totalReports,
    finalReports,
    vcCandidates,
    peTotal,
    peCandidates,
    recentReports,
    usageLogs,
    dealsBySector,
    dealsByStage,
    portfolioCompanies,
  ] = await Promise.all([
    prisma.deal.count({ where: dealScope }),
    prisma.deal.count({
      where: {
        AND: [
          dealScope,
          { stage: { in: [DealStage.IC_PREP, DealStage.IC_REVIEW, DealStage.DEEP_DIVE] } },
        ],
      },
    }),
    prisma.report.count({ where: reportScope }),
    prisma.report.count({
      where: {
        AND: [
          reportScope,
          { status: { in: [ReportStatus.FINAL, ReportStatus.EXPORTED] } },
        ],
      },
    }),
    // 검토 대기열 후보 — 최근 수정한 딜 일부만 계산한다(전체를 계산하지 않는다). 인가는 dealReadWhere로.
    prisma.deal.findMany({
      where: dealScope,
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true, companyName: true, sector: true, investRound: true },
    }),
    prisma.mADeal.count({ where: { AND: [maDealReadWhere(userId, teamId), { status: "ACTIVE" }] } }),
    prisma.mADeal.findMany({
      where: { AND: [maDealReadWhere(userId, teamId), { status: "ACTIVE" }] },
      orderBy: { updatedAt: "desc" },
      take: 24,
      select: { id: true, companyName: true, dealType: true },
    }),
    prisma.report.findMany({
      where: {
        AND: [reportScope, { status: { not: ReportStatus.PENDING } }],
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { deal: { select: { companyName: true } } },
    }),
    prisma.usageLog.findMany({
      where: { userId, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true, totalTokens: true, agentType: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.deal.groupBy({
      by: ["sector"],
      where: dealScope,
      _count: true,
    }),
    prisma.deal.groupBy({
      by: ["stage"],
      where: dealScope,
      _count: true,
    }),
    prisma.portfolioCompany.findMany({
      where: portfolioScope,
      include: {
        kpis: { orderBy: { period: "asc" } },
        milestones: { orderBy: { dueDate: "asc" } },
        updates: { orderBy: { period: "desc" }, take: 1 },
      },
    }),
  ]);

  const portfolioAlerts = buildAlerts(portfolioCompanies).slice(0, 5);

  // ── 지금 검토할 딜 ────────────────────────────────────────────────
  // VC: 딜마다 최신 보고서의 canonical 결정(화면·API·DOCX와 같은 computeReportDecision)을 요약한다.
  const vcRows: Array<DashboardVcItem & { score: number }> = await Promise.all(
    vcCandidates.map(async (deal) => {
      const report = await prisma.report.findFirst({
        where: { dealId: deal.id },
        orderBy: { createdAt: "desc" },
        include: REPORT_FOR_DECISION_INCLUDE,
      });
      const summary = report ? summarizeDealDecision(deal.id, report.id, computeReportDecision(report)) : null;
      return {
        dealId: deal.id,
        companyName: deal.companyName,
        meta: [SECTOR_LABEL[deal.sector], deal.investRound].filter(Boolean).join(" · "),
        summary,
        score: queueUrgencyScore(summary ?? undefined),
      };
    })
  );
  const vcItems: DashboardVcItem[] = vcRows.sort((a, b) => b.score - a.score).slice(0, 5);

  // PE: 인가된 딜 id만 한 번에 배치 조회(N+1 없음) → 준비 상태 요약 → 긴급도순.
  const peReadiness = await loadMaDealListReadinessSummaries(
    peCandidates.map((d) => d.id),
    userId
  );
  const peItems: DashboardPeItem[] = peCandidates
    .filter((d) => peReadiness[d.id])
    .map((d) => ({
      dealId: d.id,
      companyName: d.companyName,
      meta: MA_DEAL_TYPE_LABEL[d.dealType],
      readiness: peReadiness[d.id],
      next: pickPeNextAction(peReadiness[d.id]),
    }))
    .sort((a, b) => peQueueUrgencyScore(b.readiness) - peQueueUrgencyScore(a.readiness))
    .slice(0, 5);

  const stageLabel = STAGE_LABEL;
  const statusLabel: Record<ReportStatus, string> = {
    PENDING: "대기", GENERATING: "생성 중", DRAFT: "초안",
    REVIEW: "검토 중", FINAL: "최종", EXPORTED: "내보내기",
  };
  const sectorLabel: Record<DealSector, string> = {
    BIO: "바이오", IT: "IT/SaaS", DEEPTECH: "AI/딥테크",
    MANUFACTURING: "제조", CONTENT: "콘텐츠", FINTECH: "핀테크",
    CONSUMER: "소비재", CLIMATE: "기후", GENERAL: "일반",
  };

  // 일별 토큰 집계
  const dailyTokenMap: Record<string, number> = {};
  for (const log of usageLogs) {
    const day = log.createdAt.toISOString().slice(0, 10);
    dailyTokenMap[day] = (dailyTokenMap[day] ?? 0) + log.totalTokens;
  }
  const dailyTokens = Object.entries(dailyTokenMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, tokens]) => ({ date: date.slice(5), tokens })); // MM-DD 형식

  const totalTokens = usageLogs.reduce((s, l) => s + l.totalTokens, 0);

  const stats = [
    { label: "전체 딜", value: totalDeals },
    { label: "활성 딜", value: activeDeals },
    { label: "생성된 보고서", value: totalReports },
    { label: "최종 보고서", value: finalReports },
  ];

  const sectorData = dealsBySector.map((d) => ({
    name: sectorLabel[d.sector] ?? d.sector,
    value: d._count,
  }));
  const stageData = dealsByStage.map((d) => ({
    name: stageLabel[d.stage] ?? d.stage,
    value: d._count,
  }));

  const isEmptyWorkspace = totalDeals === 0 && peTotal === 0;

  return (
    <AppLayout title="대시보드">
      <div className={`${styles.workspace} space-y-8`}>
        <header className={styles.masthead}>
          <div>
            <div className={styles.eyebrow}>INVESTMENT DESK / 검토 현황</div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {session.user.name ?? "사용자"}님, {isEmptyWorkspace ? "첫 딜부터 시작하세요" : "오늘 검토할 딜입니다"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {teamId ? "팀 공유 딜을 포함한 현황입니다. " : ""}
              {isEmptyWorkspace ? "VC 투자 검토 또는 PE/M&A 인수 검토를 선택해 시작하세요." : "막힌 것과 다음 행동이 위에 옵니다."}
            </p>
          </div>
          <DashboardQuickActions />
        </header>

        {!isEmptyWorkspace && <dl className={styles.stats} data-testid="dashboard-stats">
          {stats.map((stat) => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}
        </dl>}
        {!isEmptyWorkspace && <div className={styles.sectionHeading}>
          <h2>지금 확인할 투자 기회</h2>
          <p>최근 수정한 딜 중 검토 우선순위 순 · VC 판단과 PE 준비 상태는 별개입니다</p>
        </div>}

        {isEmptyWorkspace ? (
          <section aria-labelledby="onboarding-title" data-testid="dashboard-onboarding">
            <h2 id="onboarding-title" className="text-base font-semibold text-foreground">
              첫 검토를 시작해 보세요
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              아직 딜이 없습니다. 어떤 검토를 하시나요? 딜을 만들면 이 자리에 검토 대기열이 생깁니다.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <FirstDealGuide track="vc" headingLevel={3} action={
                <CreateDealDialog trigger={<Button size="sm"><Plus /> 첫 VC 딜 만들기</Button>} />
              } />
              <FirstDealGuide track="pe" headingLevel={3} action={
                <CreateMaDealDialog trigger={<Button size="sm" variant="outline"><Plus /> 첫 PE/M&A 딜 만들기</Button>} />
              } />
            </div>
          </section>
        ) : (
          <DashboardReviewQueue vcItems={vcItems} peItems={peItems} vcTotal={totalDeals} peTotal={peTotal} />
        )}

        {portfolioAlerts.length > 0 && (
          <Card className="p-5" data-testid="dashboard-portfolio-alerts">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                <AlertTriangle className="h-4 w-4 text-state-caution" aria-hidden="true" />
                사후관리 알림
              </h2>
              <Link href="/portfolio" className="flex items-center gap-1 text-sm text-primary hover:underline">
                포트폴리오 <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
            <ul className="mt-2 divide-y divide-border">
              {portfolioAlerts.map((a, i) => (
                <li key={`${a.companyId}-${i}`}>
                  <Link
                    href={`/portfolio/${a.companyId}`}
                    className="flex items-start gap-2 py-2.5 text-sm hover:bg-muted/50"
                  >
                    <StatusBadge tone={a.severity === "high" ? "critical" : "caution"} className="mt-0.5 shrink-0">
                      {a.severity === "high" ? "긴급" : "확인"}
                    </StatusBadge>
                    <span>
                      <span className="font-medium text-foreground">{a.companyName}</span>
                      <span className="text-muted-foreground"> — {a.message}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* 차트 영역 (Client Component) */}
        <DashboardCharts
          dailyTokens={dailyTokens}
          sectorData={sectorData}
          stageData={stageData}
          totalTokens={totalTokens}
        />

        {/* 최근 보고서 */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">최근 보고서</CardTitle>
              <Link href="/reports" className="flex items-center gap-1 text-sm text-primary hover:underline">
                전체 보기 <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentReports.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" aria-hidden="true" />
                <p className="text-sm">생성된 보고서가 없습니다</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {recentReports.map((report) => (
                  <li key={report.id}>
                    <Link
                      href={`/reports/${report.id}`}
                      className="flex items-center justify-between gap-3 py-3 hover:bg-muted/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{report.deal.companyName}</p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {new Date(report.createdAt).toLocaleDateString("ko-KR")}
                        </p>
                      </div>
                      <StatusBadge
                        tone={
                          report.status === "FINAL" || report.status === "EXPORTED"
                            ? "positive"
                            : report.status === "GENERATING"
                            ? "caution"
                            : "neutral"
                        }
                        icon={false}
                      >
                        {statusLabel[report.status]}
                      </StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* AI 사용량 */}
        {totalTokens > 0 && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
            AI 토큰 사용량(최근 30일): {totalTokens.toLocaleString()} tokens
          </p>
        )}
      </div>
    </AppLayout>
  );
}

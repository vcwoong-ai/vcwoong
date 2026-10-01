import Link from "next/link";
import styles from "@/components/ui/investment-workspace.module.css";
import { ArrowRight, FileQuestion } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ReadinessBadge } from "@/components/ma-deals/readiness-badge";
import { EvidenceStateBadge } from "@/components/vc/evidence-state";
import { INVESTMENT_SIGNAL_LABEL, type InvestmentSignal } from "@/lib/ic-review";
import { NO_REPORT_NEXT_ACTION, type DealQueueSummary } from "@/lib/vc-deal-queue";
import { presentBlockerLabel } from "@/lib/pe/blocker-display";
import type { PeNextAction } from "@/lib/pe/ma-deal-queue";
import type { MaDealListReadinessSummary } from "@/lib/pe/ma-deal-list-readiness";

const SIGNAL_TEXT_CLASS: Record<InvestmentSignal, string> = {
  STRONG: "text-state-positive",
  PROMISING: "text-state-info",
  CAUTION: "text-state-caution",
  HIGH_RISK: "text-state-critical",
};

export interface DashboardVcItem {
  dealId: string;
  companyName: string;
  meta: string;
  summary: DealQueueSummary | null;
}

export interface DashboardPeItem {
  dealId: string;
  companyName: string;
  meta: string;
  readiness: MaDealListReadinessSummary;
  next: PeNextAction;
}

/**
 * 대시보드의 "지금 검토할 딜" — VC와 PE를 나란히 두되 서로 다른 판단 체계를 섞지 않는다.
 * VC는 결정 화면과 같은 계산(computeReportDecision)의 요약, PE는 준비 상태(buildPEDecisionReadiness)의 요약이다.
 * 서버 컴포넌트가 인가된 딜만 대상으로 미리 계산해 내려준다.
 */
export function DashboardReviewQueue({
  vcItems,
  peItems,
  vcTotal,
  peTotal,
}: {
  vcItems: DashboardVcItem[];
  peItems: DashboardPeItem[];
  vcTotal: number;
  peTotal: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2" data-testid="dashboard-review-queue">
      <QueueCard
        title="VC — 투자 판단 검토"
        href="/deals"
        total={vcTotal}
        emptyText="아직 VC 딜이 없습니다. 딜 상세에서 문서를 올리고 보고서를 생성하세요. 생성된 보고서의 투자 근거·상충·미확인 정보가 여기에 요약됩니다."
        testId="dashboard-vc-queue"
      >
        {vcItems.map((item) => (
          <li key={item.dealId} className="py-3.5" data-testid="dashboard-vc-row">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <Link href={`/deals/${item.dealId}`} className="text-[15px] font-semibold text-foreground underline-offset-2 hover:underline">
                {item.companyName}
              </Link>
              <span className="text-xs text-muted-foreground">{item.meta}</span>
            </div>
            {item.summary ? (
              <>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className={`text-sm font-semibold ${SIGNAL_TEXT_CLASS[item.summary.signal]}`}>
                    {INVESTMENT_SIGNAL_LABEL[item.summary.signal].label}
                  </span>
                  <EvidenceStateBadge state={item.summary.confidence} />
                  {item.summary.contradictionCount > 0 && (
                    <StatusBadge tone="critical">수치 상충 {item.summary.contradictionCount}건</StatusBadge>
                  )}
                  {item.summary.p0Count > 0 && (
                    <StatusBadge tone="caution">필수 정보 공백 {item.summary.p0Count}건</StatusBadge>
                  )}
                </div>
                <p className="mt-1.5 text-sm text-foreground">{item.summary.nextAction.label}</p>
                <Link
                  href={`/reports/${item.summary.reportId}`}
                  className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
                >
                  결정 화면 열기 <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              </>
            ) : (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <StatusBadge tone="neutral" icon={FileQuestion}>보고서 없음</StatusBadge>
                <span className="text-sm text-muted-foreground">{NO_REPORT_NEXT_ACTION.label}</span>
              </div>
            )}
          </li>
        ))}
      </QueueCard>

      <QueueCard
        title="PE/M&A — 검증 준비 상태"
        href="/ma-deals"
        total={peTotal}
        emptyText="아직 PE/M&A 딜이 없습니다. 딜을 만들고 재무 · QoE 탭에서 재무 기간과 계정을 입력하세요. 차단 요인과 다음 행동을 검토 대기열에서 확인할 수 있습니다."
        testId="dashboard-pe-queue"
      >
        {peItems.map((item) => (
          <li key={item.dealId} className="py-3.5" data-testid="dashboard-pe-row">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <Link href={`/ma-deals/${item.dealId}`} className="text-[15px] font-semibold text-foreground underline-offset-2 hover:underline">
                {item.companyName}
              </Link>
              <span className="text-xs text-muted-foreground">{item.meta}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <ReadinessBadge state={item.readiness.overall} />
              {item.readiness.blockerCount > 0 && (
                <StatusBadge tone="critical">차단 요인 {item.readiness.blockerCount}건</StatusBadge>
              )}
            </div>
            <p className="mt-1.5 text-sm text-foreground">{presentBlockerLabel(item.next.label)}</p>
            <Link
              href={`/ma-deals/${item.dealId}?tab=${item.next.tab}`}
              className="mt-1 inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
            >
              해당 탭 열기 <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </QueueCard>
    </div>
  );
}

function QueueCard({
  title,
  href,
  total,
  emptyText,
  testId,
  children,
}: {
  title: string;
  href: string;
  total: number;
  emptyText: string;
  testId: string;
  children: React.ReactNode[];
}) {
  return (
    <Card className={styles.queue} data-testid={testId}>
      <div className={styles.queueHeading}>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <Link href={href} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          전체 {total}건 <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
      {children.length === 0 ? (
        <div className={styles.empty}><p className="text-sm text-muted-foreground">{emptyText}</p><Link href={href} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary">첫 검토 준비하기 <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></div>
      ) : (
        <ul className="mt-2 divide-y divide-border">{children}</ul>
      )}
    </Card>
  );
}

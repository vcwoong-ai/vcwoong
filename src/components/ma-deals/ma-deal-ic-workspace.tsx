import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MA_DEAL_TYPE_LABEL, MA_DEAL_STATUS_LABEL, READINESS_STATE_LABEL } from "@/lib/pe/ma-deal-labels";
import { MaDealReadiness } from "./ma-deal-readiness";
import { MaDealMissingInfo } from "./ma-deal-missing-info";
import { MaDealQoeSummary } from "./ma-deal-qoe-summary";
import { MaDealIcSnapshot } from "./ma-deal-ic-snapshot";
import { MaDealFinancialDataQuality } from "./ma-deal-financial-data-quality";
import { MaDealCanonicalAccountsTable } from "./ma-deal-canonical-accounts-table";
import { MaDealDdFindings } from "./ma-deal-dd-findings";
import { MaDealEvidenceStatus } from "./ma-deal-evidence-status";
import { MaDealIcQuestions } from "./ma-deal-ic-questions";
import { buildICQuestions } from "@/lib/pe/pe-ic-questions";
import { computeFinancialDataQuality, type FinancialsPeriodLike } from "@/lib/pe/pe-financials-view-model";
import type { MaDealType, MaDealStatus } from "@prisma/client";
import type { MaDealDashboardData } from "./ma-deal-overview";
import type { PEDDCase } from "@/lib/pe/dd-types";

interface MaDeal {
  companyName: string;
  dealType: MaDealType;
  status: MaDealStatus;
}

/**
 * PE/M&A IC 검토 워크스페이스(PR #107).
 *
 * 이 컴포넌트는 새 재무/QoE/LBO/readiness 계산을 하지 않는다 — 전부 기존
 * 엔진(buildPEDecisionReadiness()/calculateAdjustedEbitda()/qoe-lbo-bridge.ts/
 * lbo-model.ts, 전부 수정 없음)이 이미 만든 결과를 한 화면에 모아 보여주는
 * 소비자일 뿐이다. BUY/PASS/투자 점수/추천 문구는 만들지 않는다 — "IC가
 * 무엇을 알고 무엇이 아직 없는지"만 보여준다.
 *
 * 재무 핵심 계정 테이블은 최근 1개 기간만 보여준다(periods.slice(0,1)) —
 * 전체 기간 이력은 재무·QoE 탭의 책임으로 남기고, 여기서는 "지금 이
 * 순간의 스냅샷"만 압축해서 보여준다(같은 표를 그대로 복제하지 않기 위함).
 */
export function MaDealIcWorkspace({
  maDealId,
  maDeal,
  dashboard,
  ddCase,
  periods,
  canEdit,
  onNavigateTab,
  onEvidenceRequestCreated,
}: {
  maDealId: string;
  maDeal: MaDeal;
  dashboard: MaDealDashboardData;
  ddCase: PEDDCase | undefined;
  periods: Array<FinancialsPeriodLike & { periodType: string; currency: string }>;
  canEdit: boolean;
  onNavigateTab: (tab: string) => void;
  onEvidenceRequestCreated: () => void | Promise<void>;
}) {
  const readiness = dashboard.decisionReadiness;
  const evidenceDomain = readiness.domains.find((d) => d.domain === "EVIDENCE")!;
  const latestPeriod = periods.slice(0, 1);
  const latestPeriodQuality = computeFinancialDataQuality(latestPeriod, readiness.factConflicts.length);
  const questions = buildICQuestions(readiness, ddCase);

  return (
    <div className="space-y-4">
      {/* A. Deal Snapshot */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">딜 스냅샷</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{MA_DEAL_TYPE_LABEL[maDeal.dealType]}</Badge>
          <Badge variant={maDeal.status === "ACTIVE" ? "default" : "secondary"}>
            {MA_DEAL_STATUS_LABEL[maDeal.status]}
          </Badge>
          <Badge variant="secondary">종합 준비 상태: {READINESS_STATE_LABEL[readiness.overall]}</Badge>
          <Badge variant="outline">
            재무기간 {dashboard.financialQuality.latestPeriodLabel ?? "없음"}
          </Badge>
          <Badge variant="outline">
            DART {dashboard.dartStatus.imported ? `${dashboard.dartStatus.periodsCount}개 기간 확인` : "미연동"}
          </Badge>
          <Badge variant="outline">
            DD finding {ddCase ? `${ddCase.findings.length}건` : "데이터 없음"}
          </Badge>
          <Badge variant="outline">
            근거(evidence) {ddCase ? `${ddCase.lineage.evidence.length}건` : "데이터 없음"}
          </Badge>
        </CardContent>
      </Card>

      {/* B. Decision Readiness */}
      <MaDealReadiness readiness={readiness} />

      {/* C. Key Financial Facts(최근 기간만 — 전체 이력은 재무·QoE 탭 참고) */}
      {latestPeriod.length > 0 && (
        <>
          <MaDealFinancialDataQuality quality={latestPeriodQuality} conflicts={readiness.factConflicts} />
          <MaDealCanonicalAccountsTable periods={latestPeriod} />
        </>
      )}

      {/* D. QoE */}
      <MaDealQoeSummary qoe={dashboard.qoeSummary} onOpenFinancials={() => onNavigateTab("financials")} />

      {/* E. LBO — MOIC/IRR은 가정이 딜별 판단이 필요해 여기서 계산/표시하지 않는다(ic-snapshot 주석 참고) */}
      <MaDealIcSnapshot lboEntryEbitda={dashboard.lboEntryEbitda} onOpenLbo={() => onNavigateTab("lbo")} />

      {/* F. DD / Key Findings */}
      <MaDealDdFindings findings={ddCase?.findings ?? []} />

      {/* G. Evidence / Data Room 상태 */}
      <MaDealEvidenceStatus
        ddCase={ddCase}
        evidenceDomain={evidenceDomain}
        onOpenDataRoom={() => onNavigateTab("data-room")}
      />

      {/* H. Missing Information */}
      <MaDealMissingInfo readiness={readiness} />

      {/* I. IC Questions */}
      <MaDealIcQuestions
        maDealId={maDealId}
        questions={questions}
        canEdit={canEdit}
        onRequestCreated={onEvidenceRequestCreated}
      />
    </div>
  );
}

import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Stat } from "@/components/ui/stat";
import { Callout } from "@/components/ui/callout";
import { IC_RECOMMENDATION_LABEL, INVESTMENT_SIGNAL_LABEL, type InvestmentSignal } from "@/lib/ic-review";
import { SECTOR_LABEL, STAGE_LABEL } from "@/lib/deal-labels";
import { EvidenceStateBadge } from "./evidence-state";
import type { DecisionApiData } from "./decision-types";

const SIGNAL_TONE: Record<InvestmentSignal, StatusTone> = {
  STRONG: "positive",
  PROMISING: "info",
  CAUTION: "caution",
  HIGH_RISK: "critical",
};

const SIGNAL_TEXT_CLASS: Record<InvestmentSignal, string> = {
  STRONG: "text-state-positive",
  PROMISING: "text-state-info",
  CAUTION: "text-state-caution",
  HIGH_RISK: "text-state-critical",
};

/**
 * 투자 결정의 첫 화면 — 5초 안에 "이 딜이 지금 어떤 상태인가"를 읽게 한다:
 * 어떤 딜인지 / 시그널 / 근거 상태 / 결정을 막는 것의 개수 / 한 줄 논지.
 * 값은 전부 canonical decision(서버 계산)에서 그대로 온다.
 */
export function DecisionHeader({ data }: { data: DecisionApiData }) {
  const { decision, deal } = data;
  const p0Count = decision.missingInformation.filter((m) => m.priority === "P0").length;
  const contradictionCount = decision.contradictions.length;
  const breakerCount = decision.thesisBreakers.length;
  const meta = [
    SECTOR_LABEL[deal.sector as keyof typeof SECTOR_LABEL] ?? deal.sector,
    STAGE_LABEL[deal.stage as keyof typeof STAGE_LABEL] ?? deal.stage,
    deal.investRound,
  ].filter(Boolean);

  return (
    <header className="space-y-4" data-testid="vc-decision-header">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Investment Decision</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">
          {deal.companyName}
          <span className="ml-2 text-sm font-normal text-slate-500">{meta.join(" · ")}</span>
        </h2>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p
          className={`text-2xl font-semibold tracking-tight ${SIGNAL_TEXT_CLASS[decision.signal]}`}
          data-testid="vc-decision-signal"
        >
          {INVESTMENT_SIGNAL_LABEL[decision.signal].label}
        </p>
        <StatusBadge tone={SIGNAL_TONE[decision.signal]} icon={false} data-testid="vc-decision-recommendation">
          {IC_RECOMMENDATION_LABEL[decision.recommendation]}
        </StatusBadge>
        {data.scoreOverall != null && (
          <span className="text-sm text-slate-500 tabular-nums">
            투자 매력도 점수 {Math.round(data.scoreOverall)}
            <span className="text-xs"> (근거 완결성과 별개)</span>
          </span>
        )}
      </div>

      <p className="max-w-3xl text-[15px] leading-relaxed text-slate-800" data-testid="vc-decision-thesis">
        {decision.thesis}
      </p>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-slate-200 py-4 sm:grid-cols-4" data-testid="vc-decision-stats">
        <div className="min-w-0">
          <dt className="text-xs font-medium text-slate-500">근거 상태</dt>
          <dd className="mt-1.5">
            <EvidenceStateBadge state={decision.confidence} />
          </dd>
        </div>
        <Stat label="결정 차단(P0) 정보 공백" value={`${p0Count}건`} />
        <Stat label="수치 상충" value={`${contradictionCount}건`} />
        <Stat label="Thesis Breaker" value={`${breakerCount}건`} />
      </dl>

      {p0Count > 0 && (
        <Callout tone="caution" title={`결정을 막는(P0) 정보 공백 ${p0Count}건`}>
          아래 AI 작성 보고서 본문(투자의견 등)이 이 상태를 아직 반영하지 않았을 수 있습니다. 보고서의 결론과 이
          요약이 다르면 이 요약을 우선하고 P0 항목을 먼저 해소하십시오.
        </Callout>
      )}
    </header>
  );
}

import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { IC_RECOMMENDATION_LABEL, INVESTMENT_SIGNAL_LABEL, type InvestmentSignal } from "@/lib/ic-review";
import { SECTOR_LABEL, STAGE_LABEL } from "@/lib/deal-labels";
import { EvidenceStateBadge } from "./evidence-state";
import type { DecisionApiData } from "./decision-types";
import styles from "./decision-workspace.module.css";

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
    <header className={styles.masthead} data-testid="vc-decision-header">
      <div>
        <p className={styles.eyebrow}>VC / Investment Review</p>
        <h2 className={styles.company}>{deal.companyName}</h2>
        <p className={styles.meta}>{meta.join(" · ")}</p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          {contradictionCount > 0 && <a href="#vc-contradictions-title" className="inline-flex min-h-10 items-center rounded bg-primary px-4 font-medium text-primary-foreground">상충 값 {contradictionCount}건 대조 ↓</a>}
          <a href="#vc-missing-title" className="inline-flex min-h-10 items-center rounded border border-slate-300 px-4 font-medium text-slate-700">필요한 자료 확인 ↓</a>
        </div>
      </div>

      <div className={styles.thesisGrid}>
        <div>
          <p className={styles.eyebrow}>투자 논지</p>
          <p className={styles.thesis} data-testid="vc-decision-thesis">{decision.thesis}</p>
        </div>
        <div className={styles.signal}>
        <p className="mb-2 text-xs font-medium text-slate-600">현재 검토 의견 · 투자 승인과 별개</p>
        <StatusBadge tone={SIGNAL_TONE[decision.signal]} icon={false} data-testid="vc-decision-recommendation">
          {IC_RECOMMENDATION_LABEL[decision.recommendation]}
        </StatusBadge>
        <p
          className={`mt-3 text-xl font-semibold tracking-tight ${SIGNAL_TEXT_CLASS[decision.signal]}`}
          data-testid="vc-decision-signal"
        >
          {INVESTMENT_SIGNAL_LABEL[decision.signal].label}
        </p>
        {data.scoreOverall != null && (
          <p className="mt-2 text-sm text-slate-600 tabular-nums">
            투자 매력도 점수 {Math.round(data.scoreOverall)}
            <span className="block text-xs">근거 완결성과 별개인 보조지표</span>
          </p>
        )}
        </div>
      </div>

      <dl className={styles.stats} data-testid="vc-decision-stats">
        <div className={styles.stat}>
          <dt>근거 상태</dt>
          <dd><EvidenceStateBadge state={decision.confidence} /></dd>
        </div>
        <div className={styles.stat}><dt>결정 차단(P0) 정보 공백</dt><dd><a href="#vc-missing-title" aria-label={`P0 정보 공백 ${p0Count}건 확인`}>{p0Count}건 <span className="text-sm text-slate-500">↗</span></a></dd></div>
        <div className={styles.stat}><dt>수치 상충</dt><dd>{contradictionCount > 0 ? <a href="#vc-contradictions-title" aria-label={`수치 상충 ${contradictionCount}건 확인`}>{contradictionCount}건 <span className="text-sm text-slate-500">↗</span></a> : "0건"}</dd></div>
        <div className={styles.stat}><dt>논지 훼손 요인</dt><dd><a href="#vc-breakers-title" aria-label={`논지 훼손 요인 ${breakerCount}건 확인`}>{breakerCount}건 <span className="text-sm text-slate-500">↗</span></a></dd></div>
      </dl>

      {p0Count > 0 && (
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          <span className="font-semibold text-state-caution">P0 {p0Count}건 해소 전 최종 판단 불가.</span>{" "}
          AI 보고서 본문은 이 상태를 반영하지 않았을 수 있습니다. 결론이 다르면 이 요약을 우선 확인하십시오.
        </p>
      )}
    </header>
  );
}

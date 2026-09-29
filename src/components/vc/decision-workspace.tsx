"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Callout } from "@/components/ui/callout";
import { Button } from "@/components/ui/button";
import { DealScoreRadar } from "@/components/deals/deal-score-radar";
import type { ScoreDimensionKey } from "@/lib/deal-scoring-shared";
import type { DecisionApiData } from "./decision-types";
import { DecisionHeader } from "./decision-header";
import { ContradictionPanel } from "./contradiction-panel";
import { BreakerList, DecisionMap, DriverList, MissingInformationList, QuestionList, ValuationBlock } from "./decision-sections";

/**
 * VC 결정 워크스페이스 — 보고서 본문 위에서 "무엇을 알고, 무엇을 모르고, 무엇이
 * 논지를 깨고, 무엇이 결정을 막는가"를 한 흐름으로 보여준다.
 *
 * 이 컴포넌트는 판단하지 않는다. 서버가 canonical 엔진(vc-decision.ts)으로 계산한
 * 결과(GET /api/reports/[id]/decision)를 받아 표시만 한다 — 화면과 export가 같은
 * 조립 함수를 쓰므로 서로 다른 결론을 낼 수 없다.
 */
export function DecisionWorkspace({
  reportId,
  dealId,
  canEdit,
  refreshKey = 0,
  onRefresh,
}: {
  reportId: string;
  dealId: string;
  canEdit: boolean;
  /** 부모가 올리면 다시 불러온다(IC 질문 생성·점수 재계산 직후) */
  refreshKey?: number;
  /** 워크스페이스 안에서 점수를 계산했을 때 부모에게 알린다 */
  onRefresh?: () => void;
}) {
  const [data, setData] = useState<DecisionApiData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localKey, setLocalKey] = useState(0);
  const [radarOpen, setRadarOpen] = useState(false);

  const load = useCallback(async () => {
    setStatus((s) => (s === "ready" ? s : "loading"));
    try {
      const res = await fetch(`/api/reports/${reportId}/decision`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `결정 요약을 불러오지 못했습니다 (${res.status})`);
      setData(json.data as DecisionApiData);
      setErrorMessage(null);
      setStatus("ready");
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "결정 요약을 불러오지 못했습니다");
      setStatus("error");
    }
  }, [reportId]);

  useEffect(() => {
    load();
  }, [load, refreshKey, localKey]);

  const refFor = useMemo(() => {
    const refs = data?.sectionRefs ?? [];
    return (dimension: ScoreDimensionKey | undefined) => (dimension ? refs.find((r) => r.dimension === dimension) : undefined);
  }, [data?.sectionRefs]);

  if (status === "loading" && !data) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-slate-500" role="status" aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        투자 결정 요약을 불러오는 중…
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <Callout tone="critical" title="투자 결정 요약을 불러오지 못했습니다">
        {errorMessage}
        <div className="mt-2">
          <Button size="sm" variant="outline" onClick={() => setLocalKey((k) => k + 1)}>
            다시 시도
          </Button>
        </div>
      </Callout>
    );
  }

  const refreshAfterScore = () => {
    setLocalKey((k) => k + 1);
    onRefresh?.();
  };

  const scoreDetail = (
    <details
      className="rounded-md border border-slate-200 bg-white"
      open={radarOpen}
      onToggle={(e) => setRadarOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer select-none px-3.5 py-2.5 text-sm font-medium text-slate-700">
        점수 상세 (6개 차원 레이더)
      </summary>
      <div className="border-t border-slate-100 p-3.5">
        <DealScoreRadar dealId={dealId} canEdit={canEdit} onComputed={refreshAfterScore} />
      </div>
    </details>
  );

  // 점수가 없으면 Drivers/논지/확신도를 만들 수 없다 — 그래도 수치 상충은 점수와 무관한
  // 사실이라 있으면 반드시 보여준다.
  if (!data.hasScore) {
    return (
      <div className="space-y-6" data-testid="vc-decision-workspace" data-state="no-score">
        <Callout tone="caution" title="투자 매력도 점수가 아직 없어 결정 요약을 만들 수 없습니다">
          점수를 계산하면 투자 근거·논지 훼손 요인·미확인 정보가 이 자리에 채워집니다.
        </Callout>
        <ContradictionPanel contradictions={data.decision.contradictions} />
        <DealScoreRadar dealId={dealId} canEdit={canEdit} onComputed={refreshAfterScore} />
      </div>
    );
  }

  if (!data.gate.ok) {
    return (
      <div className="space-y-6" data-testid="vc-decision-workspace" data-state="gate-failed">
        <Callout tone="critical" title="Investment Decision 계산 결과가 자체 일관성 검증을 통과하지 못했습니다">
          ({data.gate.reason}) — 검증되지 않은 결정 요약은 표시하지 않습니다. 엔지니어링 확인이 필요합니다.
        </Callout>
        <ContradictionPanel contradictions={data.decision.contradictions} />
      </div>
    );
  }

  const { decision } = data;
  return (
    <div className="space-y-8" data-testid="vc-decision-workspace" data-state="ready">
      <DecisionHeader data={data} />
      {data.assessmentBasis === "no_report" && (
        <Callout tone="caution" title="보고서 없이 채점된 점수입니다">
          근거 대조(evidence tracing)를 수행할 수 없어 아래 강점·리스크는 검증되지 않았습니다. 보고서 생성 후 점수를 다시 계산하십시오.
        </Callout>
      )}
      <DecisionMap data={data} refFor={refFor} />
      <ContradictionPanel contradictions={decision.contradictions} />
      <DriverList drivers={decision.drivers} refFor={refFor} />
      <BreakerList breakers={decision.thesisBreakers} refFor={refFor} />
      <ValuationBlock data={data} />
      <MissingInformationList items={decision.missingInformation} refFor={refFor} />
      <QuestionList links={data.questionLinks} generated={data.questionsGenerated} />
      {scoreDetail}
    </div>
  );
}

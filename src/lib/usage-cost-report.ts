/**
 * 관리자용 비용 집계 — UsageLog row 목록을 받아 모델별/일별 비용을
 * 계산하는 순수 함수. DB 조회(prisma)와 분리해서 오프라인 테스트가
 * 가능하게 한다(다른 lib/*.ts와 같은 패턴).
 *
 * estimatedCost가 null인 row(가격 정보를 못 받은 호출, ai-cost.ts 참고)는
 * "0원"이 아니라 "모른다"이므로 합계에서 빼고 unknownCostCalls로 따로
 * 센다 — 합계에 슬쩍 0으로 섞어 실제보다 저렴해 보이게 하지 않는다.
 */

export interface UsageCostRow {
  model: string;
  estimatedCost: number | null | undefined;
  inputTokens: number;
  outputTokens: number;
  createdAt: Date;
}

export interface ModelCostSummary {
  model: string;
  calls: number;
  knownCostCalls: number;
  totalCost: number;
  avgCostPerCall: number | null;
  inputTokens: number;
  outputTokens: number;
}

export interface DailyCostPoint {
  date: string; // YYYY-MM-DD
  cost: number;
}

export interface UsageCostReport {
  totalCalls: number;
  unknownCostCalls: number;
  totalKnownCost: number;
  byModel: ModelCostSummary[];
  dailyCost: DailyCostPoint[];
}

export function buildUsageCostReport(rows: UsageCostRow[]): UsageCostReport {
  const byModelMap = new Map<
    string,
    { calls: number; knownCostCalls: number; totalCost: number; inputTokens: number; outputTokens: number }
  >();
  const dailyMap = new Map<string, number>();

  let totalKnownCost = 0;
  let unknownCostCalls = 0;

  for (const row of rows) {
    const entry =
      byModelMap.get(row.model) ??
      { calls: 0, knownCostCalls: 0, totalCost: 0, inputTokens: 0, outputTokens: 0 };
    entry.calls += 1;
    entry.inputTokens += row.inputTokens;
    entry.outputTokens += row.outputTokens;

    if (typeof row.estimatedCost === "number" && Number.isFinite(row.estimatedCost)) {
      entry.knownCostCalls += 1;
      entry.totalCost += row.estimatedCost;
      totalKnownCost += row.estimatedCost;

      const day = row.createdAt.toISOString().slice(0, 10);
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + row.estimatedCost);
    } else {
      unknownCostCalls += 1;
    }

    byModelMap.set(row.model, entry);
  }

  const byModel: ModelCostSummary[] = Array.from(byModelMap.entries())
    .map(([model, v]) => ({
      model,
      calls: v.calls,
      knownCostCalls: v.knownCostCalls,
      totalCost: v.totalCost,
      avgCostPerCall: v.knownCostCalls > 0 ? v.totalCost / v.knownCostCalls : null,
      inputTokens: v.inputTokens,
      outputTokens: v.outputTokens,
    }))
    // 비용 내림차순 — "어디에 돈이 나가고 있는가"가 첫눈에 보여야 함
    .sort((a, b) => b.totalCost - a.totalCost);

  const dailyCost: DailyCostPoint[] = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cost]) => ({ date, cost }));

  return {
    totalCalls: rows.length,
    unknownCostCalls,
    totalKnownCost,
    byModel,
    dailyCost,
  };
}

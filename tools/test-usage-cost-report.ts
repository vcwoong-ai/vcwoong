/**
 * 관리자용 비용 집계(src/lib/usage-cost-report.ts) 테스트.
 *
 * DB 조회 없이 UsageLog row 배열을 직접 넣어 순수 함수만 검증한다(다른
 * lib/*.ts 계산 로직 테스트와 같은 패턴, 예: test-ic-review.ts).
 *
 * Usage: npm run test:usage-cost-report
 */
import { buildUsageCostReport, type UsageCostRow } from "../src/lib/usage-cost-report";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function row(overrides: Partial<UsageCostRow>): UsageCostRow {
  return {
    model: "deepseek/deepseek-v4-flash-0731",
    estimatedCost: 0.01,
    inputTokens: 1000,
    outputTokens: 500,
    createdAt: new Date("2026-09-25T10:00:00Z"),
    ...overrides,
  };
}

function testEmptyInput() {
  const report = buildUsageCostReport([]);
  assert(report.totalCalls === 0, "빈 입력인데 totalCalls가 0이 아님");
  assert(report.unknownCostCalls === 0, "빈 입력인데 unknownCostCalls가 0이 아님");
  assert(report.totalKnownCost === 0, "빈 입력인데 totalKnownCost가 0이 아님");
  assert(report.byModel.length === 0, "빈 입력인데 byModel이 비어있지 않음");
  assert(report.dailyCost.length === 0, "빈 입력인데 dailyCost가 비어있지 않음");
  console.log("✅ A. 빈 입력 → 모든 필드 0/빈 배열, 예외 없음");
}

function testNullCostExcludedFromTotalButCounted() {
  const rows: UsageCostRow[] = [
    row({ estimatedCost: 0.02 }),
    row({ estimatedCost: null }),
    row({ estimatedCost: undefined }),
  ];
  const report = buildUsageCostReport(rows);
  assert(report.totalCalls === 3, `totalCalls=${report.totalCalls}, expected 3`);
  assert(report.unknownCostCalls === 2, `unknownCostCalls=${report.unknownCostCalls}, expected 2(null+undefined)`);
  assert(
    Math.abs(report.totalKnownCost - 0.02) < 1e-9,
    `totalKnownCost=${report.totalKnownCost} — null/undefined가 0원으로 섞여 들어감(있으면 안 됨)`
  );
  console.log("✅ B. estimatedCost=null/undefined는 0원이 아니라 '모름'으로 분리 집계됨");
}

function testNonFiniteCostTreatedAsUnknown() {
  const rows: UsageCostRow[] = [row({ estimatedCost: NaN }), row({ estimatedCost: Infinity })];
  const report = buildUsageCostReport(rows);
  assert(report.unknownCostCalls === 2, "NaN/Infinity가 '모름'으로 처리되지 않음");
  assert(report.totalKnownCost === 0, "NaN/Infinity가 합계에 섞여 들어감");
  console.log("✅ C. NaN/Infinity 같은 비정상 비용값도 '모름'으로 안전 처리(합계 오염 없음)");
}

function testByModelAggregationAndSortDescending() {
  const rows: UsageCostRow[] = [
    row({ model: "model-cheap", estimatedCost: 0.001, inputTokens: 100, outputTokens: 50 }),
    row({ model: "model-cheap", estimatedCost: 0.001, inputTokens: 100, outputTokens: 50 }),
    row({ model: "model-expensive", estimatedCost: 1.5, inputTokens: 2000, outputTokens: 1000 }),
  ];
  const report = buildUsageCostReport(rows);
  assert(report.byModel.length === 2, `모델 2개가 집계돼야 하는데 ${report.byModel.length}개`);
  assert(
    report.byModel[0].model === "model-expensive",
    `총 비용 내림차순 정렬이 아님: ${report.byModel.map((m) => m.model).join(",")}`
  );
  const cheap = report.byModel.find((m) => m.model === "model-cheap")!;
  assert(cheap.calls === 2, `model-cheap calls=${cheap.calls}, expected 2`);
  assert(cheap.inputTokens === 200, `model-cheap inputTokens 합산이 틀림: ${cheap.inputTokens}`);
  assert(
    Math.abs(cheap.avgCostPerCall! - 0.001) < 1e-9,
    `model-cheap 평균 비용이 틀림: ${cheap.avgCostPerCall}`
  );
  console.log("✅ D. 모델별 calls/tokens/총비용 집계 + 총비용 내림차순 정렬 + 평균 비용 계산");
}

function testAvgCostNullWhenNoKnownCostCalls() {
  const rows: UsageCostRow[] = [row({ model: "all-unknown", estimatedCost: null })];
  const report = buildUsageCostReport(rows);
  const m = report.byModel[0];
  assert(m.avgCostPerCall === null, `비용 정보가 하나도 없는 모델의 평균이 null이 아님: ${m.avgCostPerCall}`);
  console.log("✅ E. 그 모델의 비용 정보가 전부 없으면 평균도 0이 아니라 null(모름)");
}

function testDailyCostBucketedByUtcDateAndSorted() {
  const rows: UsageCostRow[] = [
    row({ estimatedCost: 0.01, createdAt: new Date("2026-09-25T23:59:00Z") }),
    row({ estimatedCost: 0.02, createdAt: new Date("2026-09-24T00:01:00Z") }),
    row({ estimatedCost: 0.03, createdAt: new Date("2026-09-25T00:00:01Z") }),
  ];
  const report = buildUsageCostReport(rows);
  assert(report.dailyCost.length === 2, `날짜 2개로 묶여야 하는데 ${report.dailyCost.length}개`);
  assert(report.dailyCost[0].date === "2026-09-24", "일별 비용이 날짜 오름차순 정렬이 아님");
  assert(report.dailyCost[1].date === "2026-09-25", "일별 비용이 날짜 오름차순 정렬이 아님");
  assert(
    Math.abs(report.dailyCost[1].cost - 0.04) < 1e-9,
    `같은 날짜(09-25) 두 건 합산이 틀림: ${report.dailyCost[1].cost}`
  );
  console.log("✅ F. 일별 비용이 UTC 날짜(YYYY-MM-DD) 단위로 합산되고 날짜 오름차순 정렬됨");
}

function testUnknownCostRowsExcludedFromDailyCost() {
  const rows: UsageCostRow[] = [row({ estimatedCost: null, createdAt: new Date("2026-09-25T10:00:00Z") })];
  const report = buildUsageCostReport(rows);
  assert(report.dailyCost.length === 0, "비용을 모르는 호출이 일별 비용에 0원으로 섞여 들어감");
  console.log("✅ G. 비용을 모르는 호출은 일별 비용 추이에도 섞이지 않음");
}

async function main() {
  console.log("\n=== DealMind 관리자 비용 집계(usage-cost-report) 테스트 ===\n");
  testEmptyInput();
  testNullCostExcludedFromTotalButCounted();
  testNonFiniteCostTreatedAsUnknown();
  testByModelAggregationAndSortDescending();
  testAvgCostNullWhenNoKnownCostCalls();
  testDailyCostBucketedByUtcDateAndSorted();
  testUnknownCostRowsExcludedFromDailyCost();
  console.log("\n✅ 관리자 비용 집계 테스트 통과\n");
}

main().catch((err) => {
  console.error("❌ 테스트 실패:", err);
  process.exit(1);
});

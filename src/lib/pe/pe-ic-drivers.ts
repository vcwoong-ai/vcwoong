/**
 * PE IC Investment Drivers — 순수 함수(PR #108).
 *
 * "강한 시장 성장" 같은 일반적인 문구를 만들지 않는다(§5). 이 파일은
 * `buildPEThesisItems()`가 만든 thesis item 중 `status === "SUPPORTED"`인
 * 것만 driver로 승격한다 — PARTIALLY_SUPPORTED/UNSUPPORTED/CONTRADICTED는
 * 절대 driver가 되지 않는다(§5 "지어낸 driver 금지"를 타입 시스템으로도
 * 강제 — PEInvestmentDriver.status는 "SUPPORTED"만 허용).
 */

import type { PEDDCase } from "./dd-types";
import type { PEThesisItem, PEInvestmentDriver } from "./pe-ic-decision-types";

/** 이 claim을 참조하는 finding에 financialImpact가 있으면 그 metric을 노출한다(추정 아님). */
function findFinancialRelevance(claimId: string, ddCase: PEDDCase | undefined): string | undefined {
  if (!ddCase) return undefined;
  const finding = ddCase.findings.find((f) => f.claimIds.includes(claimId) && f.financialImpact);
  return finding?.financialImpact ? `${finding.financialImpact.metric} 영향` : undefined;
}

export function buildPEInvestmentDrivers(
  thesisItems: PEThesisItem[],
  ddCase: PEDDCase | undefined
): PEInvestmentDriver[] {
  return thesisItems
    .filter((t): t is PEThesisItem & { status: "SUPPORTED" } => t.status === "SUPPORTED")
    .map((t) => ({
      id: t.id,
      title: t.statement,
      description: t.statement,
      status: "SUPPORTED" as const,
      evidenceIds: t.supportingEvidenceIds,
      financialRelevance: findFinancialRelevance(t.id, ddCase),
    }));
}

/**
 * PE IC Memo — 순수 마크다운 뷰 모델(PR #108).
 *
 * `buildPEICDecision()`이 이미 조립한 `PEICDecision` 객체 하나만 입력으로
 * 받는다 — 여기서 재무/QoE/LBO/readiness를 다시 조회하거나 계산하지
 * 않는다. UI(ma-deal-ic-decision.tsx)와 이 메모는 반드시 같은
 * `PEICDecision` 인스턴스를 소비해야 한다(§10 — "UI와 export가 서로
 * 다른 결론을 만들면 안 된다") — export route(ic-memo/route.ts)가 UI와
 * 동일하게 `buildPEICDecision()`을 거친 값만 이 함수에 넘긴다.
 *
 * 정보가 없는 섹션은 억지로 채우지 않는다 — "자료 없음" 또는
 * "현재 데이터로 확인 불가"를 명시한다(§9). MOIC/IRR은 가정이 세션
 * 로컬 상태일 뿐 서버에 영속화되지 않으므로(lbo-simulator-panel.tsx),
 * "Valuation / Returns" 섹션은 항상 "현재 데이터로 확인 불가"다 —
 * 절대 계산하지 않는다.
 */

import type { PEICDecision, PEThesisItem, PEInvestmentDriver, PEThesisBreaker, PEICQuestionPriority } from "./pe-ic-decision-types";
import type { FinancialCalcResult } from "./financial-types";
import type { PEDDFinding, PEDDCategory } from "./dd-types";
import type { ICQuestion } from "./pe-ic-decision-types";
import {
  READINESS_STATE_LABEL,
  PE_DECISION_DOMAIN_LABEL,
  PE_DD_SEVERITY_LABEL,
  PE_DD_FINDING_STATUS_LABEL,
  PE_THESIS_STATUS_LABEL as THESIS_STATUS_LABEL,
  PE_THESIS_BREAKER_STATE_LABEL as BREAKER_STATE_LABEL,
  PE_IC_QUESTION_PRIORITY_LABEL as QUESTION_PRIORITY_LABEL,
} from "./ma-deal-labels";

const NO_DATA = "자료 없음";
const CANNOT_CONFIRM = "현재 데이터로 확인 불가";

function formatWon(value: number): string {
  return `${(value / 100_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}억원`;
}

function formatCalc(result: FinancialCalcResult | undefined): string {
  if (!result) return NO_DATA;
  if (result.status === "ok") return formatWon(result.value);
  if (result.status === "currency_mismatch") return `통화 불일치(${result.detail})`;
  return CANNOT_CONFIRM;
}

function findingLine(f: PEDDFinding): string {
  return `- [${PE_DD_SEVERITY_LABEL[f.severity]}/${PE_DD_FINDING_STATUS_LABEL[f.status]}] ${f.title} — ${f.description} (근거 ${f.evidenceIds.length}건)`;
}

function findingsByCategory(findings: PEDDFinding[], categories: PEDDCategory[]): string {
  const filtered = findings.filter((f) => categories.includes(f.category));
  if (filtered.length === 0) return NO_DATA;
  return filtered.map(findingLine).join("\n");
}

function thesisSection(thesis: PEThesisItem[]): string {
  if (thesis.length === 0) return `${NO_DATA} — 아직 등록된 investment thesis claim이 없습니다.`;
  return thesis
    .map((t) => `- [${THESIS_STATUS_LABEL[t.status]}/${t.materiality}] ${t.statement} (근거 ${t.supportingEvidenceIds.length}건)`)
    .join("\n");
}

function driversSection(drivers: PEInvestmentDriver[]): string {
  if (drivers.length === 0) return `${NO_DATA} — 근거로 뒷받침되는 driver가 아직 없습니다(지어내지 않음).`;
  return drivers
    .map((d) => `- ${d.title}${d.financialRelevance ? ` (${d.financialRelevance})` : ""} — 근거 ${d.evidenceIds.length}건`)
    .join("\n");
}

function breakersSection(breakers: PEThesisBreaker[]): string {
  if (breakers.length === 0) return `${NO_DATA} — 현재 등록된 thesis breaker가 없습니다.`;
  return breakers
    .map(
      (b) =>
        `- [${BREAKER_STATE_LABEL[b.currentState]}] ${b.condition} — ${b.whyItMatters}\n  - 검증 필요: ${b.verificationRequired}\n  - 영향: ${b.decisionImpact}`
    )
    .join("\n");
}

function missingInfoSection(decision: PEICDecision): string {
  const items = decision.readiness.missingInformation;
  if (items.length === 0) return `${NO_DATA} — 확인이 필요한 정보가 없습니다.`;
  const bySeverity = { MATERIAL: items.filter((i) => i.severity === "MATERIAL"), INFORMATIONAL: items.filter((i) => i.severity === "INFORMATIONAL") };
  const lines: string[] = [];
  if (bySeverity.MATERIAL.length > 0) {
    lines.push("**중요(Material):**");
    lines.push(...bySeverity.MATERIAL.map((i) => `- [${PE_DECISION_DOMAIN_LABEL[i.domain]}] ${i.reason}`));
  }
  if (bySeverity.INFORMATIONAL.length > 0) {
    lines.push("**정보성(Informational):**");
    lines.push(...bySeverity.INFORMATIONAL.map((i) => `- [${PE_DECISION_DOMAIN_LABEL[i.domain]}] ${i.reason}`));
  }
  return lines.join("\n");
}

function questionsSection(questions: ICQuestion[]): string {
  if (questions.length === 0) return `${NO_DATA} — 지금 확인이 필요한 질문이 없습니다.`;
  const byPriority: Record<PEICQuestionPriority, ICQuestion[]> = { P0: [], P1: [], P2: [] };
  for (const q of questions) byPriority[q.priority].push(q);
  const lines: string[] = [];
  for (const priority of ["P0", "P1", "P2"] as const) {
    if (byPriority[priority].length === 0) continue;
    lines.push(`**${QUESTION_PRIORITY_LABEL[priority]}:**`);
    lines.push(...byPriority[priority].map((q) => `- ${q.question}\n  - 왜 중요한가: ${q.whyItMatters}\n  - 필요한 근거: ${q.requiredEvidence}`));
  }
  return lines.join("\n");
}

function readinessSection(decision: PEICDecision): string {
  return decision.readiness.domains
    .map((d) => `- ${PE_DECISION_DOMAIN_LABEL[d.domain]}: ${READINESS_STATE_LABEL[d.status]} — ${d.reason}`)
    .join("\n");
}

function evidenceAppendixSection(decision: PEICDecision): string {
  const { evidence, dd } = decision;
  const lines = [
    `- 저장된 근거(evidence): ${evidence.evidenceCount}건`,
    `- 출처(source): ${evidence.sourceCount}건`,
    `- claim: ${evidence.claimCount}건(근거 없는 claim ${evidence.unsupportedClaimCount}건)`,
  ];
  if (dd.findings.length > 0) {
    lines.push("", "**DD finding 목록:**");
    lines.push(...dd.findings.map(findingLine));
  }
  return lines.join("\n");
}

export function buildPEICMemoMarkdown(
  decision: PEICDecision,
  maDeal: { companyName: string; name: string; dealTypeLabel: string; statusLabel: string }
): string {
  const { financial, qoe, lbo, dd, questions } = decision;

  const sections: string[] = [];

  sections.push(
    "## 1. Executive Summary",
    `**IC 프로세스 상태:** ${decision.processState}`,
    "",
    ...decision.processStateReasons.map((r) => `- ${r}`)
  );

  sections.push(
    "",
    "## 2. Deal Snapshot",
    `- 기업명: ${maDeal.companyName}`,
    `- 딜명: ${maDeal.name}`,
    `- 딜 유형: ${maDeal.dealTypeLabel}`,
    `- 상태: ${maDeal.statusLabel}`,
    `- 최근 재무기간: ${financial.latestPeriodLabel ?? NO_DATA}`
  );

  sections.push("", "## 3. Investment Thesis", thesisSection(decision.thesis));
  sections.push("", "## 4. Key Investment Drivers", driversSection(decision.drivers));
  sections.push("", "## 5. Thesis Breakers / Key Risks", breakersSection(decision.breakers));

  sections.push(
    "",
    "## 6. Financial Performance",
    `- 매출액: ${formatCalc(financial.revenue)}`,
    `- EBITDA: ${formatCalc(financial.ebitda)}`,
    `- 순차입금: ${formatCalc(financial.netDebt)}`,
    financial.hasConflict
      ? `- ⚠️ 재무 데이터 충돌 ${financial.conflictCount}건 — 값을 임의로 선택하지 않았습니다. 상세는 재무·QoE 탭 참고.`
      : "- 재무 데이터 충돌 없음"
  );

  sections.push(
    "",
    "## 7. QoE",
    qoe.hasData
      ? [
          `- Reported EBITDA: ${formatCalc(qoe.reportedEbitda)}`,
          `- Adjusted EBITDA(승인된 조정만 반영): ${formatCalc(qoe.adjustedEbitda)}`,
          `- 승인된 조정 ${qoe.approvedAdjustmentCount}건 / 전체 조정 ${qoe.totalAdjustmentCount}건`,
          `- 데이터 모델 한계: ${qoe.reviewTrackingLimitation}`,
        ].join("\n")
      : NO_DATA
  );

  sections.push("", "## 8. Commercial / Operational DD", findingsByCategory(dd.findings, ["COMMERCIAL", "OPERATIONAL"]));
  sections.push(
    "",
    "## 9. Legal / Tax / HR / Technology / Regulatory DD",
    findingsByCategory(dd.findings, ["LEGAL", "TAX", "HR", "TECHNOLOGY", "IT_SECURITY", "REGULATORY", "ESG", "MANAGEMENT", "OTHER"])
  );

  const lboLines: string[] = [
    lbo.entryEbitdaStatus === "ok" ? `- Entry EBITDA: ${lbo.entryEbitdaInEok!.toLocaleString(undefined, { maximumFractionDigits: 1 })}억원` : CANNOT_CONFIRM,
  ];
  // upstreamBlocked — 상위 재무 데이터가 모순(BLOCKED) 상태면 Entry EBITDA가
  // 계산 가능하더라도(다른 계정의 문제라도) 신뢰할 수 없다는 경고를 반드시
  // 함께 보여준다(§9 — 값을 숨기지 않되 신뢰도 맥락 없이 단독으로 보여주지
  // 않는다, PR #108 최종 리뷰에서 발견).
  if (lbo.entryEbitdaStatus === "ok" && lbo.upstreamBlocked) {
    lboLines.push("- ⚠️ 상위 재무 데이터에 모순(BLOCKED)이 있어 이 값은 현재 신뢰할 수 없습니다 — Executive Summary/Decision Readiness 참고");
  }
  lboLines.push(
    lbo.assumptionsMissing
      ? `- 미입력 가정: ${lbo.missingAssumptionLabels.join(", ")} — LBO 탭에서 IC가 직접 입력해야 합니다(자동 산정 안 함)`
      : "- 필요한 LBO 가정이 모두 입력됨"
  );
  sections.push("", "## 10. LBO / Transaction Structure", ...lboLines);

  // 11. Valuation / Returns — MOIC/IRR은 절대 계산하지 않는다(§9/§Step10 CRITICAL)
  sections.push("", "## 11. Valuation / Returns", CANNOT_CONFIRM + " — MOIC/IRR은 LBO 탭에서 가정을 직접 입력해 확인해야 합니다(이 메모는 계산하지 않습니다).");

  sections.push("", "## 12. Missing Information", missingInfoSection(decision));
  sections.push("", "## 13. IC Questions", questionsSection(questions));
  sections.push("", "## 14. Decision Readiness", readinessSection(decision));
  sections.push("", "## 15. Appendix / Evidence", evidenceAppendixSection(decision));

  return sections.join("\n");
}

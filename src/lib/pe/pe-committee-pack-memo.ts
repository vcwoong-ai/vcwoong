/**
 * PE Committee Pack — 순수 마크다운 뷰 모델(PR #110).
 *
 * `buildPECommitteePack()`이 이미 조립한 `PECommitteePack` 객체 하나만
 * 입력으로 받는다 — 여기서 재무/QoE/LBO/readiness/review를 다시 조회하거나
 * 계산하지 않는다(pe-ic-memo.ts와 동일 원칙, §10/§Step6). 화면("위원회
 * 자료" 탭)/print/DOCX/PPTX가 전부 같은 `PECommitteePack` 인스턴스에서
 * 파생돼야 한다.
 *
 * IC Memo(pe-ic-memo.ts, 16섹션 상세 분석)와는 성격이 다르다(§Step16) —
 * 이 마크다운은 위원회 심의용으로 압축된 14섹션이다. 두 파일이 로직을
 * 공유하지 않는 이유: IC Memo는 원본 결정 로직 감사용(모든 세부 근거
 * 노출), Committee Pack은 심의 시간에 바로 훑어볼 요약본 — 목적이 달라
 * 섹션 구성과 문구 밀도가 의도적으로 다르다. 둘 다 데이터 소스
 * (buildPEICDecision())는 동일하다.
 */

import type { PECommitteePack } from "./pe-committee-pack-types";
import type { PEThesisItem, PEInvestmentDriver, PEThesisBreaker, PEICQuestionPriority, ICQuestion } from "./pe-ic-decision-types";
import type { PEICReviewItem } from "./pe-ic-review-types";
import { PE_DD_SEVERITY_LABEL, PE_DD_FINDING_STATUS_LABEL, PE_IC_QUESTION_PRIORITY_LABEL, PE_IC_REVIEW_ITEM_STATUS_LABEL } from "./ma-deal-labels";

const NO_DATA = "자료 없음";
const CANNOT_CONFIRM = "현재 데이터로 확인 불가";

function formatWon(value: number): string {
  return `${(value / 100_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}억원`;
}

function formatCalc(result: { status: string; value?: number; detail?: string } | undefined): string {
  if (!result) return NO_DATA;
  if (result.status === "ok" && result.value !== undefined) return formatWon(result.value);
  if (result.status === "currency_mismatch") return `통화 불일치(${result.detail ?? ""})`;
  return CANNOT_CONFIRM;
}

function thesisSection(thesis: PEThesisItem[]): string {
  const supported = thesis.filter((t) => t.status === "SUPPORTED");
  if (supported.length === 0) return `${NO_DATA} — 근거로 뒷받침되는 investment thesis가 아직 없습니다.`;
  return supported.map((t) => `- ${t.statement}`).join("\n");
}

function driversSection(drivers: PEInvestmentDriver[]): string {
  if (drivers.length === 0) return `${NO_DATA} — 근거로 뒷받침되는 driver가 아직 없습니다.`;
  return drivers.map((d) => `- ${d.title}${d.financialRelevance ? ` (${d.financialRelevance})` : ""}`).join("\n");
}

function breakersSection(breakers: PEThesisBreaker[]): string {
  const material = breakers.filter((b) => b.currentState === "OPEN" || b.currentState === "CANNOT_BE_ESTABLISHED");
  if (material.length === 0) return `${NO_DATA} — 현재 미해결 thesis breaker가 없습니다.`;
  return material.map((b) => `- ${b.condition} — ${b.decisionImpact}`).join("\n");
}

function ddSection(pack: PECommitteePack): string {
  const { dd } = pack.decision;
  if (dd.findings.length === 0) return `${NO_DATA} — 등록된 DD finding이 없습니다.`;
  return dd.findings
    .map((f) => `- [${PE_DD_SEVERITY_LABEL[f.severity]}/${PE_DD_FINDING_STATUS_LABEL[f.status]}] ${f.title}`)
    .join("\n");
}

function evidenceSection(pack: PECommitteePack): string {
  const { evidence } = pack.decision;
  return [
    `- 저장된 근거: ${evidence.evidenceCount}건`,
    `- 출처: ${evidence.sourceCount}건`,
    `- claim: ${evidence.claimCount}건(근거 없는 claim ${evidence.unsupportedClaimCount}건)`,
    pack.decision.financial.hasConflict
      ? `- ⚠️ 재무 데이터 충돌 ${pack.decision.financial.conflictCount}건`
      : "- 재무 데이터 충돌 없음",
  ].join("\n");
}

function reviewItemLine(item: PEICReviewItem): string {
  return `- [${PE_IC_REVIEW_ITEM_STATUS_LABEL[item.status]}] ${item.title}`;
}

function icReviewSection(pack: PECommitteePack): string {
  const { review } = pack;
  const lines: string[] = [`- 전체 검토 상태: ${review.overallState}`];
  if (review.openItems.length === 0) {
    lines.push("- 미해결 항목 없음");
  } else {
    lines.push(`- 미해결 항목 ${review.openItems.length}건:`, ...review.openItems.map(reviewItemLine));
  }
  lines.push(`- 근거 요청 ${review.evidenceRequests.length}건, 최근 해소된 항목 ${review.resolvedItems.length}건`);
  return lines.join("\n");
}

function questionsSection(questions: ICQuestion[]): string {
  if (questions.length === 0) return `${NO_DATA} — 지금 확인이 필요한 질문이 없습니다.`;
  const byPriority: Record<PEICQuestionPriority, ICQuestion[]> = { P0: [], P1: [], P2: [] };
  for (const q of questions) byPriority[q.priority].push(q);
  const lines: string[] = [];
  for (const priority of ["P0", "P1", "P2"] as const) {
    if (byPriority[priority].length === 0) continue;
    lines.push(`**${PE_IC_QUESTION_PRIORITY_LABEL[priority]}:**`);
    lines.push(...byPriority[priority].map((q) => `- ${q.question}`));
  }
  return lines.join("\n");
}

export function buildPECommitteePackMarkdown(pack: PECommitteePack): string {
  const { deal, decision } = pack;
  const sections: string[] = [];

  sections.push(
    "## 1. Cover",
    `**${deal.companyName}** — ${deal.dealName}`,
    `${deal.dealTypeLabel} · ${deal.statusLabel}`,
    `생성 시각: ${new Date(pack.generatedAt).toLocaleString("ko-KR")}`
  );

  sections.push(
    "",
    "## 2. Deal Snapshot",
    `- 기업명: ${deal.companyName}`,
    `- 딜명: ${deal.dealName}`,
    `- 딜 유형: ${deal.dealTypeLabel}`,
    `- 상태: ${deal.statusLabel}`
  );

  sections.push(
    "",
    "## 3. Decision Readiness",
    `**IC 검토 상태:** ${pack.currentReviewStateLabel}`,
    "",
    ...decision.processStateReasons.map((r) => `- ${r}`)
  );

  sections.push("", "## 4. Investment Thesis", thesisSection(decision.thesis));
  sections.push("", "## 5. Key Drivers", driversSection(decision.drivers));
  sections.push("", "## 6. Thesis Breakers", breakersSection(decision.breakers));

  sections.push(
    "",
    "## 7. Financials",
    `- 매출액: ${formatCalc(decision.financial.revenue)}`,
    `- EBITDA: ${formatCalc(decision.financial.ebitda)}`,
    `- 순차입금: ${formatCalc(decision.financial.netDebt)}`
  );

  sections.push(
    "",
    "## 8. QoE",
    decision.qoe.hasData
      ? [
          `- Reported EBITDA: ${formatCalc(decision.qoe.reportedEbitda)}`,
          `- Adjusted EBITDA: ${formatCalc(decision.qoe.adjustedEbitda)}`,
          `- 승인된 조정 ${decision.qoe.approvedAdjustmentCount}건 / 전체 ${decision.qoe.totalAdjustmentCount}건`,
        ].join("\n")
      : NO_DATA
  );

  const lboLines = [
    decision.lbo.entryEbitdaStatus === "ok"
      ? `- Entry EBITDA: ${decision.lbo.entryEbitdaInEok!.toLocaleString(undefined, { maximumFractionDigits: 1 })}억원`
      : CANNOT_CONFIRM,
  ];
  if (decision.lbo.entryEbitdaStatus === "ok" && decision.lbo.upstreamBlocked) {
    lboLines.push("- ⚠️ 상위 재무 데이터 모순으로 이 값은 현재 신뢰할 수 없습니다");
  }
  lboLines.push(
    decision.lbo.assumptionsMissing
      ? `- 미입력 가정: ${decision.lbo.missingAssumptionLabels.join(", ")}`
      : "- 필요한 LBO 가정이 모두 입력됨"
  );
  lboLines.push(`- MOIC/IRR: ${CANNOT_CONFIRM}(이 자료는 계산하지 않습니다)`);
  sections.push("", "## 9. LBO / Transaction Structure", ...lboLines);

  sections.push("", "## 10. DD", ddSection(pack));
  sections.push("", "## 11. Evidence", evidenceSection(pack));
  sections.push("", "## 12. IC Review", icReviewSection(pack));
  sections.push("", "## 13. IC Questions", questionsSection(decision.questions));
  sections.push("", "## 14. Current State", pack.currentReviewStateLabel);

  return sections.join("\n");
}

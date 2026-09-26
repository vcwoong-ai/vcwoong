/**
 * PE Due Diligence Framework — Evidence Lineage(PR-F) 연결(PR-G).
 *
 * `validatePEEvidenceLineage()`(evidence-lineage.ts, PR-F)를 그대로 호출한다
 * — PR-F의 참조 무결성 규칙을 다시 구현하지 않는다. 이 파일이 새로 하는
 * 일은: DD Finding이 그 PR-F 그래프의 실제 노드(evidence/claim/period/
 * adjustment/lboBridge)를 올바르게 참조하는지, 그리고 DD 고유의 lifecycle
 * 규칙(status별 근거 요구사항)을 지키는지 검증하는 것뿐이다.
 */

import { validatePEEvidenceLineage } from "./evidence-lineage";
import type { PEEvidenceLineage } from "./evidence-lineage-types";
import {
  PE_DD_LBO_IMPACT_TARGETS,
  requiresEvidenceForStatus,
  type PEDDCase,
  type PEDDFinding,
  type PEDDValidationIssue,
  type PEDDValidationResult,
} from "./dd-types";

/** 계산 없는 순수 조립 — evidence-lineage.ts의 buildPEEvidenceLineage()와 같은 성격. */
export function buildPEDDCase(lineage: PEEvidenceLineage, findings: PEDDFinding[] = []): PEDDCase {
  return { lineage, findings };
}

/**
 * §13 전체 규칙을 검증한다:
 * - Evidence/Claim 존재 여부(dangling_evidence/dangling_claim)
 * - Period 유효성 + Finding↔Claim 간 period mismatch(§13 Period)
 * - financialImpact의 통화/기간(§13 Currency) + sourceAdjustmentId 존재 여부
 * - lboImpact의 target 유효성 + lboBridgeLineageId 존재 여부(§13 LBO)
 * - status별 근거 요구 위반(§14, requiresEvidenceForStatus)
 *
 * fiscalYear/periodType 일관성(§13 Period)은 별도 검사를 두지 않는다 —
 * Finding/financialImpact는 PR-F의 `periods` 레지스트리가 갖는
 * financialPeriodId만 참조하고 fiscalYear/periodType을 중복 저장하지
 * 않으므로(evidence-lineage-types.ts와 동일 설계 원칙), 애초에 불일치가
 * 생길 자리가 없다.
 *
 * Cross-domain 규칙(§13: COMMERCIAL finding이 자동으로 FINANCIAL impact를
 * 만들면 안 됨)도 별도 런타임 검사가 필요 없다 — 이 파일 어디에도 category로부터
 * financialImpact/lboImpact를 자동 생성하는 코드가 없다(모든 연결은 호출자가
 * `createPEDDFinding()`에 explicit하게 넘긴 값뿐이다).
 */
export function validatePEDDCase(ddCase: PEDDCase): PEDDValidationResult {
  const issues: PEDDValidationIssue[] = [];

  const lineageResult = validatePEEvidenceLineage(ddCase.lineage);
  if (lineageResult.status === "invalid") {
    issues.push({
      rule: "lineage_invalid",
      detail: `PR-F Evidence Lineage 자체가 invalid합니다(${lineageResult.issues.length}건) — 먼저 evidence-lineage.ts 기준으로 lineage를 수정하세요: ${lineageResult.issues.map((i) => i.rule).join(", ")}`,
    });
  }

  const evidenceById = new Map(ddCase.lineage.evidence.map((e) => [e.id, e]));
  const claimById = new Map(ddCase.lineage.claims.map((c) => [c.id, c]));
  const periodById = new Map(ddCase.lineage.periods.map((p) => [p.id, p]));
  const adjustmentById = new Map(ddCase.lineage.adjustments.map((a) => [a.id, a]));
  const lboBridgeById = new Map(ddCase.lineage.lboBridges.map((b) => [b.id, b]));

  for (const finding of ddCase.findings) {
    for (const evId of finding.evidenceIds) {
      if (!evidenceById.has(evId)) {
        issues.push({ rule: "dangling_evidence", findingId: finding.id, evidenceId: evId });
      }
    }

    for (const claimId of finding.claimIds) {
      const claim = claimById.get(claimId);
      if (!claim) {
        issues.push({ rule: "dangling_claim", findingId: finding.id, claimId });
        continue;
      }
      if (
        finding.financialPeriodId !== undefined &&
        claim.financialPeriodId !== undefined &&
        claim.financialPeriodId !== finding.financialPeriodId
      ) {
        issues.push({
          rule: "period_mismatch",
          findingId: finding.id,
          detail: `Finding 기간(${finding.financialPeriodId})이 연결된 Claim ${claim.id}의 기간(${claim.financialPeriodId})과 다릅니다`,
        });
      }
    }

    if (finding.financialPeriodId !== undefined && !periodById.has(finding.financialPeriodId)) {
      issues.push({
        rule: "dangling_period",
        findingId: finding.id,
        financialPeriodId: finding.financialPeriodId,
      });
    }

    if (finding.financialImpact) {
      const impact = finding.financialImpact;
      const period = periodById.get(impact.financialPeriodId);
      if (!period) {
        issues.push({
          rule: "dangling_period",
          findingId: finding.id,
          financialPeriodId: impact.financialPeriodId,
        });
      } else if (period.currency !== impact.currency) {
        issues.push({
          rule: "currency_mismatch",
          findingId: finding.id,
          detail: `financialImpact 통화(${impact.currency})가 기간 통화(${period.currency})와 다릅니다`,
        });
      }
      if (impact.sourceAdjustmentId !== undefined && !adjustmentById.has(impact.sourceAdjustmentId)) {
        issues.push({
          rule: "dangling_adjustment",
          findingId: finding.id,
          adjustmentId: impact.sourceAdjustmentId,
        });
      }
    }

    if (finding.lboImpact) {
      const lbo = finding.lboImpact;
      if (!(PE_DD_LBO_IMPACT_TARGETS as readonly string[]).includes(lbo.affectedTarget)) {
        issues.push({ rule: "invalid_lbo_target", findingId: finding.id, target: lbo.affectedTarget });
      }
      if (lbo.lboBridgeLineageId !== undefined && !lboBridgeById.has(lbo.lboBridgeLineageId)) {
        issues.push({
          rule: "dangling_lbo_bridge",
          findingId: finding.id,
          lboBridgeLineageId: lbo.lboBridgeLineageId,
        });
      }
    }

    if (
      requiresEvidenceForStatus(finding.status) &&
      finding.evidenceIds.length === 0 &&
      finding.claimIds.length === 0
    ) {
      issues.push({ rule: "missing_evidence_for_status", findingId: finding.id, status: finding.status });
    }
  }

  return issues.length === 0 ? { status: "ok" } : { status: "invalid", issues };
}

/** evidence도 claim도 없는 finding(§14) — DRAFT/IN_REVIEW/REJECTED에서는 정상일 수 있다. */
export function findOrphanFindings(ddCase: PEDDCase): PEDDFinding[] {
  return ddCase.findings.filter((f) => f.evidenceIds.length === 0 && f.claimIds.length === 0);
}

/** status가 근거를 요구하는데(CONFIRMED 이상) 근거가 없는 finding만 골라낸다(§14). */
export function findUnsupportedFindings(ddCase: PEDDCase): PEDDFinding[] {
  return ddCase.findings.filter(
    (f) => requiresEvidenceForStatus(f.status) && f.evidenceIds.length === 0 && f.claimIds.length === 0
  );
}

/** validatePEDDCase()가 찾아낸 이슈 중 참조 무결성(dangling_*) 위반만 골라낸다(§14). */
export function findDanglingReferences(ddCase: PEDDCase): PEDDValidationIssue[] {
  const result = validatePEDDCase(ddCase);
  if (result.status === "ok") return [];
  return result.issues.filter((i) => i.rule.startsWith("dangling"));
}

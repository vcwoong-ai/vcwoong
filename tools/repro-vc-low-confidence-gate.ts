/** Diagnostic only: reproduce the existing confidence/gate mismatch without changing engine policy. */
import assert from 'node:assert/strict';
import { buildScoreEvidenceAssessment } from '../src/lib/deal-scoring-evidence';
import { buildInvestmentDecision } from '../src/lib/vc-decision';
import { checkVCDecisionGate } from '../src/lib/vc-decision-gate';
import type { NumericClaim } from '../src/lib/evidence';

const claims: NumericClaim[] = [{
  sectionKey: 'COMPANY_OVERVIEW', raw: '임직원 23명', label: '임직원', value: '23', unit: '명',
  status: 'document', claimType: 'numeric', confidence: 'LOW', matchMethod: 'adjacent_sentence',
  claimKey: 'synthetic-low-confidence-team', source: { documentName: '합성 예시', snippet: '임직원 관련 근거' },
}];
const scores = { marketSize: 50, team: 50, product: 50, businessModel: 50, financials: 50, moat: 50 };
const assessment = buildScoreEvidenceAssessment(scores, {}, claims);
const decision = buildInvestmentDecision(50, assessment, {}, claims, [], {});
const gate = checkVCDecisionGate(decision);
assert.equal(assessment.dimensions.team.confidence, 'HIGH');
assert.equal(decision.decisionDimensions.find(d => d.dimension === 'team')?.positiveDrivers.length, 0);
assert.equal(gate.reason, 'VERIFIED_DIMENSION_WITHOUT_EVIDENCE');
console.log(JSON.stringify({ reproduced: true, assessmentConfidence: assessment.dimensions.team.confidence, claimConfidence: claims[0].confidence, gate }));

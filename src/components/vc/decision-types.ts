import type { DecisionQuestionLink } from "@/lib/vc-decision-loader";
import type { VCDecisionMemoSectionRef } from "@/lib/vc-decision-memo";
import type { VCDecisionGateResult } from "@/lib/vc-decision-gate";
import type { VCInvestmentDecision } from "@/lib/vc-decision-types";

/** GET /api/reports/[id]/decision 응답 — canonical 엔진의 결과를 그대로 담는다(화면은 다시 계산하지 않는다). */
export interface DecisionApiData {
  deal: {
    id: string;
    companyName: string;
    sector: string;
    stage: string;
    investRound: string | null;
    investAmount: number | null;
    valuation: number | null;
  };
  decision: VCInvestmentDecision;
  gate: VCDecisionGateResult;
  sectionRefs: VCDecisionMemoSectionRef[];
  hasScore: boolean;
  scoreOverall: number | null;
  assessmentBasis: "report_evidence" | "no_report" | null;
  questionsGenerated: boolean;
  questionsSource: "stored" | "deterministic_preview" | "none";
  questionLinks: DecisionQuestionLink[];
  documentCount: number;
}

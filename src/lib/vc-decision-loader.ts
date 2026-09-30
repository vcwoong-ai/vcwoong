/**
 * VC Investment Decision — 서버측 단일 조립 경로.
 *
 * 화면(GET /api/reports/[id]/decision)과 export(report-export-common.ts)가
 * 같은 입력 조립·같은 canonical 엔진(buildInvestmentDecision)·같은 게이트를
 * 쓰도록 한 곳으로 모은다. 예전에는 화면(클라이언트)과 export(서버)가 각자
 * 입력을 모아 같은 함수를 호출해서, 입력 조립이 어긋나면 두 곳이 서로 다른
 * 결론을 낼 수 있었다. 여기에는 새 계산도, AI 호출도 없다.
 */
import { traceReportEvidence, type EvidenceReport } from "./evidence";
import { verdictsToMap } from "./evidence-ai";
import type { ScoreEvidenceAssessment } from "./deal-scoring-evidence";
import type { ScoreDimensionKey } from "./deal-scoring-shared";
import type { IcQuestion } from "./ic-questions";
import { buildContradictions, buildInvestmentDecision } from "./vc-decision";
import { buildDeterministicIcQuestions } from "./ic-questions";
import { checkVCDecisionGate, type VCDecisionGateResult } from "./vc-decision-gate";
import { buildDecisionMemoSectionRefs, type VCDecisionMemoSectionRef } from "./vc-decision-memo";
import type { VCInvestmentDecision } from "./vc-decision-types";
import type { SectionKey } from "@prisma/client";

/** loadReportForExport()와 GET /decision이 공통으로 조회하는 Prisma 결과의 필요한 부분만. */
export interface ReportForDecision {
  sections: Array<{ sectionKey: SectionKey | string; title: string; content: string }>;
  deal: {
    investAmount: number | null;
    valuation: number | null;
    documents: Array<{ id?: string; name: string; parsedText: string | null }>;
    score: { overall: number; rationale: unknown; evidenceAssessment: unknown } | null;
  };
  evidenceCheck: { verdicts: unknown } | null;
  icQuestions: { questions: unknown } | null;
}

/**
 * 결정 계산에 필요한 보고서 조회 범위 — GET /api/reports/[id]/decision과
 * 목록 배치 조회(GET /api/deals/decision-summaries)가 같은 범위를 쓴다.
 * parsedText는 근거 대조에 필요하므로 포함하되, 화면 응답에는 싣지 않는다.
 */
export const REPORT_FOR_DECISION_INCLUDE = {
  sections: { orderBy: { order: "asc" as const }, select: { sectionKey: true, title: true, content: true } },
  deal: {
    select: {
      id: true,
      companyName: true,
      sector: true,
      stage: true,
      investRound: true,
      investAmount: true,
      valuation: true,
      documents: { select: { id: true, name: true, parsedText: true } },
      score: { select: { overall: true, rationale: true, evidenceAssessment: true } },
    },
  },
  evidenceCheck: { select: { verdicts: true } },
  icQuestions: { select: { questions: true } },
} as const;

export type DecisionQuestionLinkKind = "contradiction" | "thesis_breaker" | "missing_information";

export interface DecisionQuestionLink {
  question: IcQuestion;
  /** 이 질문이 풀어야 하는 결정 이슈들 — 연결이 없으면 빈 배열(지어내지 않는다) */
  linkedTo: Array<{ kind: DecisionQuestionLinkKind; label: string }>;
}

const QUESTION_PRIORITY_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;

/**
 * IC 질문을 "어떤 결정 이슈를 풀기 위한 질문인가"와 함께 보여주기 위한 연결표.
 * 새 질문을 만들지 않는다 — 이미 decision(상충/Thesis Breaker/누락정보)에 붙어 있는
 * icQuestion과 저장된 질문의 id 일치만 사용한다. 저장된 질문 중 어떤 결정 이슈와도
 * 연결되지 않은 것은 linkedTo가 비어 있는 채로(연결을 지어내지 않고) 뒤에 둔다.
 */
export function buildDecisionQuestionLinks(
  decision: VCInvestmentDecision,
  storedQuestions: IcQuestion[] | null
): DecisionQuestionLink[] {
  const byId = new Map<string, DecisionQuestionLink>();
  const add = (q: IcQuestion | undefined, kind: DecisionQuestionLinkKind, label: string) => {
    if (!q) return;
    const entry = byId.get(q.id) ?? { question: q, linkedTo: [] };
    if (!entry.linkedTo.some((l) => l.kind === kind && l.label === label)) entry.linkedTo.push({ kind, label });
    byId.set(q.id, entry);
  };
  for (const c of decision.contradictions) add(c.icQuestion, "contradiction", `${c.metricLabel} 수치 상충`);
  for (const b of decision.thesisBreakers) add(b.icQuestion, "thesis_breaker", b.title);
  for (const m of decision.missingInformation) add(m.icQuestion, "missing_information", `[${m.priority}] ${m.item}`);
  for (const q of storedQuestions ?? []) {
    if (!byId.has(q.id)) byId.set(q.id, { question: q, linkedTo: [] });
  }
  return Array.from(byId.values()).sort((a, b) => {
    const linked = Number(b.linkedTo.length > 0) - Number(a.linkedTo.length > 0);
    if (linked !== 0) return linked;
    return QUESTION_PRIORITY_RANK[b.question.priority] - QUESTION_PRIORITY_RANK[a.question.priority];
  });
}

export interface ReportDecisionResult {
  decision: VCInvestmentDecision;
  gate: VCDecisionGateResult;
  evidence: EvidenceReport;
  sectionRefs: VCDecisionMemoSectionRef[];
  hasScore: boolean;
  scoreOverall: number | null;
  /** 근거 평가가 어떤 기준으로 산출됐는지("no_report"면 보고서 없이 채점됨) */
  assessmentBasis: ScoreEvidenceAssessment["basis"] | null;
  /** 사용자가 생성해 저장한 IC 질문이 있는가 */
  questionsGenerated: boolean;
  /** 결정에 연결된 질문의 출처 — 저장 전에는 같은 결정적 함수로 계산한 미리보기(AI 문장 다듬기 전) */
  questionsSource: "stored" | "deterministic_preview" | "none";
  /** IC 질문 ↔ 결정 이슈 연결 */
  questionLinks: DecisionQuestionLink[];
}

export function computeReportDecision(report: ReportForDecision): ReportDecisionResult {
  const evidence = traceReportEvidence(
    report.sections.map((s) => ({ sectionKey: s.sectionKey, content: s.content })),
    report.deal.documents,
    { investAmount: report.deal.investAmount, valuation: report.deal.valuation },
    verdictsToMap(report.evidenceCheck?.verdicts)
  );
  const score = report.deal.score;
  const assessment = (score?.evidenceAssessment ?? null) as ScoreEvidenceAssessment | null;
  const rationale = (score?.rationale ?? {}) as Partial<Record<ScoreDimensionKey, string>>;
  const storedQuestions = (report.icQuestions?.questions ?? null) as IcQuestion[] | null;
  // 저장된 질문이 없으면 생성 API가 쓰는 것과 같은 결정적 함수로 미리보기를 계산한다(AI·DB 쓰기 없음).
  // 그래야 "질문을 눌러 생성하기 전에는 결정 화면의 질문이 비어 있는" 상태가 되지 않고,
  // 화면·API·DOCX가 같은 로더를 쓰므로 세 곳의 질문이 항상 일치한다.
  const previewQuestions = assessment
    ? buildDeterministicIcQuestions(rationale, assessment, { investAmount: report.deal.investAmount, valuation: report.deal.valuation }, buildContradictions(evidence.claims))
    : null;
  const questions = storedQuestions ?? previewQuestions;

  const decision = buildInvestmentDecision(
    score?.overall ?? 0,
    assessment,
    rationale,
    evidence.claims,
    questions,
    { investAmount: report.deal.investAmount, valuation: report.deal.valuation }
  );
  const sectionRefs = buildDecisionMemoSectionRefs(
    report.sections.map((s) => ({ sectionKey: s.sectionKey as SectionKey, title: s.title }))
  );

  return {
    decision,
    gate: checkVCDecisionGate(decision),
    evidence,
    sectionRefs,
    hasScore: score != null,
    scoreOverall: score?.overall ?? null,
    assessmentBasis: assessment?.basis ?? null,
    questionsGenerated: storedQuestions != null,
    questionsSource: storedQuestions ? "stored" : previewQuestions && previewQuestions.length > 0 ? "deterministic_preview" : "none",
    questionLinks: buildDecisionQuestionLinks(decision, questions),
  };
}

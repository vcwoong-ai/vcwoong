"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { DealScoreRadar } from "@/components/deals/deal-score-radar";
import {
  Loader2,
  Target,
  TrendingUp,
  ShieldAlert,
  ListChecks,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  computeInvestmentSignal,
  computeRecommendation,
  selectMustAnswerQuestions,
  selectUnresolvedEvidence,
  INVESTMENT_SIGNAL_LABEL,
  IC_RECOMMENDATION_LABEL,
} from "@/lib/ic-review";
import { buildInvestmentDecision } from "@/lib/vc-decision";
import { checkVCDecisionGate } from "@/lib/vc-decision-gate";
import { VC_EVIDENCE_STATE_LABEL, VC_PRIORITY_LABEL } from "@/lib/vc-decision-types";
import type { ScoreDimensionKey } from "@/lib/deal-scoring-shared";
import type { ScoreEvidenceAssessment } from "@/lib/deal-scoring-evidence";
import type { NumericClaim } from "@/lib/evidence";
import type { IcQuestion, QuestionPriority } from "@/lib/ic-questions";

const EVIDENCE_STATE_CLASS: Record<string, string> = {
  VERIFIED: "bg-green-50 text-green-700 border-green-200",
  PARTIALLY_VERIFIED: "bg-blue-50 text-blue-700 border-blue-200",
  UNVERIFIED: "bg-amber-50 text-amber-700 border-amber-200",
  MISSING: "bg-gray-50 text-gray-500 border-gray-200",
  CONTRADICTED: "bg-red-50 text-red-700 border-red-200",
};

const PRIORITY_TONE: Record<string, string> = {
  P0: "bg-red-50 text-red-700 border-red-200",
  P1: "bg-amber-50 text-amber-700 border-amber-200",
  P2: "bg-gray-50 text-gray-600 border-gray-200",
};

interface DealScoreData {
  overall: number;
  rationale: Partial<Record<ScoreDimensionKey, string>>;
  evidenceAssessment?: ScoreEvidenceAssessment | null;
}

const PRIORITY_CLASS: Record<QuestionPriority, string> = {
  HIGH: "bg-red-50 text-red-700 border-red-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  LOW: "bg-gray-50 text-gray-600 border-gray-200",
};

/**
 * Phase 3~5(Evidence/Score/IC Questions)가 이미 계산해둔 결과만 한 화면에
 * 모은다 — 새 AI 호출 없음. 실제 계산(순위·신호·연결)은 src/lib/ic-review.ts
 * 순수 함수가 전부 담당하고, 여기서는 3개의 기존 API(딜 점수·보고서 근거·
 * IC 질문 — 전부 report/deal 페이지에서 이미 쓰이는 인증된 엔드포인트)를
 * 불러 그 함수들에 넘기기만 한다.
 *
 * 기존 상세 패널(DealScoreRadar/ReportEvidencePanel/IcQuestionsPanel)은
 * 삭제하지 않는다 — 이 패널은 빠른 판단용 요약이고, 상세는 그 패널들에서
 * drill-down한다. 레이더는 시각적으로 무거워 기본 접힘 상태로 둔다.
 */
export function IcReviewPanel({
  reportId,
  dealId,
  canEdit,
}: {
  reportId: string;
  dealId: string;
  canEdit: boolean;
}) {
  const [score, setScore] = useState<DealScoreData | null>(null);
  const [dealFacts, setDealFacts] = useState<{ investAmount?: number | null; valuation?: number | null }>({});
  const [claims, setClaims] = useState<NumericClaim[] | null>(null);
  const [questions, setQuestions] = useState<IcQuestion[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [radarExpanded, setRadarExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [scoreRes, evidenceRes, questionsRes] = await Promise.all([
        fetch(`/api/deals/${dealId}/score`),
        fetch(`/api/reports/${reportId}/evidence`),
        fetch(`/api/reports/${reportId}/ic-questions`),
      ]);
      const [scoreJson, evidenceJson, questionsJson] = await Promise.all([
        scoreRes.ok ? scoreRes.json() : { data: null },
        evidenceRes.ok ? evidenceRes.json() : { data: null },
        questionsRes.ok ? questionsRes.json() : { data: null },
      ]);
      setScore(scoreJson.data ?? null);
      setDealFacts(scoreJson.dealFacts ?? {});
      setClaims(evidenceJson.data?.claims ?? null);
      setQuestions(questionsJson.data?.questions ?? null);
    } finally {
      setLoading(false);
    }
  }, [dealId, reportId]);

  useEffect(() => {
    load();
  }, [load]);

  const assessment = score?.evidenceAssessment ?? null;
  const overallConfidence = assessment?.overallConfidence ?? "NO_EVIDENCE";
  const signal = score ? computeInvestmentSignal(score.overall, overallConfidence) : null;
  const recommendation = signal ? computeRecommendation(signal, assessment?.riskFlags ?? []) : null;

  const mustAnswer = useMemo(() => selectMustAnswerQuestions(questions), [questions]);
  const unresolved = useMemo(() => selectUnresolvedEvidence(claims, questions), [claims, questions]);

  // PR-J: Investment Decision — 위 값들(assessment/claims/questions)을 새로
  // 계산하지 않고 그대로 재구성한다(vc-decision.ts는 순수 함수, 새 AI 호출 없음).
  const decision = useMemo(
    () =>
      score
        ? buildInvestmentDecision(score.overall, assessment, score.rationale, claims, questions, dealFacts)
        : null,
    [score, assessment, claims, questions, dealFacts]
  );

  // PR-J.1: 계산된 decision을 화면에 그대로 신뢰하지 않고, 자체 계약 위반을
  // 방어적으로 재확인한다(vc-decision-gate.ts). 실패하면 그 내용을 신뢰
  // 가능한 것처럼 보여주지 않고 명시적으로 경고만 표시한다.
  const gate = useMemo(() => (decision ? checkVCDecisionGate(decision) : null), [decision]);

  const hasP0MissingInfo = decision?.missingInformation.some((m) => m.priority === "P0") ?? false;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        IC Review 불러오는 중...
      </div>
    );
  }

  if (!score) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2 font-medium text-gray-900">
          <Target className="w-4 h-4" />
          IC Review
        </div>
        <p className="mt-2 text-sm text-gray-400">
          아직 투자 매력도 점수가 계산되지 않았습니다. 아래에서 먼저 계산하면 강점·리스크·확인
          필요 항목이 채워집니다.
        </p>
        <div className="mt-3">
          <DealScoreRadar dealId={dealId} canEdit={canEdit} />
        </div>
      </div>
    );
  }

  const evidenceMissing = !assessment || assessment.basis === "no_report";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 font-medium text-gray-900">
          <Target className="w-4 h-4" />
          IC Review
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {signal && (
            <Badge variant="outline" className={INVESTMENT_SIGNAL_LABEL[signal].className}>
              {INVESTMENT_SIGNAL_LABEL[signal].label}
            </Badge>
          )}
          {recommendation && <Badge variant="secondary">{IC_RECOMMENDATION_LABEL[recommendation]}</Badge>}
        </div>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">
        이 딜은 지금 무엇이 강점이고, 무엇이 위험하며, 투자 전에 무엇을 반드시 확인해야 하는지 —
        이미 계산된 Score·근거·IC 질문을 한 화면에 모았습니다. 최종 투자 판단은 심사역의 몫입니다.
      </p>

      {decision && gate && !gate.ok && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2.5 py-1.5">
          Investment Decision 계산 결과가 자체 일관성 검증을 통과하지 못했습니다
          ({gate.reason}) — 아래 Investment Decision 요약은 표시하지 않습니다. 이 문제는
          엔지니어링 확인이 필요합니다.
        </p>
      )}

      {decision && gate?.ok && (
        <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4 space-y-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Investment Decision</div>
          <p className="text-sm text-gray-800 leading-relaxed">{decision.thesis}</p>

          {hasP0MissingInfo && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
              ⚠ 결정을 막는(P0) 정보 공백이 있습니다 — 아래 AI 작성 보고서 본문(투자의견 등)이
              이 상태를 아직 반영하지 않았을 수 있습니다. 보고서의 결론과 이 요약이 다르면,
              이 요약을 우선하고 P0 항목을 먼저 해소하십시오.
            </p>
          )}

          {decision.missingInformation.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-700 mb-1.5">
                투자-핵심 미확인 정보 (우선순위 순)
              </div>
              <ul className="space-y-1.5">
                {decision.missingInformation.slice(0, 5).map((m) => (
                  <li
                    key={m.id}
                    className="text-xs rounded border border-gray-200 bg-white px-2.5 py-1.5 flex items-start gap-2"
                  >
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${PRIORITY_TONE[m.priority]}`}
                      title={VC_PRIORITY_LABEL[m.priority]}
                    >
                      {m.priority}
                    </span>
                    <div className="min-w-0">
                      <span className="text-gray-900">{m.item}</span>
                      <p className="mt-0.5 text-gray-500">{m.whyItMatters}</p>
                      <p className="mt-0.5 text-gray-400">필요 근거: {m.requiredEvidence}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="text-xs font-medium text-gray-700 mb-1.5">
              Decision Map ({decision.decisionDimensions.length + 1}개 차원)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {decision.decisionDimensions.map((d) => (
                <div
                  key={d.dimension}
                  className={`rounded border px-2 py-1.5 text-[10px] ${EVIDENCE_STATE_CLASS[d.state]}`}
                  title={d.contradiction ? `상충: ${d.contradiction.valueA} vs ${d.contradiction.valueB}` : undefined}
                >
                  <div className="font-medium text-gray-900">{d.label}</div>
                  <div>{VC_EVIDENCE_STATE_LABEL[d.state]}</div>
                </div>
              ))}
              <div className="rounded border px-2 py-1.5 text-[10px] bg-gray-50 text-gray-500 border-gray-200">
                <div className="font-medium text-gray-900">밸류에이션</div>
                <div>{VC_EVIDENCE_STATE_LABEL[decision.valuation.evidenceState]}</div>
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-gray-700 mb-1.5">Valuation &amp; Return</div>
            <ul className="space-y-1">
              {decision.valuation.lineItems.map((item, i) => (
                <li key={i} className="text-[11px] text-gray-600">
                  <span className="font-medium text-gray-800">{item.label}: </span>
                  {item.status === "computed" ? (
                    item.value
                  ) : (
                    <span className="text-gray-400">
                      NOT COMPUTABLE — {item.reason} (필요: {item.requiredInput})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {(decision.drivers.length > 0 || decision.thesisBreakers.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {decision.drivers.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-green-700 font-medium text-sm">
                    <TrendingUp className="w-4 h-4" />
                    Investment Drivers
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {decision.drivers.map((d) => (
                      <li
                        key={d.id}
                        className="text-xs rounded border border-green-100 bg-green-50/50 px-2.5 py-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-gray-900">{d.title}</span>
                          <span
                            className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${EVIDENCE_STATE_CLASS[d.evidenceState]}`}
                          >
                            {VC_EVIDENCE_STATE_LABEL[d.evidenceState]}
                          </span>
                        </div>
                        <p className="mt-0.5 text-gray-500">{d.whyItMatters}</p>
                        {d.evidence.length > 0 && (
                          <p className="mt-0.5 text-gray-400">
                            근거:{" "}
                            {d.evidence
                              .slice(0, 2)
                              .map((e) => `"${e.raw}"${e.documentName ? `(${e.documentName})` : ""}`)
                              .join(", ")}
                          </p>
                        )}
                        <p className="mt-0.5 text-gray-400">무엇이 뒤집을 수 있나: {d.whatCouldInvalidate}</p>
                        <p className="mt-0.5 text-gray-400">검증 필요: {d.verificationRequirement}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {decision.thesisBreakers.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 text-red-700 font-medium text-sm">
                    <ShieldAlert className="w-4 h-4" />
                    Thesis Breakers
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {decision.thesisBreakers.map((b) => (
                      <li
                        key={b.id}
                        className="text-xs rounded border border-red-100 bg-red-50/50 px-2.5 py-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-gray-900">{b.title}</span>
                          <span
                            className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${EVIDENCE_STATE_CLASS[b.evidenceState]}`}
                          >
                            {VC_EVIDENCE_STATE_LABEL[b.evidenceState]}
                          </span>
                        </div>
                        <p className="mt-0.5 text-gray-500">{b.whyItMatters}</p>
                        {b.evidence.length > 0 && (
                          <p className="mt-0.5 text-gray-400">
                            근거: {b.evidence.slice(0, 2).map((e) => `"${e.raw}"`).join(", ")}
                          </p>
                        )}
                        {/* 확률은 추정 근거가 없으므로 항상 "평가되지 않음"으로만 표시한다 —
                            숫자·퍼센트로 지어내지 않는다(vc-decision-types.ts의 계약 그대로). */}
                        <p className="mt-0.5 text-gray-400">발생 확률: 평가되지 않음(근거 부족으로 추정 불가)</p>
                        <p className="mt-0.5 text-gray-400">검증 필요: {b.verificationRequirement}</p>
                        {b.icQuestion && (
                          <p className="mt-0.5 text-gray-400">관련 IC 질문: {b.icQuestion.question}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {evidenceMissing && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
          근거 평가가 계산되지 않았습니다(보고서 없이 채점됐거나 구버전 점수). 점수를 다시
          계산하면 근거와 연결됩니다.
        </p>
      )}

      <div>
        <div className="flex items-center gap-1.5 text-gray-900 font-medium text-sm">
          <ListChecks className="w-4 h-4" />
          Must-Answer IC Questions
        </div>
        {mustAnswer.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {mustAnswer.map((q) => (
              <li
                key={q.id}
                className="text-xs rounded border border-gray-100 bg-gray-50/60 px-2.5 py-1.5"
              >
                <span
                  className={`text-[10px] rounded border px-1.5 py-0.5 mr-1.5 ${PRIORITY_CLASS[q.priority]}`}
                >
                  {q.priority}
                </span>
                <span className="text-gray-900">{q.question}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-xs text-gray-400">
            아직 생성되지 않았습니다 — 아래 IC Questions 패널에서 생성할 수 있습니다.
          </p>
        )}
      </div>

      {unresolved.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-gray-900 font-medium text-sm">
            <HelpCircle className="w-4 h-4" />
            Unresolved Evidence
          </div>
          <ul className="mt-2 space-y-1.5">
            {unresolved.map((u, i) => (
              <li
                key={`${u.sectionKey}-${u.claim}-${i}`}
                className="text-xs rounded border border-gray-100 bg-gray-50/60 px-2.5 py-1.5 flex items-start justify-between gap-2"
              >
                <span className="text-gray-900 min-w-0 break-words">{u.claim}</span>
                {u.hasIcQuestion && (
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    질문 있음
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-gray-100 pt-3">
        <button
          type="button"
          onClick={() => setRadarExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
        >
          {radarExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Score 상세 (6개 차원 레이더) {radarExpanded ? "접기" : "펼치기"}
        </button>
        {radarExpanded && (
          <div className="mt-3">
            <DealScoreRadar dealId={dealId} canEdit={canEdit} />
          </div>
        )}
      </div>
    </div>
  );
}

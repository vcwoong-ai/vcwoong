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
  selectKeyStrengths,
  selectKeyRisks,
  selectMustAnswerQuestions,
  selectUnresolvedEvidence,
  INVESTMENT_SIGNAL_LABEL,
  IC_RECOMMENDATION_LABEL,
} from "@/lib/ic-review";
import type { ScoreDimensionKey } from "@/lib/deal-scoring-shared";
import type { ScoreEvidenceAssessment } from "@/lib/deal-scoring-evidence";
import type { NumericClaim } from "@/lib/evidence";
import type { IcQuestion, QuestionPriority } from "@/lib/ic-questions";

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

  const strengths = useMemo(
    () => selectKeyStrengths(assessment, score?.rationale),
    [assessment, score]
  );
  const risks = useMemo(() => selectKeyRisks(assessment, score?.rationale), [assessment, score]);
  const mustAnswer = useMemo(() => selectMustAnswerQuestions(questions), [questions]);
  const unresolved = useMemo(() => selectUnresolvedEvidence(claims, questions), [claims, questions]);

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

      {evidenceMissing && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
          근거 평가가 계산되지 않았습니다(보고서 없이 채점됐거나 구버전 점수). 점수를 다시
          계산하면 근거와 연결됩니다.
        </p>
      )}

      {(strengths.length > 0 || risks.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {strengths.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-green-700 font-medium text-sm">
                <TrendingUp className="w-4 h-4" />
                Key Strengths
              </div>
              <ul className="mt-2 space-y-1.5">
                {strengths.map((s) => (
                  <li
                    key={s.dimension}
                    className="text-xs rounded border border-green-100 bg-green-50/50 px-2.5 py-1.5"
                  >
                    <span className="font-medium text-gray-900">{s.label}</span>
                    <span className="ml-1.5 text-green-700">{s.score}점</span>
                    {s.rationale && <p className="mt-0.5 text-gray-500">{s.rationale}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {risks.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-red-700 font-medium text-sm">
                <ShieldAlert className="w-4 h-4" />
                Key Risks
              </div>
              <ul className="mt-2 space-y-1.5">
                {risks.map((r, i) => (
                  <li
                    key={`${r.trigger}-${r.dimension ?? i}`}
                    className="text-xs rounded border border-red-100 bg-red-50/50 px-2.5 py-1.5"
                  >
                    <span className="font-medium text-gray-900">{r.label}</span>
                    <p className="mt-0.5 text-gray-500">{r.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
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

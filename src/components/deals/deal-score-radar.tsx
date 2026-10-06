"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Gauge, ShieldAlert, TrendingUp, HelpCircle } from "lucide-react";
import { SCORE_DIMENSIONS, scoreLabel, type ScoreDimensionKey } from "@/lib/deal-scoring-shared";

type ScoreConfidence = "HIGH" | "MEDIUM" | "LOW" | "UNSUPPORTED" | "NO_EVIDENCE";

type DecisionImpact = "HIGH" | "MEDIUM" | "LOW";

interface DimensionEvidenceAssessment {
  dimension: ScoreDimensionKey;
  score: number;
  confidence: ScoreConfidence;
  evidenceCoverage: number | null;
  claimsTotal: number;
  claimsSupported: number;
  keyEvidence: Array<{ raw: string; confidence: string; documentName?: string; location?: string }>;
  /** 옵셔널 — Phase 4 이전에 저장된 기존 레코드에는 없을 수 있다 */
  decisionImpact?: DecisionImpact;
  uncertaintyNote?: string;
}

interface ScoreEvidenceAssessment {
  overallConfidence: ScoreConfidence;
  overallCoverage: number | null;
  dimensions: Partial<Record<ScoreDimensionKey, DimensionEvidenceAssessment>>;
  riskFlags: string[];
  icSummary: { strengths: string[]; risks: string[]; unresolved: string[] };
  basis: "report_evidence" | "no_report";
}

interface SectorStageBenchmark {
  status: "ok" | "insufficient_data";
  comparableCount: number;
  minRequired: number;
  percentile?: number;
  sectorStageAverage?: number;
}

interface DealScore {
  overall: number;
  marketSize: number;
  team: number;
  product: number;
  businessModel: number;
  financials: number;
  moat: number;
  rationale: Partial<Record<ScoreDimensionKey, string>>;
  modelUsed: string;
  computedAt: string;
  evidenceAssessment?: ScoreEvidenceAssessment | null;
}

const COLOR = "#2563EB";

const CONFIDENCE_META: Record<ScoreConfidence, { label: string; className: string }> = {
  HIGH: { label: "확신 높음", className: "bg-state-positive-bg text-state-positive border-state-positive-line" },
  MEDIUM: { label: "검토 필요", className: "bg-state-caution-bg text-state-caution border-state-caution-line" },
  LOW: { label: "약한 근거", className: "bg-orange-50 text-orange-700 border-orange-200" },
  UNSUPPORTED: { label: "근거 없음", className: "bg-state-critical-bg text-state-critical border-state-critical-line" },
  NO_EVIDENCE: { label: "평가 불가", className: "bg-state-neutral-bg text-state-neutral border-state-neutral-line" },
};

/** 실제 RiskFlag 값(deal-scoring-evidence.ts)에 맞춘 한글 라벨 — 하드코딩 나열이지만 값 자체가 적고 고정적이다 */
const RISK_FLAG_LABEL: Record<string, string> = {
  HIGH_SCORE_LOW_EVIDENCE: "고득점이나 근거 부족",
  UNSUPPORTED_KEY_CLAIM: "핵심 주장 근거 없음",
  MARKET_EVIDENCE_GAP: "시장성 근거 공백",
  TEAM_EVIDENCE_GAP: "팀 역량 근거 공백",
  PRODUCT_EVIDENCE_GAP: "제품·기술력 근거 공백",
  BUSINESS_MODEL_EVIDENCE_GAP: "사업모델 근거 공백",
  FINANCIALS_EVIDENCE_GAP: "재무 근거 공백",
  MOAT_EVIDENCE_GAP: "경쟁우위 근거 공백",
  VALUATION_EVIDENCE_GAP: "밸류에이션 근거 공백",
};

function toRadarData(score: DealScore) {
  return SCORE_DIMENSIONS.map((d) => ({
    dimension: d.label,
    value: score[d.key],
    rationale: score.rationale?.[d.key] ?? "",
  }));
}

function isScoreData(value: unknown): value is DealScore | null {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const score = value as Record<string, unknown>;
  if (!["overall", ...SCORE_DIMENSIONS.map(d => d.key)].every(key => typeof score[key] === "number" && Number.isFinite(score[key]))) return false;
  if (score.rationale != null && (typeof score.rationale !== "object" || Object.values(score.rationale).some(item => typeof item !== "string"))) return false;
  if (score.evidenceAssessment != null) {
    if (typeof score.evidenceAssessment !== "object") return false;
    const assessment = score.evidenceAssessment as Record<string, unknown>;
    const confidence = (item: unknown) => typeof item === "string" && Object.hasOwn(CONFIDENCE_META, item);
    const strings = (items: unknown) => Array.isArray(items) && items.every(item => typeof item === "string");
    if (!confidence(assessment.overallConfidence) || !strings(assessment.riskFlags)
      || !assessment.dimensions || typeof assessment.dimensions !== "object"
      || Object.values(assessment.dimensions).some(item => item != null && (typeof item !== "object" || !confidence(item.confidence)))
      || !assessment.icSummary || typeof assessment.icSummary !== "object") return false;
    const summary = assessment.icSummary as Record<string, unknown>;
    if (![summary.strengths, summary.risks, summary.unresolved].every(strings)) return false;
  }
  return true;
}

export function DealScoreRadar({
  dealId,
  canEdit,
  onComputed,
}: {
  dealId: string;
  canEdit: boolean;
  /** 점수 계산이 끝나면 호출 — 결정 요약이 새 점수로 다시 계산되게 한다 */
  onComputed?: () => void;
}) {
  const [score, setScore] = useState<DealScore | null>(null);
  const [benchmark, setBenchmark] = useState<SectorStageBenchmark | null>(null);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const request = useRef<{ epoch: number; controller?: AbortController }>({ epoch: 0 });
  const resource = useRef(dealId);
  resource.current = dealId;
  const mutation = useRef({ epoch: 0 });
  const active = useRef(true);

  const load = useCallback(async () => {
    request.current.controller?.abort();
    const controller = new AbortController();
    const epoch = ++request.current.epoch;
    request.current.controller = controller;
    const current = () => active.current && resource.current === dealId && request.current.epoch === epoch && !controller.signal.aborted;
    setLoading(true);
    setReadError(null);
    setScore(null);
    setBenchmark(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/score`, { signal: controller.signal });
      if (!res.ok) throw new Error("read_failed");
      const json = await res.json();
      if (!isScoreData(json.data)) throw new Error("read_failed");
      if (current()) {
        setScore(json.data);
        setBenchmark(json.benchmark ?? null);
      }
    } catch {
      if (current()) setReadError("점수를 불러오지 못했습니다. 연결과 로그인 상태를 확인한 뒤 다시 조회해주세요.");
    } finally {
      if (current()) setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    active.current = true;
    setError(null);
    setComputing(false);
    void load();
    const pending = request.current;
    const mutations = mutation.current;
    return () => {
      active.current = false;
      mutations.epoch++;
      pending.epoch++;
      pending.controller?.abort();
    };
  }, [load]);

  const compute = async () => {
    const token = ++mutation.current.epoch;
    const current = () => active.current && resource.current === dealId && mutation.current.epoch === token;
    request.current.controller?.abort();
    request.current.epoch++;
    setComputing(true);
    setLoading(false);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/score`, { method: "POST" });
      if (!res.ok) throw new Error(res.status === 503 ? "점수 계산 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해주세요."
        : res.status === 429 ? "요청 한도에 도달했습니다. 잠시 후 다시 시도해주세요."
        : "점수를 계산하지 못했습니다. 연결과 로그인 상태를 확인해주세요.");
      const json = await res.json();
      if (!isScoreData(json.data) || json.data === null) throw new Error("invalid_score");
      if (!current()) return;
      setScore(json.data);
      await load(); // 벤치마크는 GET에서만 계산하므로 재계산 후 다시 불러온다
      if (current()) onComputed?.();
    } catch (e) {
      if (current()) setError(e instanceof Error && ["점수 계산 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해주세요.", "요청 한도에 도달했습니다. 잠시 후 다시 시도해주세요.", "점수를 계산하지 못했습니다. 연결과 로그인 상태를 확인해주세요."].includes(e.message)
        ? e.message : "점수를 계산하지 못했습니다. 연결과 로그인 상태를 확인해주세요.");
    } finally {
      if (current()) setComputing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        점수 불러오는 중...
      </div>
    );
  }

  if (readError) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <p role="alert" className="text-sm text-red-700">{readError}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>점수 다시 조회</Button>
    </div>;
  }

  const assessment = score?.evidenceAssessment;
  const overallConfMeta = assessment ? CONFIDENCE_META[assessment.overallConfidence] : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 font-medium text-gray-900">
          <Gauge className="w-4 h-4" />
          투자 매력도 점수
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {score && (
            <Badge variant="outline" className={scoreLabel(score.overall).tone}>
              {score.overall}점 · {scoreLabel(score.overall).label}
            </Badge>
          )}
          {overallConfMeta && (
            <Badge variant="outline" className={overallConfMeta.className}>
              확신도 {overallConfMeta.label}
              {assessment?.overallCoverage != null ? ` · 근거 ${assessment.overallCoverage}%` : ""}
            </Badge>
          )}
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        보고서 작성 품질이 아니라 투자 판단 점수입니다. AI 참고용이며 최종 판단은 심사역의 몫입니다.
      </p>

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          {error}
        </p>
      )}

      {score ? (
        <>
          <div className="mt-3" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={toRadarData(score)} outerRadius="75%">
                <PolarGrid />
                <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 12, fill: "#475569" }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "#64748b" }} />
                <Radar
                  name="점수"
                  dataKey="value"
                  stroke={COLOR}
                  fill={COLOR}
                  fillOpacity={0.35}
                />
                <Tooltip
                  formatter={(value, _name, props) => [
                    `${value}점 — ${props.payload?.rationale || "근거 없음"}`,
                    props.payload?.dimension,
                  ]}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
            {SCORE_DIMENSIONS.map((d) => {
              const dim = assessment?.dimensions?.[d.key];
              const dimMeta = dim ? CONFIDENCE_META[dim.confidence] : null;
              return (
                <li key={d.key} className="truncate" title={dim?.uncertaintyNote || undefined}>
                  <span className="text-gray-700 font-medium">{d.label}</span>{" "}
                  {score[d.key]}점
                  {dimMeta && (
                    <span className={`ml-1 rounded border px-1 py-0 text-xs ${dimMeta.className}`}>
                      {dim!.evidenceCoverage != null ? `근거 ${dim!.evidenceCoverage}%` : dimMeta.label}
                    </span>
                  )}
                  {dim?.decisionImpact === "HIGH" && (
                    <span className="ml-1 rounded border border-red-200 bg-red-50 text-red-700 px-1 py-0 text-xs">
                      판단 영향 높음
                    </span>
                  )}
                  {score.rationale?.[d.key] && ` — ${score.rationale[d.key]}`}
                </li>
              );
            })}
          </ul>

          {assessment && assessment.riskFlags.length > 0 && (
            <div className="mt-3 flex items-start gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex flex-wrap gap-1">
                {assessment.riskFlags.map((flag) => (
                  <span
                    key={flag}
                    className="text-xs rounded border border-amber-200 bg-amber-50 text-amber-700 px-1.5 py-0.5"
                  >
                    {RISK_FLAG_LABEL[flag] ?? flag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {assessment && assessment.basis === "no_report" && (
            <p className="mt-2 text-xs text-gray-400">
              보고서 없이 문서 원문만으로 채점돼 근거 추적을 계산할 수 없습니다. 보고서 생성 후 다시 계산하면 근거가 연결됩니다.
            </p>
          )}

          {assessment && (assessment.icSummary.strengths.length > 0 || assessment.icSummary.risks.length > 0) && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {assessment.icSummary.strengths.length > 0 && (
                <div>
                  <div className="flex items-center gap-1 text-green-700 font-medium">
                    <TrendingUp className="w-3.5 h-3.5" /> 강점
                  </div>
                  <ul className="mt-1 space-y-0.5 text-gray-600 list-disc list-inside">
                    {assessment.icSummary.strengths.map((s, i) => (
                      <li key={i} className="truncate">{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {assessment.icSummary.risks.length > 0 && (
                <div>
                  <div className="flex items-center gap-1 text-red-700 font-medium">
                    <ShieldAlert className="w-3.5 h-3.5" /> 리스크
                  </div>
                  <ul className="mt-1 space-y-0.5 text-gray-600 list-disc list-inside">
                    {assessment.icSummary.risks.map((s, i) => (
                      <li key={i} className="truncate">{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {assessment.icSummary.unresolved.length > 0 && (
                <div className="sm:col-span-2">
                  <div className="flex items-center gap-1 text-gray-600 font-medium">
                    <HelpCircle className="w-3.5 h-3.5" /> 확인 필요
                  </div>
                  <ul className="mt-1 space-y-0.5 text-gray-600 list-disc list-inside">
                    {assessment.icSummary.unresolved.map((s, i) => (
                      <li key={i} className="truncate">{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {benchmark && (
            <p className="mt-3 text-xs text-gray-400 border-t border-gray-100 pt-2">
              {benchmark.status === "ok"
                ? `동일 섹터·스테이지 ${benchmark.comparableCount}건 중 상위 ${100 - (benchmark.percentile ?? 0)}% 수준 (평균 ${benchmark.sectorStageAverage}점)`
                : `벤치마크 데이터 부족 (동일 섹터·스테이지 비교 가능 딜 ${benchmark.comparableCount}건 · 최소 ${benchmark.minRequired}건 필요)`}
            </p>
          )}

          <p className="mt-2 text-xs text-gray-400">
            {new Date(score.computedAt).toLocaleString("ko-KR")} 계산 · {score.modelUsed}
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-gray-400">아직 계산된 점수가 없습니다.</p>
      )}

      {canEdit && (
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={compute}
          disabled={computing}
        >
          {computing ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          )}
          {score ? "다시 계산" : "점수 계산하기"}
        </Button>
      )}
    </div>
  );
}

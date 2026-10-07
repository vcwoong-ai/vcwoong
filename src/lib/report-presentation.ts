import type { ReportDecisionResult } from "./vc-decision-loader";
import type { NumericClaim } from "./evidence";
import { IC_RECOMMENDATION_LABEL } from "./ic-review";
import { VC_EVIDENCE_STATE_LABEL } from "./vc-decision-types";
import { buildDecisionMemoSections } from "./vc-decision-memo";
import type { DecisionContext } from "./decision-context";

export interface ReportChart {
  id: string;
  title: string;
  unit: string;
  points: Array<{ label: string; value: number; period: string; scenario: "ACTUAL" | "FORECAST"; source: string }>;
}
export interface ReportPresentation {
  context?: Omit<DecisionContext, "sections">;
  companyName: string;
  ready: boolean;
  recommendation: string;
  thesis: string;
  confidence: string;
  terms: Array<{ label: string; value: string }>;
  reasons: Array<{ title: string; detail: string; source: string }>;
  risks: Array<{ title: string; detail: string }>;
  blockers: Array<{ title: string; evidence: string }>;
  totals: { reasons: number; risks: number; blockers: number; contradictions: number };
  charts: ReportChart[];
  sections: Array<{ title: string; content: string }>;
}

const clean = (value: string) => value.replace(/[\r\n|<>]/g, " ").trim();
const UNITS: Record<string, number> = { "원": 1e-8, "천원": 1e-5, "만원": 1e-4, "백만원": .01, "천만원": .1, "억원": 1, "억": 1, "조원": 10000, "조": 10000 };

export function chartSourceTable(chart: ReportChart): string {
  return [`| 기간 | 값 (${chart.unit}) | 구분 | 출처 |`, "| --- | --- | --- | --- |",
    ...chart.points.map(point => `| ${point.period} | ${point.value.toLocaleString("ko-KR", { maximumFractionDigits: 20 })} | ${point.scenario === "ACTUAL" ? "실적" : "전망"} | ${clean(point.source)} |`)].join("\n");
}

/** No prose-to-arbitrary-bars: only one financial metric, explicit annual period,
 * actual/forecast designation and a high-confidence document match may be plotted. */
export function reportCharts(claims: NumericClaim[]): ReportChart[] {
  const groups = new Map<string, ReportChart>();
  const conflicted = new Set<string>();
  for (const claim of claims) {
    if (claim.claimType !== "numeric" || claim.status !== "document" || claim.confidence !== "HIGH"
        || claim.matchMethod !== "exact_numeric" || !claim.source?.documentName.trim() || UNITS[claim.unit] === undefined) continue;
    // Never infer a period from a different row or from a document's filename.
    const context = claim.label;
    const year = /(?:FY\s*|\b)((?:19|20)\d{2})(?:년|\b)/i.exec(context)?.[1];
    if (!year || /분기|Q[1-4]|반기|TTM/i.test(context)) continue;
    const scenario = /전망|추정|예상|forecast|estimate/i.test(context) ? "FORECAST"
      : /실적|actual/i.test(context) ? "ACTUAL" : null;
    const metric = /영업이익/.test(context) ? "영업이익" : /순이익/.test(context) ? "순이익" : /매출(?:액)?/.test(context) ? "매출" : null;
    if (!metric || !scenario || /이익률|성장률|비중|목표|누적|단독|별도|연결/.test(context)) continue;
    // Numeric evidence matching alone does not establish period or metric identity.
    const sourceText = claim.source.snippet;
    if (!sourceText.includes(year) || !sourceText.includes(metric)
      || !(scenario === "ACTUAL" ? /실적|actual/i : /전망|추정|예상|forecast|estimate/i).test(sourceText)) continue;
    const sourceYears = sourceText.match(/(?:19|20)\d{2}/g) ?? [];
    if (new Set(sourceYears).size !== 1 || /전망|추정|예상|forecast|estimate/i.test(sourceText) !== (scenario === "FORECAST")) continue;
    const sourceMetrics = (sourceText.match(/영업이익|순이익|매출(?:액)?/g) ?? []).map(item => item.replace("매출액", "매출"));
    if (new Set(sourceMetrics).size !== 1) continue;
    const sourceNumbers = Array.from(sourceText.matchAll(/([-−△▲]?)\s*(\d[\d,]*(?:\.\d+)?)\s*(천만원|백만원|천원|만원|억원|조원|원|억|조)/g));
    if (!sourceNumbers.some(match => Number(match[2].replace(/,/g, "")) === Number(claim.value)
      && match[3] === claim.unit && Boolean(match[1]) === Boolean(claim.negative))) continue;
    const value = Number(claim.value) * (claim.negative ? -1 : 1) * UNITS[claim.unit];
    if (!Number.isFinite(value)) continue;
    const group = groups.get(metric) ?? { id: metric, title: `${metric} 추이`, unit: "억원", points: [] };
    const prior = group.points.find(point => point.period === year && point.scenario === scenario);
    if (prior && prior.value !== value) conflicted.add(metric);
    else if (!prior) group.points.push({ label: `${year} ${scenario === "ACTUAL" ? "실적" : "전망"}`, value,
      period: year, scenario, source: `${claim.source.documentName}${claim.source.location ? ` · ${claim.source.location}` : ""}` });
    groups.set(metric, group);
  }
  return Array.from(groups.values()).filter(group => !conflicted.has(group.id) && group.points.length >= 2 && group.points.length <= 12)
    .map(group => ({ ...group, points: group.points.sort((a, b) => a.period.localeCompare(b.period) || a.scenario.localeCompare(b.scenario)) }));
}

export function buildReportPresentation(result: ReportDecisionResult, companyName: string): ReportPresentation {
  const { decision } = result;
  const ready = result.hasScore && result.gate.ok && result.assessmentBasis === "report_evidence";
  const reasons = ready ? decision.drivers.map(item => ({ title: item.title, detail: item.description,
    source: item.evidence.map(source => [source.documentName, source.location].filter(Boolean).join(" · ")).filter(Boolean).join(", ") || "근거 확인 필요" })) : [];
  const risks = ready ? decision.thesisBreakers.map(item => ({ title: item.title, detail: item.whyItMatters })) : [];
  const blockers = result.gate.ok ? decision.missingInformation.map(item => ({ title: item.item, evidence: item.requiredEvidence })) : [];
  const terms = result.gate.ok ? decision.valuation.lineItems.map(item => ({ label: item.label,
    value: item.status === "computed" ? item.value : `계산 불가 — ${item.reason}` })) : [];
  const charts = reportCharts(result.evidence.claims);
  const presentation: ReportPresentation = {
    context: result.context ? { meetings: result.context.meetings, research: result.context.research,
      unavailableMeetings: result.context.unavailableMeetings, comparisonCount: result.context.comparisonCount } : undefined,
    companyName, ready, recommendation: ready ? IC_RECOMMENDATION_LABEL[decision.recommendation] : "판단 준비 중",
    thesis: ready ? decision.thesis : !result.hasScore ? "투자 매력도 평가와 근거 검토가 아직 완료되지 않았습니다."
      : !result.gate.ok ? "판단 요약의 일관성을 확인하지 못했습니다. 상세 근거를 검토해주세요." : "보고서 근거를 반영하지 않은 평가입니다. 재평가가 필요합니다.",
    confidence: VC_EVIDENCE_STATE_LABEL[decision.confidence], terms,
    reasons: reasons.slice(0, 3), risks: risks.slice(0, 3), blockers: blockers.slice(0, 3),
    totals: { reasons: reasons.length, risks: risks.length, blockers: blockers.length, contradictions: decision.contradictions.length },
    charts, sections: [],
  };
  const brief = [
    `**자동 검토 상태:** ${presentation.recommendation}`,
    presentation.thesis,
    "자동 검토 요약이며 심사역의 확정 의견·투자 승인과 다릅니다. 출처가 있다는 것은 독립적인 사실 검증을 뜻하지 않습니다.",
    ...terms.map(item => `- ${item.label}: ${item.value}`),
    "### 주요 투자 근거", ...presentation.reasons.map(item => `- ${item.title} — ${item.detail} (출처: ${item.source})`),
    ...(presentation.reasons.length ? [] : ["- 확인된 투자 근거를 준비 중입니다."]),
    "### 주요 반대 근거", ...presentation.risks.map(item => `- ${item.title} — ${item.detail}`),
    ...(presentation.risks.length ? [] : ["- 표시할 반대 근거가 없습니다. 위험이 없다는 뜻은 아닙니다."]),
    "### 결정 전에 확인할 사항", ...presentation.blockers.map(item => `- ${item.title} — 필요한 자료: ${item.evidence}`),
    `상충 ${presentation.totals.contradictions}건 · 전체 투자 근거 ${presentation.totals.reasons}건 · 반대 근거 ${presentation.totals.risks}건 · 미확인 사항 ${presentation.totals.blockers}건. 전체 내용은 판단 근거 부록에 보존합니다.`,
  ].join("\n\n");
  presentation.sections = [{ title: "한눈에 보는 투자 요약", content: brief },
    ...charts.map(chart => ({ title: chart.title, content: ["업로드 자료 기재 수치입니다. 실적과 전망을 구분하며 독립 검증을 뜻하지 않습니다.",
      chartSourceTable(chart)].join("\n") })),
    ...(result.context?.sections ?? []),
    ...buildDecisionMemoSections(decision, result.sectionRefs).filter(section => ready || !["투자 결정 요약", "투자 근거 (Investment Drivers)", "투자 논지 훼손 요인 (Thesis Breakers)"].includes(section.title))];
  return presentation;
}

/** Protect every output adapter, including callers outside the report loader. */
export function validReportChart(chart: ReportChart): boolean {
  return !!chart.title && !!chart.unit && chart.points.length >= 2 && chart.points.length <= 12
    && chart.points.every(point => !!point.label && !!point.period && !!point.source && Number.isFinite(point.value)
      && ["ACTUAL", "FORECAST"].includes(point.scenario))
    && new Set(chart.points.map(point => `${point.period}:${point.scenario}`)).size === chart.points.length;
}

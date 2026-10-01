import { Callout } from "@/components/ui/callout";
import { StatusBadge } from "@/components/ui/status-badge";
import { SCORE_DIMENSIONS } from "@/lib/deal-scoring-shared";
import type { VCContradiction } from "@/lib/vc-decision-types";
import { VC_IMPACT_LABEL, VC_IMPACT_TONE } from "./evidence-state";
import type { EvidenceTarget } from "./evidence-panel";

const SCENARIO_LABEL = { ACTUAL: "실적", FORECAST: "추정", UNSPECIFIED: "명시 없음" } as const;

function dimensionName(dimension: VCContradiction["dimension"]): string {
  if (!dimension) return "특정 차원에 매핑되지 않음";
  if (dimension === "valuation") return "밸류에이션";
  return SCORE_DIMENSIONS.find((d) => d.key === dimension)?.label ?? dimension;
}

/**
 * 수치 상충 — 빨간 배지 하나로 끝내지 않는다. 같은 지표를 서로 다르게 말하는
 * 출처와 값을 기간·구분·위치와 함께 나란히 보여주고, 이 상충이 어느 판단에
 * 영향을 주며 무엇을 확인해야 하는지까지 적는다. 어느 값이 맞는지는 시스템이
 * 고르지 않는다(값 하나를 조용히 선택하지 않음).
 */
export function ContradictionPanel({
  contradictions,
  onOpenEvidence,
}: {
  contradictions: VCContradiction[];
  /** 각 값의 근거(문서·위치·원문 발췌)를 옆 패널에서 연다 */
  onOpenEvidence?: (target: EvidenceTarget) => void;
}) {
  if (contradictions.length === 0) return null;
  return (
    <section aria-labelledby="vc-contradictions-title" data-testid="vc-contradictions" className="space-y-3">
      <Callout tone="critical" title={<span id="vc-contradictions-title">수치 상충 {contradictions.length}건 — 정본 확인 전까지 해당 지표를 결정 근거로 쓰지 마십시오</span>}>
        같은 지표에 출처마다 다른 값이 있습니다. 아래 값 중 어느 것이 맞는지는 원문 대조로만 확정할 수 있습니다.
      </Callout>
      {contradictions.map((c) => (
        <article key={c.id} className="rounded-md border border-state-critical-line bg-white" data-testid="vc-contradiction">
          <header className="flex flex-wrap items-center gap-2 border-b border-state-critical-line bg-state-critical-bg px-3.5 py-2">
            <h3 className="text-sm font-semibold text-slate-900">{c.metricLabel}</h3>
            <span className="text-xs text-slate-600">{c.values.length}개 값 상충</span>
            <StatusBadge tone={VC_IMPACT_TONE[c.decisionImpact]} className="ml-auto">
              {VC_IMPACT_LABEL[c.decisionImpact]}
            </StatusBadge>
          </header>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">{c.metricLabel} 상충 값 비교</caption>
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th scope="col" className="px-3.5 py-2 font-medium">출처</th>
                  <th scope="col" className="px-3.5 py-2 font-medium text-right">값</th>
                  <th scope="col" className="px-3.5 py-2 font-medium">기간</th>
                  <th scope="col" className="px-3.5 py-2 font-medium">구분</th>
                  <th scope="col" className="px-3.5 py-2 font-medium">위치</th>
                  {onOpenEvidence && <th scope="col" className="px-3.5 py-2 font-medium"><span className="sr-only">근거 확인</span></th>}
                </tr>
              </thead>
              <tbody>
                {c.values.map((v, i) => (
                  <tr key={`${v.raw}-${i}`} className="border-b border-slate-100 last:border-0" data-testid="vc-contradiction-value">
                    <th scope="row" className="px-3.5 py-2 text-left font-medium text-slate-800">
                      {v.documentName ?? <span className="font-normal text-slate-500">출처 미표기</span>}
                    </th>
                    <td className="px-3.5 py-2 text-right font-semibold tabular-nums text-slate-900">{v.raw}</td>
                    <td data-label="기간" className="px-3.5 py-2 text-slate-700">{v.period === "UNSPECIFIED" ? "명시 없음" : v.period}</td>
                    <td data-label="구분" className="px-3.5 py-2 text-slate-700">{SCENARIO_LABEL[v.scenario]}</td>
                    <td data-label="위치" className="px-3.5 py-2 text-slate-600">{v.location ?? "위치 정보 없음"}</td>
                    {onOpenEvidence && (
                      <td className="px-3.5 py-2 text-right">
                        <button
                          type="button"
                          className="whitespace-nowrap text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:underline"
                          data-testid="vc-open-evidence"
                          aria-label={`${c.metricLabel} ${v.raw}${v.documentName ? ` (${v.documentName})` : ""} 근거 확인`}
                          onClick={() =>
                            onOpenEvidence({
                              heading: `${c.metricLabel} — 수치 상충`,
                              evidenceState: "CONTRADICTED",
                              activeIndex: i,
                              entries: c.values.map((x) => ({
                                raw: x.raw,
                                documentName: x.documentName,
                                location: x.location,
                                period: x.period,
                                scenario: x.scenario,
                                unit: x.unit,
                                snippet: x.snippet,
                              })),
                              notes: [
                                { label: "영향받는 판단", text: dimensionName(c.dimension) },
                                { label: "필요한 검증", text: c.verificationRequirement },
                              ],
                            })
                          }
                        >
                          근거 확인
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="grid gap-x-6 gap-y-1.5 px-3.5 py-2.5 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-xs font-medium text-slate-500">영향받는 판단</dt>
            <dd className="text-slate-800">{dimensionName(c.dimension)}</dd>
            <dt className="text-xs font-medium text-slate-500">필요한 검증</dt>
            <dd className="text-slate-800">{c.verificationRequirement}</dd>
            {c.icQuestion && (
              <>
                <dt className="text-xs font-medium text-slate-500">연결된 IC 질문</dt>
                <dd className="text-slate-800">{c.icQuestion.question}</dd>
              </>
            )}
          </dl>
        </article>
      ))}
    </section>
  );
}

import { Card } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ScoreDimensionKey } from "@/lib/deal-scoring-shared";
import { VC_PRIORITY_LABEL, type VCEvidenceState, type VCInvestmentDriver, type VCMissingInformation, type VCPriority, type VCThesisBreaker } from "@/lib/vc-decision-types";
import type { DecisionQuestionLink } from "@/lib/vc-decision-loader";
import type { VCDecisionMemoSectionRef } from "@/lib/vc-decision-memo";
import { QUESTION_CATEGORY_LABEL } from "@/lib/ic-questions";
import type { EvidenceTarget } from "./evidence-panel";
import { EvidenceStateBadge, VC_EVIDENCE_TONE, VC_IMPACT_LABEL, VC_IMPACT_TONE, VC_PRIORITY_TONE } from "./evidence-state";
import type { DecisionApiData } from "./decision-types";

type SectionRefFor = (dimension: ScoreDimensionKey | undefined) => VCDecisionMemoSectionRef | undefined;

const TONE_BORDER: Record<string, string> = {
  positive: "border-l-state-positive",
  info: "border-l-state-info",
  caution: "border-l-state-caution",
  neutral: "border-l-state-neutral-line",
  critical: "border-l-state-critical",
};

function SectionLink({ refFor, dimension }: { refFor: SectionRefFor; dimension: ScoreDimensionKey | undefined }) {
  const ref = refFor(dimension);
  if (!ref) return null;
  return (
    <a
      href={`#section-${ref.sectionKey}`}
      className="mt-2 inline-block text-sm font-medium text-primary underline-offset-2 hover:underline"
    >
      상세 분석 · {ref.sectionOrder}. {ref.sectionTitle} →
    </a>
  );
}

function EvidenceQuotes({
  evidence,
  limit = 2,
  heading,
  onOpenEvidence,
  evidenceState,
}: {
  evidence: Array<{ raw: string; documentName?: string; location?: string }>;
  limit?: number;
  /** 근거 패널 제목(무엇에 대한 근거인가) */
  heading: string;
  onOpenEvidence?: (target: EvidenceTarget) => void;
  evidenceState: VCEvidenceState;
}) {
  if (evidence.length === 0) return <span className="text-slate-500">확인된 근거 발췌 없음</span>;
  return (
    <ul className="space-y-1">
      {evidence.slice(0, limit).map((e, i) => (
        <li key={`${e.raw}-${i}`} className="text-slate-800">
          <span className="font-medium">“{e.raw}”</span>
          {e.documentName && (
            <span className="text-slate-500">
              {" "}
              — {e.documentName}
              {e.location ? ` · ${e.location}` : ""}
            </span>
          )}
          {onOpenEvidence && (
            <button
              type="button"
              className="ml-2 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:underline"
              onClick={() =>
                onOpenEvidence({
                  heading,
                  evidenceState,
                  activeIndex: i,
                  entries: evidence.map((x) => ({ raw: x.raw, documentName: x.documentName, location: x.location })),
                })
              }
              aria-label={`${heading}: ${e.raw} 근거 확인`}
              data-testid="vc-open-evidence"
            >
              근거 확인
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function DecisionMap({ data, refFor }: { data: DecisionApiData; refFor: SectionRefFor }) {
  const { decision } = data;
  return (
    <section aria-labelledby="vc-map-title" data-testid="vc-decision-map">
      <SectionHeader as="h3" id="vc-map-title" title="근거 현황 · Decision Map" description="차원별로 지금 무엇을 알고 무엇을 모르는지" />
      <ul className="mt-3 grid grid-cols-1 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
        {decision.decisionDimensions.map((d) => {
          const ref = refFor(d.dimension as ScoreDimensionKey);
          return (
            <li key={d.dimension} className="flex items-center justify-between gap-2 bg-white px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{d.label}</p>
                {ref && (
                  <a href={`#section-${ref.sectionKey}`} className="text-xs text-slate-500 underline-offset-2 hover:underline">
                    {ref.sectionOrder}. {ref.sectionTitle}
                  </a>
                )}
              </div>
              <EvidenceStateBadge state={d.state} />
            </li>
          );
        })}
        <li className="flex items-center justify-between gap-2 bg-white px-3 py-2.5">
          <p className="text-sm font-medium text-slate-900">밸류에이션</p>
          <EvidenceStateBadge state={decision.valuation.evidenceState} />
        </li>
        {/* 7+1=8칸으로 맞춰 2·4열 격자의 마지막 줄에 회색 빈칸이 생기지 않게 한다 */}
        <li aria-hidden="true" className="hidden bg-white sm:block" />
      </ul>
    </section>
  );
}

function DriverList({ drivers, refFor, onOpenEvidence }: { drivers: VCInvestmentDriver[]; refFor: SectionRefFor; onOpenEvidence?: (target: EvidenceTarget) => void }) {
  return (
    <section aria-labelledby="vc-drivers-title" data-testid="vc-drivers">
      <SectionHeader as="h3" id="vc-drivers-title" eyebrow="Why invest" title="투자 근거 (Investment Drivers)" />
      {drivers.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">현재 근거로 뒷받침되는 투자 논지 축을 찾지 못했습니다 — 추가 자료가 필요합니다.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {drivers.map((d) => (
            <li
              key={d.id}
              data-testid="vc-driver"
              data-evidence-state={d.evidenceState}
              className={`rounded-md border border-l-[3px] border-slate-200 bg-white p-3.5 ${TONE_BORDER[VC_EVIDENCE_TONE[d.evidenceState]]}`}
            >
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-sm font-semibold text-slate-900">{d.title}</h4>
                <EvidenceStateBadge state={d.evidenceState} />
              </div>
              <p className="mt-1.5 text-sm text-slate-700">{d.whyItMatters}</p>
              <dl className="mt-2.5 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[7rem_1fr]">
                <dt className="text-xs font-medium text-slate-500">근거</dt>
                <dd><EvidenceQuotes evidence={d.evidence} evidenceState={d.evidenceState} heading={`${d.title} — 근거`} onOpenEvidence={onOpenEvidence} /></dd>
                <dt className="text-xs font-medium text-slate-500">뒤집을 수 있는 것</dt>
                <dd className="text-slate-800">{d.whatCouldInvalidate}</dd>
                <dt className="text-xs font-medium text-slate-500">검증</dt>
                <dd className="text-slate-800">{d.verificationRequirement}</dd>
              </dl>
              <SectionLink refFor={refFor} dimension={d.dimension} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function BreakerList({ breakers, refFor, onOpenEvidence }: { breakers: VCThesisBreaker[]; refFor: SectionRefFor; onOpenEvidence?: (target: EvidenceTarget) => void }) {
  return (
    <section aria-labelledby="vc-breakers-title" data-testid="vc-breakers">
      <SectionHeader as="h3" id="vc-breakers-title" eyebrow="What could break the thesis" title="논지 훼손 요인 (Thesis Breakers)" />
      {breakers.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">현재 식별된 Thesis Breaker가 없습니다.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {breakers.map((b) => (
            <li
              key={b.id}
              data-testid="vc-breaker"
              data-trigger={b.trigger}
              className={`rounded-md border border-l-[3px] border-slate-200 bg-white p-3.5 ${TONE_BORDER[VC_IMPACT_TONE[b.decisionImpact]]}`}
            >
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-sm font-semibold text-slate-900">{b.title}</h4>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  <StatusBadge tone={VC_IMPACT_TONE[b.decisionImpact]}>{VC_IMPACT_LABEL[b.decisionImpact]}</StatusBadge>
                  <EvidenceStateBadge state={b.evidenceState} />
                </div>
              </div>
              {b.trigger === "CONTRADICTION" ? (
                <p className="mt-1.5 text-sm text-slate-700">
                  출처별 값·기간·위치 대조는 위{" "}
                  <a href="#vc-contradictions-title" className="font-medium text-primary underline underline-offset-2">
                    수치 상충
                  </a>{" "}
                  표를 보십시오. 정본이 확인되기 전에는 이 지표에 근거한 논지를 신뢰할 수 없습니다.
                </p>
              ) : (
                <p className="mt-1.5 text-sm text-slate-700">{b.whyItMatters}</p>
              )}
              <dl className="mt-2.5 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[7rem_1fr]">
                {b.trigger !== "CONTRADICTION" && (
                  <>
                    <dt className="text-xs font-medium text-slate-500">근거</dt>
                    <dd><EvidenceQuotes evidence={b.evidence} evidenceState={b.evidenceState} limit={3} heading={`${b.title} — 근거`} onOpenEvidence={onOpenEvidence} /></dd>
                  </>
                )}
                {/* 확률은 추정 근거가 없으므로 숫자로 지어내지 않고 항상 "평가되지 않음" — 엔진 계약 그대로 */}
                <dt className="text-xs font-medium text-slate-500">발생 확률</dt>
                <dd className="text-slate-500">평가되지 않음 (근거 부족으로 추정 불가)</dd>
                <dt className="text-xs font-medium text-slate-500">필요한 후속 조치</dt>
                <dd className="text-slate-800">{b.verificationRequirement}</dd>
                {b.icQuestion && (
                  <>
                    <dt className="text-xs font-medium text-slate-500">연결된 IC 질문</dt>
                    <dd className="text-slate-800">{b.icQuestion.question}</dd>
                  </>
                )}
              </dl>
              <SectionLink refFor={refFor} dimension={b.dimension} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ValuationBlock({ data }: { data: DecisionApiData }) {
  const { valuation } = data.decision;
  return (
    <section aria-labelledby="vc-valuation-title" data-testid="vc-valuation">
      <SectionHeader
        as="h3"
        id="vc-valuation-title"
        eyebrow="Valuation & return"
        title="밸류에이션 · 회수"
        description="입력된 사실과 결정적으로 계산 가능한 값만 표시합니다. 가정은 만들지 않습니다."
        actions={<EvidenceStateBadge state={valuation.evidenceState} />}
      />
      <Card className="mt-3 overflow-hidden">
        <dl className="divide-y divide-slate-100 text-sm">
          <div className="grid gap-1 px-3.5 py-2.5 sm:grid-cols-[14rem_1fr]">
            <dt className="text-slate-500">투자금액</dt>
            <dd className="font-medium tabular-nums text-slate-900">
              {valuation.facts.investAmount != null ? `${valuation.facts.investAmount.toLocaleString()}억원` : <span className="font-normal text-slate-500">입력되지 않음</span>}
            </dd>
          </div>
          <div className="grid gap-1 px-3.5 py-2.5 sm:grid-cols-[14rem_1fr]">
            <dt className="text-slate-500">Post-money 밸류에이션</dt>
            <dd className="font-medium tabular-nums text-slate-900">
              {valuation.facts.valuation != null ? `${valuation.facts.valuation.toLocaleString()}억원` : <span className="font-normal text-slate-500">입력되지 않음</span>}
            </dd>
          </div>
          {valuation.lineItems.map((item) => (
            <div key={item.label} className="grid gap-1 px-3.5 py-2.5 sm:grid-cols-[14rem_1fr]" data-testid="vc-valuation-line">
              <dt className="text-slate-500">{item.label}</dt>
              <dd>
                {item.status === "computed" ? (
                  <span className="font-medium tabular-nums text-slate-900">{item.value}</span>
                ) : (
                  <span className="text-slate-600">
                    <span className="font-medium text-slate-700">산출 불가</span> — {item.reason}
                    <span className="block text-xs text-slate-500">필요한 입력: {item.requiredInput}</span>
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </section>
  );
}

function MissingInformationList({ items, refFor }: { items: VCMissingInformation[]; refFor: SectionRefFor }) {
  const groups: VCPriority[] = ["P0", "P1", "P2"];
  return (
    <section aria-labelledby="vc-missing-title" data-testid="vc-missing">
      <SectionHeader as="h3" id="vc-missing-title" eyebrow="What we do not know" title="미확인 정보 (Missing Information)" description="우선순위 순 — P0는 해소 전 최종 판단이 불가능합니다" />
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">현재 식별된 투자-핵심 정보 공백이 없습니다.</p>
      ) : (
        <div className="mt-3 space-y-4">
          {groups.map((priority) => {
            const group = items.filter((m) => m.priority === priority);
            if (group.length === 0) return null;
            return (
              <div key={priority}>
                <h4 className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <StatusBadge tone={VC_PRIORITY_TONE[priority]} icon={false}>{priority}</StatusBadge>
                  {VC_PRIORITY_LABEL[priority]}
                  <span className="text-xs font-normal text-slate-500">{group.length}건</span>
                </h4>
                <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
                  {group.map((m) => (
                    <li key={m.id} className="px-3.5 py-3" data-testid="vc-missing-item" data-priority={m.priority}>
                      <p className="text-sm font-medium text-slate-900">{m.item}</p>
                      {priority === "P0" ? (
                        <dl className="mt-1.5 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[7rem_1fr]">
                          <dt className="text-xs font-medium text-slate-500">왜 중요한가</dt>
                          <dd className="text-slate-700">{m.whyItMatters}</dd>
                          <dt className="text-xs font-medium text-slate-500">필요한 근거</dt>
                          <dd className="text-slate-700">{m.requiredEvidence}</dd>
                          <dt className="text-xs font-medium text-slate-500">결정 영향</dt>
                          <dd><StatusBadge tone={VC_IMPACT_TONE[m.decisionImpact]} icon={false}>{VC_IMPACT_LABEL[m.decisionImpact]}</StatusBadge></dd>
                        </dl>
                      ) : (
                        // P1/P2는 한 덩어리로 압축 — 같은 문장이 항목마다 반복돼 화면이 길어지는 것을 줄인다
                        <>
                          <p className="mt-0.5 text-sm text-slate-600">{m.whyItMatters}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            필요한 근거: {m.requiredEvidence} · 결정 영향: {VC_IMPACT_LABEL[m.decisionImpact]}
                          </p>
                        </>
                      )}
                      <SectionLink refFor={refFor} dimension={m.relatedDimension} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const LINK_KIND_LABEL = { contradiction: "수치 상충", thesis_breaker: "Thesis Breaker", missing_information: "미확인 정보" } as const;

function QuestionList({ links, source }: { links: DecisionQuestionLink[]; source: DecisionApiData["questionsSource"] }) {
  return (
    <section aria-labelledby="vc-questions-title" data-testid="vc-questions">
      <SectionHeader as="h3" id="vc-questions-title" eyebrow="What should I review next" title="IC 질문" description="각 질문이 어떤 결정 이슈를 풀기 위한 것인지 함께 표시합니다" />
      {links.length === 0 ? (
        <Callout tone="info" className="mt-3">
          현재 결정 이슈와 연결된 IC 질문이 없습니다. 아래 <a href="#ic-questions" className="font-medium underline">IC Questions</a> 패널에서 질문을 생성할 수 있습니다.
        </Callout>
      ) : (
        <>
        {source === "deterministic_preview" && (
          <Callout tone="info" className="mt-3" data-testid="vc-questions-preview">
            아직 저장되지 않은 <span className="font-medium">미리보기</span>입니다 — 수치 상충·근거 공백에서 결정적으로 계산한 질문이며 AI 문장 다듬기 전입니다.
            아래 <a href="#ic-questions" className="font-medium underline">IC Questions</a> 패널에서 생성하면 저장됩니다.
          </Callout>
        )}
        <ol className="mt-3 space-y-2.5">
          {links.map(({ question, linkedTo }) => (
            <li key={question.id} className="rounded-md border border-slate-200 bg-white p-3.5" data-testid="vc-question">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={question.priority === "HIGH" ? "critical" : question.priority === "MEDIUM" ? "caution" : "neutral"} icon={false}>
                  {question.priority}
                </StatusBadge>
                <span className="text-xs text-slate-500">{QUESTION_CATEGORY_LABEL[question.category] ?? question.category}</span>
              </div>
              <p className="mt-1.5 text-sm font-medium text-slate-900">{question.question}</p>
              <p className="mt-1 text-sm text-slate-600">{question.whyItMatters}</p>
              <p className="mt-2 text-xs text-slate-500">
                {linkedTo.length > 0 ? (
                  <>
                    풀어야 할 이슈:{" "}
                    {linkedTo.map((l, i) => (
                      <span key={`${l.kind}-${l.label}`}>
                        {i > 0 && " · "}
                        <span className="font-medium text-slate-700">{LINK_KIND_LABEL[l.kind]}</span> {l.label}
                      </span>
                    ))}
                  </>
                ) : (
                  "연결된 결정 이슈 없음(저장된 질문)"
                )}
              </p>
            </li>
          ))}
        </ol>
        </>
      )}
    </section>
  );
}

export { DecisionMap, DriverList, BreakerList, ValuationBlock, MissingInformationList, QuestionList };

/**
 * VC Decision-First Investment Memo — 결정적 조립 계층(PR-K).
 *
 * 이 파일은 새 결정 로직을 만들지 않는다 — vc-decision.ts가 이미 계산해둔
 * VCInvestmentDecision(단일 authoritative 구조, 새 InvestmentDecision2 같은
 * 중복 타입 없음)을 문서 내보내기(DOCX/PPTX)가 재사용할 수 있는 마크다운
 * 텍스트 블록으로 "조립"만 한다. 새 AI 호출 없음 — 전부 이미 계산된
 * decision 객체를 문자열 템플릿으로 옮기는 순수 함수다.
 *
 * decision이 자체 품질 게이트(vc-decision-gate.ts)를 통과하지 못하면,
 * IcReviewPanel과 동일하게 그 내용을 신뢰 가능한 것처럼 내보내지 않고
 * 명시적 경고 섹션 하나만 반환한다(§4 — export도 UI와 같은 신뢰 기준을
 * 적용해야 한다).
 */
import { SCORE_DIMENSIONS, type ScoreDimensionKey } from "./deal-scoring-shared";
import { DIMENSION_SECTION_MAP } from "./deal-scoring-evidence";
import { checkVCDecisionGate } from "./vc-decision-gate";
import { VC_EVIDENCE_STATE_LABEL, VC_PRIORITY_LABEL, type VCInvestmentDecision } from "./vc-decision-types";
import { INVESTMENT_SIGNAL_LABEL, IC_RECOMMENDATION_LABEL } from "./ic-review";
import { SECTION_META, SectionKey } from "@/types";

export interface VCDecisionMemoSectionRef {
  dimension: ScoreDimensionKey;
  sectionKey: SectionKey;
  sectionTitle: string;
  sectionOrder: number;
}

/**
 * driver/dimension이 어느 상세 섹션과 연결되는지 — 새 매핑을 만들지 않고
 * deal-scoring-evidence.ts의 기존 DIMENSION_SECTION_MAP을 그대로 재사용한다
 * (§7/§8 — Decision → Evidence 참조. 존재하지 않는 URL/ID는 지어내지 않고,
 * 실제 보고서에 있는 섹션 제목만 참조한다).
 */
export function buildDecisionMemoSectionRefs(
  sections: Array<{ sectionKey: SectionKey; title: string }>
): VCDecisionMemoSectionRef[] {
  const refs: VCDecisionMemoSectionRef[] = [];
  (Object.entries(DIMENSION_SECTION_MAP) as Array<[ScoreDimensionKey, SectionKey[]]>).forEach(
    ([dimension, keys]) => {
      const key = keys[0];
      if (!key) return;
      const section = sections.find((s) => s.sectionKey === key);
      if (!section) return;
      const meta = SECTION_META.find((m) => m.key === key);
      refs.push({
        dimension,
        sectionKey: key,
        sectionTitle: section.title,
        sectionOrder: meta?.order ?? 0,
      });
    }
  );
  return refs;
}

function sectionDimensionLabel(dimension: string): string {
  return SCORE_DIMENSIONS.find((d) => d.key === dimension)?.label ?? dimension;
}

function sectionRefNote(
  dimension: ScoreDimensionKey | undefined,
  refs: VCDecisionMemoSectionRef[]
): string {
  if (!dimension) return "";
  const ref = refs.find((r) => r.dimension === dimension);
  if (!ref) return "";
  return `(관련 상세 섹션: ${ref.sectionOrder}. ${ref.sectionTitle})`;
}

export interface VCDecisionMemoSection {
  title: string;
  content: string;
}

const NO_CONTENT_ITEM = "— 해당 없음 —";

/**
 * VCInvestmentDecision을 DOCX/PPTX가 이미 파싱할 수 있는 마크다운 방언
 * (## / ### 헤딩, - 불릿, **굵게**, | 표 |)으로 조립한다. 새 AI 호출 없음 —
 * 전부 이미 계산된 값을 문자열로 옮기기만 한다.
 *
 * decision에 실질적으로 아무 내용도 없으면(딜 스코어를 아직 계산 안 함)
 * 빈 배열을 반환한다 — 없는 내용을 지어내 채우지 않는다.
 */
export function buildDecisionMemoSections(
  decision: VCInvestmentDecision,
  sectionRefs: VCDecisionMemoSectionRef[]
): VCDecisionMemoSection[] {
  const hasAnyContent =
    decision.decisionDimensions.length > 0 ||
    decision.drivers.length > 0 ||
    decision.thesisBreakers.length > 0 ||
    decision.missingInformation.length > 0 ||
    decision.valuation.lineItems.some((i) => i.status === "computed");
  if (!hasAnyContent) return [];

  const gate = checkVCDecisionGate(decision);
  if (!gate.ok) {
    return [
      {
        title: "투자 결정 요약",
        content: `**Investment Decision 계산 결과가 자체 일관성 검증을 통과하지 못했습니다(${gate.reason}).**\n\n이 문서에는 검증되지 않은 Decision Layer 요약을 포함하지 않습니다. 엔지니어링 확인이 필요합니다.`,
      },
    ];
  }

  const sections: VCDecisionMemoSection[] = [];

  // Page 1 — Investment Decision
  {
    const lines: string[] = [];
    lines.push(`**투자 시그널:** ${INVESTMENT_SIGNAL_LABEL[decision.signal].label}`);
    lines.push(`**IC 권고 상태:** ${IC_RECOMMENDATION_LABEL[decision.recommendation]}`);
    lines.push(`**결정 확신도(근거 완결성 기준):** ${VC_EVIDENCE_STATE_LABEL[decision.confidence]}`);
    lines.push("");
    lines.push("### Investment Thesis");
    lines.push(decision.thesis);
    lines.push("");
    lines.push("### Decision Map");
    lines.push("| 차원 | 상태 | 관련 상세 섹션 |");
    lines.push("| --- | --- | --- |");
    for (const d of decision.decisionDimensions) {
      const note = sectionRefNote(d.dimension as ScoreDimensionKey, sectionRefs);
      const state = d.contradiction
        ? `${VC_EVIDENCE_STATE_LABEL[d.state]}(상충: ${d.contradiction.valueA} vs ${d.contradiction.valueB} — 아래 '수치 상충' 참조)`
        : VC_EVIDENCE_STATE_LABEL[d.state];
      lines.push(`| ${d.label} | ${state} | ${note || "-"} |`);
    }
    lines.push(`| 밸류에이션 | ${VC_EVIDENCE_STATE_LABEL[decision.valuation.evidenceState]} | - |`);
    sections.push({ title: "투자 결정 요약", content: lines.join("\n") });
  }

  // 수치 상충 — 어느 출처가 어떤 값을 주장하는지 전부 보여준다(값 하나를 고르지 않는다).
  const contradictions = decision.contradictions ?? [];
  if (contradictions.length > 0) {
    const lines: string[] = [];
    for (const c of contradictions) {
      lines.push(`### ${c.metricLabel} — ${c.values.length}개 값이 상충 [영향: ${c.decisionImpact}]`);
      lines.push("| 출처 | 값 | 기간 | 구분 | 위치 |");
      lines.push("| --- | --- | --- | --- | --- |");
      for (const v of c.values) {
        const scenario = v.scenario === "ACTUAL" ? "실적" : v.scenario === "FORECAST" ? "추정" : "명시 없음";
        const period = v.period === "UNSPECIFIED" ? "명시 없음" : v.period;
        lines.push(`| ${v.documentName ?? "출처 미표기"} | ${v.raw} | ${period} | ${scenario} | ${v.location ?? "-"} |`);
      }
      if (c.dimension) {
        lines.push(`- 영향 차원: ${c.dimension === "valuation" ? "밸류에이션" : sectionDimensionLabel(c.dimension)}`);
      }
      lines.push(`- 검증 필요: ${c.verificationRequirement}`);
      if (c.icQuestion) lines.push(`- 관련 IC 질문: ${c.icQuestion.question}`);
      lines.push("");
    }
    sections.push({ title: "수치 상충 (출처별 값 대조)", content: lines.join("\n").trimEnd() });
  }

  // Page 2 — Investment Drivers
  {
    const lines: string[] = [];
    if (decision.drivers.length === 0) {
      lines.push(NO_CONTENT_ITEM);
    }
    for (const d of decision.drivers) {
      const note = sectionRefNote(d.dimension, sectionRefs);
      lines.push(`- **${d.title}** [${VC_EVIDENCE_STATE_LABEL[d.evidenceState]}] ${note}`);
      lines.push(`  - 왜 중요한가: ${d.whyItMatters}`);
      if (d.evidence.length > 0) {
        const excerpt = d.evidence
          .slice(0, 2)
          .map((e) => `"${e.raw}"${e.documentName ? `(${e.documentName})` : ""}`)
          .join(", ");
        lines.push(`  - 근거: ${excerpt}`);
      }
      lines.push(`  - 무엇이 이 강점을 뒤집을 수 있나: ${d.whatCouldInvalidate}`);
      lines.push(`  - 검증 필요: ${d.verificationRequirement}`);
    }
    sections.push({ title: "투자 근거 (Investment Drivers)", content: lines.join("\n") });
  }

  // Page 3 — Thesis Breakers
  {
    const lines: string[] = [];
    if (decision.thesisBreakers.length === 0) {
      lines.push(NO_CONTENT_ITEM);
    }
    for (const b of decision.thesisBreakers) {
      const note = sectionRefNote(b.dimension, sectionRefs);
      lines.push(`- **${b.title}** [${VC_EVIDENCE_STATE_LABEL[b.evidenceState]}] ${note}`);
      lines.push(`  - 왜 중요한가: ${b.whyItMatters}`);
      if (b.evidence.length > 0) {
        lines.push(`  - 근거: ${b.evidence.slice(0, 2).map((e) => `"${e.raw}"`).join(", ")}`);
      }
      // 확률은 추정 근거가 없으므로 항상 "평가되지 않음"만 쓴다 — 숫자로 지어내지 않는다.
      lines.push(`  - 발생 확률: 평가되지 않음(근거 부족으로 추정 불가)`);
      lines.push(`  - 검증 필요: ${b.verificationRequirement}`);
      if (b.icQuestion) {
        lines.push(`  - 관련 IC 질문: ${b.icQuestion.question}`);
      }
    }
    sections.push({ title: "투자 논지 훼손 요인 (Thesis Breakers)", content: lines.join("\n") });
  }

  // Page 4 — Missing Information (P0 먼저, 시각적으로 우선)
  {
    const lines: string[] = [];
    if (decision.missingInformation.length === 0) {
      lines.push(NO_CONTENT_ITEM);
    }
    for (const m of decision.missingInformation) {
      const note = sectionRefNote(m.relatedDimension, sectionRefs);
      lines.push(`- **[${m.priority}] ${m.item}** — ${VC_PRIORITY_LABEL[m.priority]} ${note}`);
      lines.push(`  - 왜 중요한가: ${m.whyItMatters}`);
      lines.push(`  - 필요 근거: ${m.requiredEvidence}`);
      if (m.icQuestion) {
        lines.push(`  - 관련 IC 질문: ${m.icQuestion.question}`);
      }
    }
    sections.push({ title: "투자결정 핵심 미확인 정보 (P0/P1/P2)", content: lines.join("\n") });
  }

  // Page 5 — Valuation & Return
  {
    const lines: string[] = [];
    if (decision.valuation.facts.investAmount != null) {
      lines.push(`- 투자금액: ${decision.valuation.facts.investAmount.toLocaleString()}억원`);
    }
    if (decision.valuation.facts.valuation != null) {
      lines.push(`- Post-money 밸류에이션: ${decision.valuation.facts.valuation.toLocaleString()}억원`);
    }
    for (const item of decision.valuation.lineItems) {
      if (item.status === "computed") {
        lines.push(`- **${item.label}:** ${item.value}`);
      } else {
        lines.push(`- **${item.label}:** NOT COMPUTABLE — ${item.reason}(필요: ${item.requiredInput})`);
      }
    }
    sections.push({ title: "밸류에이션 & 리턴", content: lines.join("\n") });
  }

  // Page 6 — IC Questions (P0/P1 우선 연결된 것만 — 새로 생성하지 않고 기존 매칭 재사용)
  {
    const linked = [
      ...decision.thesisBreakers.map((b) => b.icQuestion).filter((q): q is NonNullable<typeof q> => Boolean(q)),
      ...decision.missingInformation.map((m) => m.icQuestion).filter((q): q is NonNullable<typeof q> => Boolean(q)),
    ];
    const seen = new Set<string>();
    const deduped = linked.filter((q) => (seen.has(q.id) ? false : (seen.add(q.id), true)));
    const lines: string[] = [];
    if (deduped.length === 0) {
      lines.push(NO_CONTENT_ITEM);
    }
    for (const q of deduped) {
      lines.push(`- **[${q.priority}] ${q.question}**`);
      lines.push(`  - 왜 묻는가: ${q.whyItMatters}`);
    }
    sections.push({ title: "IC 질문", content: lines.join("\n") });
  }

  return sections;
}

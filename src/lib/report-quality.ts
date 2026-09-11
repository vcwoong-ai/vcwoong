/**
 * IC 보고서 섹션 품질 검증.
 * 생성 후 길이·환각 신호·구조·공유팩트 일치 점수를 산출한다.
 */
import type { ClaimConfidence } from "./evidence";

export interface SectionQuality {
  sectionKey: string;
  score: number; // 0~100
  issues: string[];
  warnings: string[];
  stats: {
    chars: number;
    headings: number;
    tables: number;
    citations: number;
    uncertainMarkers: number;
  };
}

export interface ReportQualitySummary {
  overallScore: number;
  sections: SectionQuality[];
  criticalIssues: string[];
  suggestions: string[];
  factConsistency?: {
    checked: number;
    matched: number;
    missing: string[];
  };
  /** evidence.ts 근거 추적 결과 요약(전달했을 때만) — hallucination 위험도 연결용 */
  evidenceSummary?: EvidenceQualitySummary;
}

/**
 * evidence.ts의 confidence 등급을 hallucination 위험 관점으로 재분류한다.
 *
 *   HIGH        → supported        (근거 확인됨)
 *   MEDIUM      → needsReview       (근거는 있으나 확신도가 낮음)
 *   LOW         → warning           (약한 근거 — 주의 필요)
 *   UNSUPPORTED → highRiskHallucination (근거 없음 — 환각 위험 높음)
 */
export interface EvidenceQualitySummary {
  checked: number;
  supported: number;
  needsReview: number;
  warning: number;
  highRiskHallucination: number;
}

export function summarizeEvidenceForQuality(
  claims: Array<{ confidence: ClaimConfidence }>
): EvidenceQualitySummary {
  return {
    checked: claims.length,
    supported: claims.filter((c) => c.confidence === "HIGH").length,
    needsReview: claims.filter((c) => c.confidence === "MEDIUM").length,
    warning: claims.filter((c) => c.confidence === "LOW").length,
    highRiskHallucination: claims.filter((c) => c.confidence === "UNSUPPORTED").length,
  };
}

const UNCERTAIN_RE =
  /확인 필요|추가 확인|N\/A|미정|자료 부족|제공되지 않음|알 수 없/gi;
const CITATION_RE =
  /출처\s*[:：]|PubMed|NCT\d+|ClinicalTrials|OpenFDA|IR\s*자료|Bessemer/gi;
const HEADING_RE = /^#{1,4}\s+.+/gm;
const TABLE_RE = /\|.+\|/g;
const HALLUCINATION_RE =
  /확실합니다|100%\s*확신|절대적|무조건\s*성공|리스크\s*없음/gi;

export function evaluateSection(
  sectionKey: string,
  content: string
): SectionQuality {
  const issues: string[] = [];
  const warnings: string[] = [];
  const chars = content.replace(/\s/g, "").length;
  const headings = (content.match(HEADING_RE) ?? []).length;
  const tables = (content.match(TABLE_RE) ?? []).length;
  const citations = (content.match(CITATION_RE) ?? []).length;
  const uncertainMarkers = (content.match(UNCERTAIN_RE) ?? []).length;
  const hallucinationHits = (content.match(HALLUCINATION_RE) ?? []).length;

  let score = 70;

  if (chars < 200) {
    issues.push("본문이 너무 짧음 (200자 미만)");
    score -= 25;
  } else if (chars < 400) {
    warnings.push("본문이 짧음 (400자 미만)");
    score -= 10;
  } else if (chars > 400 && chars < 2500) {
    score += 10;
  } else if (chars > 3500) {
    warnings.push("본문이 과도하게 김 (요약 권장)");
    score -= 5;
  }

  if (headings === 0) {
    warnings.push("소제목(헤딩) 없음");
    score -= 8;
  } else {
    score += Math.min(headings * 2, 8);
  }

  if (citations > 0) score += Math.min(citations * 3, 12);
  else if (sectionKey !== "APPENDIX") {
    warnings.push("출처/인용 표기 없음");
    score -= 5;
  }

  if (uncertainMarkers > 8) {
    warnings.push(`불확실 표기 과다 (${uncertainMarkers}회)`);
    score -= 10;
  }

  if (hallucinationHits > 0) {
    issues.push("과도한 확신 표현 감지 (환각 위험)");
    score -= 15;
  }

  if (
    (sectionKey === "FINANCIAL_STATUS" || sectionKey === "VALUATION") &&
    tables === 0
  ) {
    warnings.push("표(테이블) 없음 — 수치 비교 가독성 저하");
    score -= 5;
  }

  if (sectionKey === "OPINION_SUMMARY") {
    const hasLabel =
      /투자\s*권고|조건부\s*투자|추가\s*검토|투자\s*보류/.test(content);
    if (!hasLabel) {
      issues.push("투자 의견 라벨 없음 (권고/조건부/추가검토/보류)");
      score -= 12;
    }
  }

  if (sectionKey === "INVESTMENT_TERMS" && tables === 0) {
    warnings.push("투자조건 표 없음 — 구조 가독성 저하");
    score -= 4;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    sectionKey,
    score,
    issues,
    warnings,
    stats: { chars, headings, tables, citations, uncertainMarkers },
  };
}

/** 공유 팩트 수치(숫자 토큰)가 보고서 본문에 등장하는지 검사 */
export function checkFactConsistency(
  reportText: string,
  facts: {
    investAmount?: number;
    valuation?: number;
    metrics?: Record<string, string>;
    terms?: Record<string, string>;
    clinicalPhase?: string;
  }
): { checked: number; matched: number; missing: string[] } {
  const missing: string[] = [];
  let checked = 0;
  let matched = 0;
  const body = reportText.replace(/\s/g, "");

  const checkToken = (label: string, token: string | undefined) => {
    if (!token) return;
    checked += 1;
    const normalized = token.replace(/\s/g, "");
    if (normalized && body.includes(normalized)) {
      matched += 1;
    } else {
      missing.push(label);
    }
  };

  if (facts.investAmount != null) {
    checkToken(`투자금액 ${facts.investAmount}`, String(facts.investAmount));
  }
  if (facts.valuation != null) {
    checkToken(`Post-money ${facts.valuation}`, String(facts.valuation));
  }
  if (facts.clinicalPhase) {
    checked += 1;
    if (
      reportText.includes(facts.clinicalPhase) ||
      reportText.includes(facts.clinicalPhase.replace(/\s/g, ""))
    ) {
      matched += 1;
    } else {
      missing.push(`임상단계 ${facts.clinicalPhase}`);
    }
  }

  const numericFacts = {
    ...(facts.metrics ?? {}),
    ...(facts.terms ?? {}),
  };
  for (const [key, raw] of Object.entries(numericFacts)) {
    const num = raw.match(/([\d,.]+)/)?.[1];
    if (!num || num.length < 2) continue;
    // FY24 등 연도성 짧은 토큰 스킵
    if (/^(19|20)\d{2}$/.test(num.replace(/,/g, ""))) continue;
    checkToken(`${key} ${num}`, num.replace(/,/g, ""));
  }

  return { checked, matched, missing };
}

export function evaluateReport(
  sections: Array<{ sectionKey: string; content: string }>,
  facts?: {
    investAmount?: number;
    valuation?: number;
    metrics?: Record<string, string>;
    terms?: Record<string, string>;
    clinicalPhase?: string;
  },
  /**
   * evidence.ts로 미리 계산해둔 근거 추적 결과(선택). 넘기지 않으면 기존과
   * 완전히 동일하게 동작한다 — 이번 Phase에서 report-generation.ts의 실제
   * 호출부는 아직 이 값을 넘기지 않는다(전체 채점 체계 재설계는 범위 밖).
   */
  evidenceSummary?: EvidenceQualitySummary
): ReportQualitySummary {
  const evaluated = sections.map((s) =>
    evaluateSection(s.sectionKey, s.content)
  );
  let overallScore =
    evaluated.length === 0
      ? 0
      : Math.round(
          evaluated.reduce((sum, s) => sum + s.score, 0) / evaluated.length
        );

  const criticalIssues = evaluated.flatMap((s) =>
    s.issues.map((i) => `[${s.sectionKey}] ${i}`)
  );

  const suggestions: string[] = [];
  if (overallScore < 60) {
    suggestions.push("전체 품질이 낮습니다. IR 자료 보강 후 재생성하세요.");
  }
  if (
    evaluated.some(
      (s) => s.stats.citations === 0 && s.sectionKey !== "APPENDIX"
    )
  ) {
    suggestions.push("출처 표기를 늘리면 신뢰도가 올라갑니다.");
  }
  if (evaluated.some((s) => s.stats.uncertainMarkers > 5)) {
    suggestions.push(
      "확인 필요 항목이 많습니다. 재무/임상 수치를 IR에 보강하세요."
    );
  }

  let factConsistency: ReportQualitySummary["factConsistency"];
  if (facts) {
    const reportText = sections.map((s) => s.content).join("\n");
    factConsistency = checkFactConsistency(reportText, facts);
    if (factConsistency.checked > 0) {
      const ratio = factConsistency.matched / factConsistency.checked;
      if (ratio < 0.5) {
        overallScore = Math.max(0, overallScore - 8);
        suggestions.push(
          `공유 팩트 수치가 본문에 적습니다 (${factConsistency.matched}/${factConsistency.checked}). 재생성 시 일관성을 확인하세요.`
        );
      } else if (ratio >= 0.8) {
        overallScore = Math.min(100, overallScore + 3);
      }
      if (factConsistency.missing.length > 0) {
        criticalIssues.push(
          ...factConsistency.missing
            .slice(0, 3)
            .map((m) => `[FACT] 본문에 없음: ${m}`)
        );
      }
    }
  }

  if (evidenceSummary && evidenceSummary.checked > 0) {
    const hallucinationRatio =
      evidenceSummary.highRiskHallucination / evidenceSummary.checked;
    // factConsistency와 같은 폭(최대 ±8)으로 제한 — 근거 추적 하나만으로
    // 점수가 크게 요동치지 않게 한다(전체 채점 체계 재설계는 이번 범위 밖).
    if (hallucinationRatio > 0.4) {
      overallScore = Math.max(0, overallScore - 8);
      criticalIssues.push(
        `[EVIDENCE] 근거 없는 주장 비율이 높습니다 (${evidenceSummary.highRiskHallucination}/${evidenceSummary.checked})`
      );
    } else if (hallucinationRatio === 0 && evidenceSummary.supported / evidenceSummary.checked >= 0.8) {
      overallScore = Math.min(100, overallScore + 3);
    }
  }

  return {
    overallScore,
    sections: evaluated,
    criticalIssues,
    suggestions,
    factConsistency,
    evidenceSummary,
  };
}

/** 품질 점수를 보고서 끝에 붙이는 짧은 메모 (선택) */
export function formatQualityFooter(summary: ReportQualitySummary): string {
  return [
    "",
    "---",
    `*DealMind 자동 품질 점수: ${summary.overallScore}/100*`,
    summary.criticalIssues.length
      ? `*이슈: ${summary.criticalIssues.slice(0, 3).join("; ")}*`
      : "*치명적 이슈 없음*",
  ].join("\n");
}

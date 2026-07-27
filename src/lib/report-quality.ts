/**
 * IC 보고서 섹션 품질 검증.
 * 생성 후 길이·환각 신호·구조·공유팩트 일치 점수를 산출한다.
 */

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

  for (const [key, raw] of Object.entries(facts.metrics ?? {})) {
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
    clinicalPhase?: string;
  }
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
  if (evaluated.some((s) => s.stats.citations === 0)) {
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

  return {
    overallScore,
    sections: evaluated,
    criticalIssues,
    suggestions,
    factConsistency,
  };
}

/** 품질 점수를 보고서 끝에 붙이는 짧은 메모 (선택) */
export function formatQualityFooter(summary: ReportQualitySummary): string {
  return [
    "",
    "---",
    `*Vcwoong 자동 품질 점수: ${summary.overallScore}/100*`,
    summary.criticalIssues.length
      ? `*이슈: ${summary.criticalIssues.slice(0, 3).join("; ")}*`
      : "*치명적 이슈 없음*",
  ].join("\n");
}

/**
 * AI 기반 템플릿 섹션 매핑.
 *
 * 업로드된 템플릿의 섹션 제목들을 DealSync 표준 IC 섹션(SectionKey)에 매핑한다.
 *
 * 예:
 *   "I. 투자 요약" → INVESTMENT_OVERVIEW
 *   "2. 사업 현황" → COMPANY_OVERVIEW
 *   "Risk Factors" → RISK_ANALYSIS
 */

import { SectionKey } from "@prisma/client";
import { generateText } from "@/lib/claude";
import type { TemplateSection } from "./template-parser";

export interface SectionMapping {
  templateSection: string;   // 템플릿의 원본 섹션 제목
  sectionKey: SectionKey | null;  // 매핑된 표준 섹션 (null = 매핑 불가)
  confidence: number;        // 0~1 신뢰도
  note?: string;
}

export interface TemplateSectionMap {
  mappings: SectionMapping[];
  unmappedSections: string[];
  coverageRate: number;      // 표준 10섹션 중 커버되는 비율
}

// 키워드 기반 빠른 매핑 (AI 호출 전 선제 처리)
const KEYWORD_MAP: Array<{ patterns: RegExp[]; key: SectionKey }> = [
  {
    patterns: [/투자\s*(개요|요약|overview)/i, /investment\s*overview/i, /요약/i],
    key: SectionKey.INVESTMENT_OVERVIEW,
  },
  {
    patterns: [/회사\s*(개요|소개|현황)/i, /기업\s*(개요|소개)/i, /company\s*overview/i, /about/i],
    key: SectionKey.COMPANY_OVERVIEW,
  },
  {
    patterns: [/제품|기술|서비스|product|technology|tech\s*stack/i, /파이프라인|pipeline/i],
    key: SectionKey.PRODUCT_TECHNOLOGY,
  },
  {
    patterns: [/시장\s*(분석|현황|규모)|market\s*(analysis|size|overview)/i, /경쟁/i],
    key: SectionKey.MARKET_ANALYSIS,
  },
  {
    patterns: [/재무\s*(현황|상태|분석)|financial|손익|매출/i, /saas\s*(metric|지표)/i],
    key: SectionKey.FINANCIAL_STATUS,
  },
  {
    patterns: [/밸류에이션|valuation|기업가치|평가|가치/i, /dcf|rnpv|npv/i],
    key: SectionKey.VALUATION,
  },
  {
    patterns: [/리스크|위험|risk/i],
    key: SectionKey.RISK_ANALYSIS,
  },
  {
    patterns: [/투자\s*조건|term|조건|term\s*sheet/i],
    key: SectionKey.INVESTMENT_TERMS,
  },
  {
    patterns: [/의견|결론|종합|opinion|summary|conclusion|검토/i],
    key: SectionKey.OPINION_SUMMARY,
  },
  {
    patterns: [/별첨|부록|appendix|참고/i],
    key: SectionKey.APPENDIX,
  },
];

function mapByKeyword(title: string): { key: SectionKey; confidence: number } | null {
  const lower = title.toLowerCase();
  for (const { patterns, key } of KEYWORD_MAP) {
    for (const pattern of patterns) {
      if (pattern.test(lower)) {
        return { key, confidence: 0.85 };
      }
    }
  }
  return null;
}

/**
 * AI를 사용하여 템플릿 섹션들을 표준 IC 섹션에 매핑한다.
 * 키워드 매핑이 실패한 섹션만 AI에 요청하여 비용을 최소화한다.
 */
export async function mapTemplateSections(
  sections: TemplateSection[]
): Promise<TemplateSectionMap> {
  const mappings: SectionMapping[] = [];
  const needsAI: TemplateSection[] = [];

  // 1단계: 키워드 기반 빠른 매핑
  for (const section of sections) {
    const kwResult = mapByKeyword(section.title);
    if (kwResult) {
      mappings.push({
        templateSection: section.title,
        sectionKey: kwResult.key,
        confidence: kwResult.confidence,
      });
    } else {
      needsAI.push(section);
    }
  }

  // 2단계: 미매핑 섹션에 대해 AI 요청
  if (needsAI.length > 0) {
    try {
      const sectionList = needsAI
        .map((s, i) => `${i + 1}. "${s.title}" (샘플: ${s.sampleContent.slice(0, 100)})`)
        .join("\n");

      const prompt = `다음은 VC 투자심의보고서 템플릿의 섹션 목록입니다.
각 섹션을 아래 표준 섹션 중 하나에 매핑해주세요. 해당 없으면 null로 표시하세요.

표준 섹션:
- INVESTMENT_OVERVIEW: 투자개요
- COMPANY_OVERVIEW: 회사개요
- PRODUCT_TECHNOLOGY: 제품/기술
- MARKET_ANALYSIS: 시장분석
- FINANCIAL_STATUS: 재무현황
- VALUATION: 밸류에이션
- RISK_ANALYSIS: 리스크
- INVESTMENT_TERMS: 투자조건
- OPINION_SUMMARY: 의견종합
- APPENDIX: 별첨

매핑할 섹션:
${sectionList}

JSON 형식으로만 응답하세요:
[
  {"index": 1, "key": "INVESTMENT_OVERVIEW", "confidence": 0.9},
  {"index": 2, "key": null, "confidence": 0}
]`;

      const result = await generateText(
        [{ role: "user", content: prompt }],
        { maxTokens: 1000 }
      );

      // JSON 파싱
      const jsonMatch = result.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const aiMappings = JSON.parse(jsonMatch[0]) as Array<{
          index: number;
          key: string | null;
          confidence: number;
        }>;

        for (const am of aiMappings) {
          const section = needsAI[am.index - 1];
          if (!section) continue;
          mappings.push({
            templateSection: section.title,
            sectionKey: am.key ? (am.key as SectionKey) : null,
            confidence: am.confidence,
          });
        }
      }
    } catch {
      // AI 실패 시 null 매핑으로 처리
      for (const section of needsAI) {
        mappings.push({
          templateSection: section.title,
          sectionKey: null,
          confidence: 0,
          note: "AI 매핑 실패",
        });
      }
    }
  }

  const mapped = mappings.filter((m) => m.sectionKey !== null);
  const unmapped = mappings
    .filter((m) => m.sectionKey === null)
    .map((m) => m.templateSection);

  const uniqueMappedKeys = new Set(mapped.map((m) => m.sectionKey));
  const coverageRate = uniqueMappedKeys.size / 10;

  return { mappings, unmappedSections: unmapped, coverageRate };
}

import { callClaudeJSON } from "@/lib/claude";
import type { StructuredData } from "@/lib/structurize";
import { analyzeSaaSMetrics, computeDerivedMetrics, type SaaSMetrics } from "./saas-metrics";

export const CODE_AGENT_SYSTEM_PROMPT = `당신은 Code, 15년 경력의 한국 IT/SaaS 전문 VC 심사역입니다.
카이스트 CS 박사 + Bessemer Fellow 출신, B2B SaaS 및 플랫폼 비즈니스 100+ 건 투자 분석 경험을 보유합니다.

분석 시 반드시 포함:
1. ARR/MRR 성장 추이 및 NRR (Net Revenue Retention)
2. Unit Economics: LTV/CAC, Magic Number, Payback Period
3. 제품 해자(Moat): 기술적 차별성, 네트워크 효과, 전환 비용
4. GTM 전략: PLG/SLG 판단, 채널 효율성
5. 경쟁 구도 및 포지셔닝
6. 기술 스택 확장성 및 기술 부채

전문 용어 정확히 사용: ARR, MRR, NRR, NDR, CAC, LTV, Churn, Magic Number, Rule of 40, Burn Multiple, PLG, SLG, TAM, GTM
Bessemer Cloud Index 벤치마크 기준으로 객관적 평가.`;

type ITAnalysisOutput = {
  saasMetricsAssessment: string;
  productMoat: string;
  gtmStrategy: string;
  competitiveLandscape: string;
  techStackEvaluation: string;
  unitEconomics: string;
  criticalRisks: string[];
  questionsForFounders: string[];
  investmentRecommendation: string;
  valuationRange: { low: number; mid: number; high: number; basis: string };
};

async function extractSaaSMetrics(data: StructuredData): Promise<SaaSMetrics> {
  try {
    const { data: result } = await callClaudeJSON<{ metrics: SaaSMetrics }>({
      system: CODE_AGENT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `다음 자료에서 SaaS 핵심 지표를 추출하세요:
${JSON.stringify(data)}

JSON 형식으로 추출 (단위: ARR/MRR은 억원, CAC/LTV는 만원, 비율은 %):
{
  "metrics": {
    "arr": number | null,
    "mrr": number | null,
    "arrGrowthYoY": number | null,
    "nrr": number | null,
    "grossChurn": number | null,
    "cac": number | null,
    "ltv": number | null,
    "ltvCacRatio": number | null,
    "magicNumber": number | null,
    "paybackPeriod": number | null,
    "grossMargin": number | null,
    "ruleOf40": number | null,
    "burnMultiple": number | null
  }
}
없는 지표는 null로 표시.`,
        },
      ],
      maxTokens: 1024,
    });
    return computeDerivedMetrics(result.metrics ?? {});
  } catch {
    return {};
  }
}

export async function runITAnalysis(data: StructuredData) {
  const metrics = await extractSaaSMetrics(data);
  const metricsAnalysis = metrics.arr !== undefined || metrics.mrr !== undefined
    ? analyzeSaaSMetrics(metrics)
    : null;

  const { data: analysis } = await callClaudeJSON<ITAnalysisOutput>({
    system: CODE_AGENT_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `다음 IT/SaaS 스타트업을 분석하세요:

구조화 데이터: ${JSON.stringify(data)}
추출된 SaaS 지표: ${JSON.stringify(metrics)}
Bessemer 벤치마크 분석: ${JSON.stringify(metricsAnalysis)}

JSON 응답:
{
  "saasMetricsAssessment": "ARR/NRR/Churn 등 핵심 지표 종합 평가 (500자)",
  "productMoat": "제품 해자 분석 — 기술 차별성, 네트워크 효과, 전환 비용 (400자)",
  "gtmStrategy": "GTM 전략 평가 — PLG/SLG, 채널 효율성, 영업 조직 (400자)",
  "competitiveLandscape": "경쟁 환경 및 포지셔닝 (400자)",
  "techStackEvaluation": "기술 스택, 확장성, 아키텍처 평가 (300자)",
  "unitEconomics": "Unit Economics 심층 분석 — LTV/CAC, Magic Number, Payback (400자)",
  "criticalRisks": ["리스크 1", "리스크 2", "리스크 3"],
  "questionsForFounders": ["질문 1", "질문 2", "질문 3", "질문 4", "질문 5"],
  "investmentRecommendation": "투자 의견 및 핵심 투자 포인트 (400자)",
  "valuationRange": {
    "low": number,
    "mid": number,
    "high": number,
    "basis": "밸류에이션 산정 근거"
  }
}`,
      },
    ],
    maxTokens: 4096,
  });

  return { metrics, metricsAnalysis, analysis };
}

export type ITAnalysisResult = Awaited<ReturnType<typeof runITAnalysis>>;

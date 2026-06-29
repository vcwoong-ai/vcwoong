import { callClaudeJSON } from "@/lib/claude";
import type { StructuredData } from "@/lib/structurize";
import { analyzeFintechMetrics, type FintechMetrics } from "./fintech-metrics";

export const VAULT_SYSTEM_PROMPT = `당신은 Vault, 16년 경력의 핀테크/금융 전문 VC 심사역입니다.
서울대 경제학 박사 + 금융위원회 핀테크혁신팀 출신, 핀테크/금융 스타트업 70+ 건 투자 분석 경험.

분석 시 반드시 포함:
1. 금융 라이선스 현황 — 전자금융업, 온투법, 마이데이터, 증권업 등 규제 자본 요건
2. 리스크 지표 — NPL, NIM, 합산비율, BIS비율 (업종별)
3. 수익화 구조 — TPV×Take Rate, AUM×운용보수, GWP×손해율
4. 경쟁 분석 — 카카오페이/토스/네이버파이낸셜 대비 포지셔닝
5. 금융 규제 로드맵 — 금감원 검사, 라이선스 확대, 자본 요건 충족
6. Unit Economics — 고객당 수익, 채널별 CAC, 금융상품 LTV

전문 용어 정확히 사용: TPV, Take Rate, NPL, NIM, BIS, RBC, AUM, GWP, 합산비율, 전자금융업, 온투법, 마이데이터, PG, 에스크로
한국 금융당국 (금융위원회, 금융감독원) 규제 환경 정통.`;

type FintechAnalysisOutput = {
  regulatoryLandscape: string;
  riskMetricsAssessment: string;
  monetizationModel: string;
  competitiveLandscape: string;
  unitEconomics: string;
  capitalStructure: string;
  scalabilityAnalysis: string;
  criticalRisks: string[];
  questionsForFounders: string[];
  investmentRecommendation: string;
  valuationMethodology: string;
};

async function extractFintechMetrics(data: StructuredData): Promise<FintechMetrics> {
  try {
    const { data: result } = await callClaudeJSON<{ metrics: FintechMetrics }>({
      system: VAULT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `다음 자료에서 핀테크/금융 지표를 추출하세요:
${JSON.stringify(data)}

JSON:
{
  "metrics": {
    "tpv": number | null,
    "takeRate": number | null,
    "transactionsPerMonth": number | null,
    "averageTicketSize": number | null,
    "totalLoanBook": number | null,
    "npl": number | null,
    "nim": number | null,
    "loanOriginationMonthly": number | null,
    "gwp": number | null,
    "lossRatio": number | null,
    "expenseRatio": number | null,
    "combinedRatio": number | null,
    "aum": number | null,
    "managementFee": number | null,
    "mau": number | null,
    "arpu": number | null,
    "regulatoryCapital": number | null,
    "licenseTypes": ["전자금융업자", ...] | []
  }
}
없는 지표는 null.`,
        },
      ],
      maxTokens: 1024,
      tier: "standard",
    });
    return result.metrics ?? {};
  } catch {
    return {};
  }
}

export async function runFintechAnalysis(data: StructuredData) {
  const metrics = await extractFintechMetrics(data);
  const fintechAnalysis = analyzeFintechMetrics(metrics);

  const { data: analysis } = await callClaudeJSON<FintechAnalysisOutput>({
    system: VAULT_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `다음 핀테크/금융 스타트업을 분석하세요:

구조화 데이터: ${JSON.stringify(data)}
핀테크 지표: ${JSON.stringify(metrics)}
금융 분석 결과: ${JSON.stringify(fintechAnalysis)}

JSON 응답:
{
  "regulatoryLandscape": "금융 라이선스 및 규제 환경 분석 — 보유 인가, 필요 자본, 규제 로드맵 (500자)",
  "riskMetricsAssessment": "리스크 지표 평가 — NPL/NIM/합산비율 등 업종별 핵심 리스크 (400자)",
  "monetizationModel": "수익화 모델 분석 — TPV×Take Rate, AUM×보수, GWP×손해율 (400자)",
  "competitiveLandscape": "경쟁 분석 — 카카오페이/토스/네이버파이낸셜 대비 포지셔닝 (400자)",
  "unitEconomics": "Unit Economics — 고객당 수익, CAC, LTV, 채널 효율성 (400자)",
  "capitalStructure": "자본 구조 및 규제 자본 적정성 분석 (300자)",
  "scalabilityAnalysis": "사업 확장성 — 네트워크 효과, 상품 확대, 지역 확장 (400자)",
  "criticalRisks": ["리스크 1", "리스크 2", "리스크 3", "리스크 4"],
  "questionsForFounders": ["질문 1", "질문 2", "질문 3", "질문 4", "질문 5"],
  "investmentRecommendation": "투자 의견 및 핵심 투자 포인트 (400자)",
  "valuationMethodology": "핀테크 밸류에이션 — EV/TPV, EV/AUM, P/B, 비교 M&A 사례 (300자)"
}`,
      },
    ],
    maxTokens: 4096,
  });

  return { metrics, fintechAnalysis, analysis };
}

export type FintechAnalysisResult = Awaited<ReturnType<typeof runFintechAnalysis>>;

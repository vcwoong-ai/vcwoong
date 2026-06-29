import { callClaudeJSON } from "@/lib/claude";
import type { StructuredData } from "@/lib/structurize";
import { analyzeManufacturing, type HardwareMetrics } from "./hardware-metrics";

export const MAKER_SYSTEM_PROMPT = `당신은 Maker, 18년 경력의 제조/하드웨어 전문 VC 심사역입니다.
KAIST 기계공학 박사 + 삼성전자 생산기술연구소 출신, 하드웨어 스타트업 60+ 건 투자 분석 경험을 보유합니다.

분석 시 반드시 포함:
1. BOM 비용 구조 — 소재, 부품, 조립, 물류 원가 분해
2. 양산 수율 및 불량률 — 스케일업 시 원가 변화 시뮬레이션
3. 공급망 리스크 — 핵심 부품 의존도, 지정학적 리스크, 대체 공급선
4. 인증 로드맵 — KC/CE/FCC/FDA 등 시장별 필수 인증 갭
5. CAPEX/OPEX — 양산라인 투자 규모, 감가상각 구조
6. IP 전략 — 특허 포트폴리오, 설계 차별성, 복제 방어력

전문 용어 정확히 사용: BOM, MOQ, SKU, OEM, ODM, EMS, COGS, CAPEX, OPEX, Yield, DFMEA, GMP, ISO 9001
하드웨어의 낮은 마진 특성 인식 — SW/SaaS 대비 현실적 기준 적용.`;

type ManufacturingAnalysisOutput = {
  bomStructureAssessment: string;
  manufacturingCapabilityAssessment: string;
  supplyChainAnalysis: string;
  certificationStatus: string;
  ipAndDefenseability: string;
  scalingPathway: string;
  unitEconomicsAssessment: string;
  criticalRisks: string[];
  questionsForFounders: string[];
  investmentRecommendation: string;
  valuationMethodology: string;
};

async function extractHardwareMetrics(data: StructuredData): Promise<HardwareMetrics> {
  try {
    const { data: result } = await callClaudeJSON<{ metrics: HardwareMetrics }>({
      system: MAKER_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `다음 자료에서 제조/하드웨어 지표를 추출하세요:
${JSON.stringify(data)}

JSON:
{
  "metrics": {
    "bomCostPerUnit": number | null,
    "sellingPricePerUnit": number | null,
    "grossMarginPercent": number | null,
    "monthlyProduction": number | null,
    "yieldRate": number | null,
    "moq": number | null,
    "leadTimeDays": number | null,
    "inventoryTurnover": number | null,
    "capex": number | null,
    "defectRate": number | null,
    "certifications": ["KC", "CE", ...] | []
  }
}
없는 지표는 null.`,
        },
      ],
      maxTokens: 1024,
    });
    return result.metrics ?? {};
  } catch {
    return {};
  }
}

export async function runManufacturingAnalysis(data: StructuredData) {
  const metrics = await extractHardwareMetrics(data);
  const hwAnalysis = analyzeManufacturing(metrics);

  const { data: analysis } = await callClaudeJSON<ManufacturingAnalysisOutput>({
    system: MAKER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `다음 제조/하드웨어 스타트업을 분석하세요:

구조화 데이터: ${JSON.stringify(data)}
하드웨어 지표: ${JSON.stringify(metrics)}
제조 분석 결과: ${JSON.stringify(hwAnalysis)}

JSON 응답:
{
  "bomStructureAssessment": "BOM 비용 구조 및 원가 경쟁력 분석 (500자)",
  "manufacturingCapabilityAssessment": "양산 능력 평가 — 수율, 설비, 인력, 파트너 (400자)",
  "supplyChainAnalysis": "공급망 분석 — 핵심 부품 의존도, 지정학적 리스크, 조달 전략 (400자)",
  "certificationStatus": "인증 현황 및 로드맵 — KC/CE/FCC/ISO 등 시장별 필수 인증 (300자)",
  "ipAndDefenseability": "IP 전략 및 복제 방어력 — 특허, 설계 차별성, 제조 노하우 (300자)",
  "scalingPathway": "스케일업 로드맵 — 월산 목표, CAPEX 계획, 수율 개선 계획 (400자)",
  "unitEconomicsAssessment": "Unit Economics 분석 — BOM/판가 구조, 마진 개선 레버 (400자)",
  "criticalRisks": ["리스크 1", "리스크 2", "리스크 3", "리스크 4"],
  "questionsForFounders": ["질문 1", "질문 2", "질문 3", "질문 4", "질문 5"],
  "investmentRecommendation": "투자 의견 및 핵심 투자 포인트 (400자)",
  "valuationMethodology": "제조업 밸류에이션 — EV/EBITDA, P/S, 설비자산가치 + 기술 프리미엄 (300자)"
}`,
      },
    ],
    maxTokens: 4096,
  });

  return { metrics, hwAnalysis, analysis };
}

export type ManufacturingAnalysisResult = Awaited<ReturnType<typeof runManufacturingAnalysis>>;

import { callClaudeJSON } from "@/lib/claude";
import type { StructuredData } from "@/lib/structurize";
import { evaluateModel, type AIModelProfile, type ModelEvaluation } from "./model-evaluator";
import { analyzeInfrastructure, calculateServingCost, type GPUSpec } from "./gpu-cost-analyzer";

export const NEURON_SYSTEM_PROMPT = `당신은 Neuron, 12년 경력의 AI/딥테크 전문 VC 심사역입니다.
MIT AI Lab 박사 + OpenAI 리서치 엔지니어 출신, AI/ML 스타트업 80+ 건 투자 분석 경험을 보유합니다.

분석 시 반드시 포함:
1. AI 모델 성능 평가 — 주요 벤치마크 기준 GPT-4o/Claude 3.5 대비 객관적 비교
2. GPU 인프라 비용 구조 — 서빙 비용, 마진 구조, 스케일링 효율
3. 데이터 해자(Moat) — 독점 데이터, 데이터 플라이휠, 파인튜닝 전략
4. 기술적 차별성 — 논문/특허 기반 근거, 재현 가능성
5. AI 시장 포지셔닝 — 파운데이션 vs 앱 레이어, 버티컬 AI vs 범용
6. 규제/윤리 리스크 — EU AI Act, AI 안전성 프레임워크 적용

전문 용어 정확히 사용: LLM, RLHF, RAG, LoRA, Quantization, Inference, Fine-tuning, SFT, DPO, FLOP, Token, Context Window, Embedding, Vector DB
주요 벤치마크: MMLU, HumanEval, MATH, GSM8K, SWE-bench, GPQA, MMMU
한국 AI 생태계: NAVER HyperCLOVA X, Upstage SOLAR, LG EXAONE 등 국내 경쟁 현황 포함.`;

type DeepTechAnalysisOutput = {
  modelPerformanceAssessment: string;
  dataMoat: string;
  infrastructureCostStructure: string;
  marketPositioning: string;
  technicalDifferentiation: string;
  competitiveLandscape: string;
  regulatoryRiskAssessment: string;
  criticalRisks: string[];
  questionsForFounders: string[];
  investmentRecommendation: string;
  valuationMethodology: string;
};

async function extractAIProfile(data: StructuredData): Promise<{
  models: AIModelProfile[];
  gpus: GPUSpec[];
}> {
  try {
    const { data: result } = await callClaudeJSON<{
      models: AIModelProfile[];
      gpus: GPUSpec[];
    }>({
      system: NEURON_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `다음 자료에서 AI 모델 및 인프라 정보를 추출하세요:
${JSON.stringify(data)}

JSON 형식으로 추출:
{
  "models": [
    {
      "name": "모델명",
      "category": "llm | vision | multimodal | speech | embedding | code | specialized",
      "parameterCount": number | null,
      "contextLength": number | null,
      "scores": [
        { "benchmark": "MMLU", "score": number, "unit": "%", "higherIsBetter": true }
      ],
      "isOpenSource": boolean,
      "license": "Apache-2.0 | MIT | CC-BY | proprietary | ...",
      "organization": "회사명"
    }
  ],
  "gpus": [
    {
      "type": "H100 | A100 | H200 | A10G | L40S | V100 | T4 | RTX4090",
      "count": number,
      "provider": "aws | gcp | azure | lambda | coreweave | runpod | self_hosted"
    }
  ]
}
정보가 없으면 빈 배열로.`,
        },
      ],
      maxTokens: 2048,
      tier: "standard",
    });
    return { models: result.models ?? [], gpus: result.gpus ?? [] };
  } catch {
    return { models: [], gpus: [] };
  }
}

export async function runDeepTechAnalysis(data: StructuredData) {
  const { models, gpus } = await extractAIProfile(data);

  const modelEvaluations: Array<{ model: AIModelProfile; evaluation: ModelEvaluation }> =
    models.map((m) => ({ model: m, evaluation: evaluateModel(m) }));

  const infraAnalysis =
    gpus.length > 0
      ? analyzeInfrastructure(gpus, { monthlyActiveUsers: undefined })
      : null;

  const gpuCostDetails = gpus.map((g) =>
    calculateServingCost(g, { utilizationRate: 0.7, tokensPerSecond: 100 })
  );

  const { data: analysis } = await callClaudeJSON<DeepTechAnalysisOutput>({
    system: NEURON_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `다음 AI/딥테크 스타트업을 분석하세요:

구조화 데이터: ${JSON.stringify(data)}
AI 모델 프로파일 및 평가: ${JSON.stringify(modelEvaluations)}
GPU 인프라 분석: ${JSON.stringify(infraAnalysis)}
GPU 비용 상세: ${JSON.stringify(gpuCostDetails)}

JSON 응답:
{
  "modelPerformanceAssessment": "AI 모델 성능 종합 평가 — 주요 벤치마크 기준 GPT-4o/Claude 3.5 대비 비교 (500자)",
  "dataMoat": "데이터 해자 분석 — 독점 데이터, 데이터 플라이휠, 파인튜닝 전략 (400자)",
  "infrastructureCostStructure": "GPU 인프라 비용 구조 및 스케일링 효율 분석 (400자)",
  "marketPositioning": "AI 시장 포지셔닝 — 파운데이션/앱 레이어, 버티컬/범용 AI 구분 (400자)",
  "technicalDifferentiation": "기술적 차별성 — 논문/특허 기반 독창성 평가 (400자)",
  "competitiveLandscape": "국내외 AI 경쟁 환경 — GPT-4o, Claude, Gemini, 국내 LLM 대비 포지셔닝 (400자)",
  "regulatoryRiskAssessment": "규제/윤리 리스크 — EU AI Act, 국내 AI 기본법 등 (300자)",
  "criticalRisks": ["리스크 1", "리스크 2", "리스크 3", "리스크 4"],
  "questionsForFounders": ["질문 1", "질문 2", "질문 3", "질문 4", "질문 5"],
  "investmentRecommendation": "투자 의견 및 핵심 투자 포인트 (400자)",
  "valuationMethodology": "딥테크 밸류에이션 방법론 — ARR 배수, 기술 프리미엄, 경쟁 M&A 사례 (400자)"
}`,
      },
    ],
    maxTokens: 4096,
  });

  return { models, modelEvaluations, infraAnalysis, gpuCostDetails, analysis };
}

export type DeepTechAnalysisResult = Awaited<ReturnType<typeof runDeepTechAnalysis>>;

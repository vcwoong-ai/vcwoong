/**
 * AI 모델 성능 평가 모듈
 * 주요 AI 벤치마크 leaderboard 기준 비교 및 평가
 */

export interface ModelBenchmarkScore {
  benchmark: string;
  score: number;
  unit?: string;
  higherIsBetter: boolean;
}

export interface AIModelProfile {
  name: string;
  category: "llm" | "vision" | "multimodal" | "speech" | "embedding" | "code" | "specialized";
  parameterCount?: number;  // 억 파라미터
  contextLength?: number;   // 토큰
  scores: ModelBenchmarkScore[];
  isOpenSource: boolean;
  license?: string;
  organization?: string;
}

// 주요 벤치마크 기준값 (2024 SOTA 기준)
export const BENCHMARK_SOTA_2024: Record<string, { sota: number; gpt4o: number; claude35sonnet: number }> = {
  // LLM 추론
  "MMLU": { sota: 92.0, gpt4o: 88.7, claude35sonnet: 88.7 },
  "HumanEval": { sota: 96.4, gpt4o: 90.2, claude35sonnet: 92.0 },
  "MATH": { sota: 94.6, gpt4o: 76.6, claude35sonnet: 71.1 },
  "GSM8K": { sota: 97.7, gpt4o: 95.2, claude35sonnet: 96.4 },
  "GPQA": { sota: 74.0, gpt4o: 53.6, claude35sonnet: 59.4 },
  "SWE-bench Verified": { sota: 55.0, gpt4o: 33.2, claude35sonnet: 49.0 },
  // 한국어
  "KoMT-Bench": { sota: 9.2, gpt4o: 8.9, claude35sonnet: 8.8 },
  "KLUE-MRC": { sota: 94.0, gpt4o: 88.5, claude35sonnet: 87.0 },
  // 멀티모달
  "MMMU": { sota: 76.7, gpt4o: 69.1, claude35sonnet: 68.3 },
  "DocVQA": { sota: 95.8, gpt4o: 92.8, claude35sonnet: 95.2 },
};

export type ModelTier = "frontier" | "competitive" | "specialized" | "commodity" | "insufficient_data";

export interface ModelEvaluation {
  tier: ModelTier;
  vsGPT4o: string;      // +/- % 상대 성능
  vsClaude35: string;
  vsSOTA: string;
  benchmarkSummary: string;
  differentiators: string[];
  limitations: string[];
  recommendedUseCases: string[];
}

export function evaluateModel(model: AIModelProfile): ModelEvaluation {
  if (model.scores.length === 0) {
    return {
      tier: "insufficient_data",
      vsGPT4o: "N/A",
      vsClaude35: "N/A",
      vsSOTA: "N/A",
      benchmarkSummary: "벤치마크 데이터 부족 — 독립적 평가 필요",
      differentiators: [],
      limitations: ["공개 벤치마크 미제출"],
      recommendedUseCases: [],
    };
  }

  // 알려진 벤치마크에서 상대 성능 계산
  let totalRelativeToGPT4o = 0;
  let totalRelativeToClaude = 0;
  let totalRelativeToSOTA = 0;
  let counted = 0;

  for (const score of model.scores) {
    const ref = BENCHMARK_SOTA_2024[score.benchmark];
    if (!ref) continue;
    const direction = score.higherIsBetter ? 1 : -1;
    totalRelativeToGPT4o += direction * ((score.score - ref.gpt4o) / ref.gpt4o) * 100;
    totalRelativeToClaude += direction * ((score.score - ref.claude35sonnet) / ref.claude35sonnet) * 100;
    totalRelativeToSOTA += direction * ((score.score - ref.sota) / ref.sota) * 100;
    counted++;
  }

  const avgVsGPT4o = counted > 0 ? totalRelativeToGPT4o / counted : 0;
  const avgVsClaude = counted > 0 ? totalRelativeToClaude / counted : 0;
  const avgVsSOTA = counted > 0 ? totalRelativeToSOTA / counted : 0;

  // 티어 분류
  let tier: ModelTier;
  if (avgVsSOTA >= -5) tier = "frontier";
  else if (avgVsGPT4o >= -5) tier = "competitive";
  else if (model.category === "specialized" || (model.scores.length > 0 && avgVsGPT4o >= -20)) tier = "specialized";
  else tier = "commodity";

  const formatPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

  const differentiators: string[] = [];
  const limitations: string[] = [];
  const recommendedUseCases: string[] = [];

  if (model.isOpenSource) {
    differentiators.push("오픈소스 — 온프레미스 배포 및 파인튜닝 가능");
    recommendedUseCases.push("데이터 보안 요구 엔터프라이즈 (온프레미스 배포)");
  }
  if (model.category === "specialized") {
    differentiators.push("특화 도메인 성능 우위 — 범용 모델 대비 비용 효율적");
  }
  if (model.parameterCount && model.parameterCount < 10) {
    differentiators.push(`경량 모델 (${model.parameterCount}B) — 엣지 배포 및 저비용 추론 가능`);
    recommendedUseCases.push("엣지/모바일 AI 배포");
    recommendedUseCases.push("고빈도 추론 API (저지연 요구)");
  }
  if (tier === "frontier") {
    recommendedUseCases.push("복잡한 추론 및 코드 생성");
    recommendedUseCases.push("전문 도메인 분석 보고서 자동화");
  }
  if (tier === "commodity") {
    limitations.push("주요 벤치마크에서 GPT-4o 대비 열세 — 차별화 전략 명확화 필요");
  }
  if (!model.isOpenSource) {
    limitations.push("클로즈드 소스 — 파인튜닝 제약, 고객 온프레미스 요구 대응 어려움");
  }

  const tierLabel: Record<ModelTier, string> = {
    frontier: "프론티어 모델 — SOTA 수준",
    competitive: "경쟁력 있는 모델 — GPT-4o급",
    specialized: "특화 모델 — 도메인 경쟁력 보유",
    commodity: "범용 모델 — 차별화 포인트 재검토 필요",
    insufficient_data: "데이터 불충분",
  };

  return {
    tier,
    vsGPT4o: formatPct(avgVsGPT4o),
    vsClaude35: formatPct(avgVsClaude),
    vsSOTA: formatPct(avgVsSOTA),
    benchmarkSummary: tierLabel[tier],
    differentiators,
    limitations,
    recommendedUseCases,
  };
}

// 한국 AI 업계 주요 플레이어 벤치마크 참조 데이터 (2024)
export const KOREAN_AI_REFERENCE: Record<string, { org: string; model: string; category: string; note: string }> = {
  hyperclova_x: { org: "NAVER", model: "HyperCLOVA X", category: "llm", note: "한국어 SOTA, 기업용 RAG 강점" },
  solar_pro: { org: "Upstage", model: "SOLAR Pro", category: "llm", note: "LLM 리더보드 상위권, 소형 고성능" },
  exaone3: { org: "LG AI Research", model: "EXAONE 3.0", category: "llm", note: "오픈소스, 한국어 특화" },
  clovax: { org: "NAVER Cloud", model: "CLOVA X", category: "llm", note: "엔터프라이즈 API" },
  koni: { org: "Kakao", model: "KoNI", category: "llm", note: "카카오 인프라 연동" },
};

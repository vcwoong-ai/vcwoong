/**
 * AI/딥테크 IR 문서에서 GPU·모델 단서 추출 + 인프라 비용 추정
 */

import { calculateServingCost } from "@/agents/sectors/deeptech/gpu-cost-analyzer";
import { evaluateModel, type AIModelProfile } from "@/agents/sectors/deeptech/model-evaluator";

export function extractDeepTechSignals(text: string): {
  gpuMention: string | null;
  modelMention: string | null;
  trlHint: number | null;
} {
  const gpu =
    text.match(/(H100|H200|A100|A10G|L40S|V100)/i)?.[1] ?? null;
  const model =
    text.match(/(GPT-4|Claude|LLaMA|SOLAR|EXAONE|HyperCLOVA|Gemini)[\w.-]*/i)?.[0] ?? null;

  let trlHint: number | null = null;
  if (/TRL\s*([6-9])/i.test(text)) trlHint = parseInt(text.match(/TRL\s*([6-9])/i)![1]);
  else if (/상용화|양산|production/i.test(text)) trlHint = 8;
  else if (/파일럿|pilot/i.test(text)) trlHint = 6;
  else if (/PoC|proof of concept/i.test(text)) trlHint = 4;

  return { gpuMention: gpu, modelMention: model, trlHint };
}

export function formatDeepTechAnalysisForPrompt(text: string): string {
  const signals = extractDeepTechSignals(text);
  const lines = ["## 🧠 Neuron 에이전트 — AI 인프라 자동 분석"];

  if (signals.trlHint) {
    lines.push(`- 추정 TRL: **${signals.trlHint}/9** (문서 기반)`);
  }

  const gpuType = (signals.gpuMention?.toUpperCase() ?? "A100") as "H100" | "A100" | "A10G";
  const cost = calculateServingCost(
    { type: gpuType, count: 8, provider: "lambda" },
    { utilizationRate: 0.7, tokensPerSecond: 50 }
  );

  lines.push(
    `- GPU 인프라 추정 (${gpuType}×8, Lambda Labs):`,
    `  - 월간 실효 비용: $${cost.effectiveMonthlyCostUSD.toLocaleString()} (약 ${Math.round(cost.effectiveMonthlyCostUSD * 1350 / 10000)}만원)`,
  );

  if (cost.costPer1MTokensKRW) {
    lines.push(`  - 추정 추론 원가: ${cost.costPer1MTokensKRW.toLocaleString()}원 / 1M tokens`);
  }

  if (signals.modelMention) {
    const profile: AIModelProfile = {
      name: signals.modelMention,
      category: "llm",
      scores: [],
      isOpenSource: /llama|solar|exaone/i.test(signals.modelMention),
    };
    const evalResult = evaluateModel(profile);
    lines.push(`- 모델 평가 (${signals.modelMention}): ${evalResult.benchmarkSummary}`);
    if (evalResult.recommendedUseCases.length) {
      lines.push(`  - 권장 활용: ${evalResult.recommendedUseCases.join(", ")}`);
    }
  }

  lines.push("\n위 수치를 제품/기술·밸류에이션 섹션에 반영하세요.");
  return "\n\n" + lines.join("\n") + "\n";
}

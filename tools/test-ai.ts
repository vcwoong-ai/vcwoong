/**
 * OpenRouter 연동 스모크 테스트
 * Usage: npm run test:ai
 * Requires: OPENROUTER_API_KEY in .env.local
 *
 * 설정된 AI_MODEL이 실제로 호출 가능한지(모델 ID 오타·권한·크레딧 포함)를
 * 빠르게 확인한다. 실패 시 원인을 그대로 출력한다.
 */

async function main() {
  const key = process.env.OPENROUTER_API_KEY?.trim() ?? "";

  console.log("\n=== DealMind AI 테스트 ===\n");
  console.log(
    `OPENROUTER_API_KEY: ${key.startsWith("sk-or-") ? "✅ 설정됨" : "❌ 없음"}`
  );

  if (!key.startsWith("sk-or-")) {
    console.log("\n⚠️  .env.local에 OPENROUTER_API_KEY=sk-or-... 를 넣고 다시 실행하세요.");
    console.log("   키 발급: https://openrouter.ai/keys\n");
    process.exit(1);
  }

  const { generateText, isAIConfigured, MODEL, FALLBACK_MODEL } = await import(
    "../src/lib/claude"
  );

  console.log(`AI_MODEL: ${MODEL}`);
  console.log(`AI_FALLBACK_MODEL: ${FALLBACK_MODEL}\n`);

  if (!isAIConfigured()) {
    console.log("❌ isAIConfigured() = false");
    process.exit(1);
  }

  console.log("📡 OpenRouter 호출 중...\n");

  const start = Date.now();
  const { content, inputTokens, outputTokens, usedModel } = await generateText(
    [
      {
        role: "user",
        content:
          "헬스케어AI Inc. Series B 투자 검토. AI 신약 플랫폼, Phase II 항암 파이프라인. " +
          "투자개요 3문장만 한국어로 작성해줘.",
      },
    ],
    {
      systemPrompt:
        "당신은 DealMind(딜마인드) BIO 투자심사 AI입니다. 간결하고 전문적으로 작성하세요.",
      maxTokens: 512,
    }
  );

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log("--- AI 출력 ---");
  console.log(content);
  console.log("---------------");
  console.log(`\n✅ 성공 (${elapsed}s)`);
  console.log(`   실제 사용 모델: ${usedModel}`);
  if (usedModel !== MODEL) {
    console.log(`   ⚠️  기본 모델(${MODEL})이 실패해 폴백으로 응답했습니다.`);
    console.log("      AI_MODEL 값이 OpenRouter에 존재하는 ID인지 확인하세요.");
  }
  console.log(`   토큰: input ${inputTokens} / output ${outputTokens}\n`);
}

main().catch((err) => {
  console.error("\n❌ 실패:", err instanceof Error ? err.message : err);
  process.exit(1);
});

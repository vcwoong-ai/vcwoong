/**
 * Gemini API 연동 테스트
 * Usage: npm run test:ai
 * Requires: GEMINI_API_KEY in .env.local
 */

async function main() {
  const key = process.env.GEMINI_API_KEY?.trim() ?? "";
  const model = process.env.AI_MODEL ?? "gemini-2.5-flash";

  console.log("\n=== Axiom AI 테스트 ===\n");
  console.log(`GEMINI_API_KEY: ${key.startsWith("AIza") ? "✅ 설정됨" : "❌ 없음"}`);
  console.log(`AI_MODEL: ${model}\n`);

  if (!key.startsWith("AIza")) {
    console.log("⚠️  .env.local에 GEMINI_API_KEY=AIza... 를 넣고 다시 실행하세요.");
    console.log("   키 발급: https://aistudio.google.com/apikey\n");
    process.exit(1);
  }

  const { generateText, isAIConfigured } = await import("../src/lib/claude");

  if (!isAIConfigured()) {
    console.log("❌ isAIConfigured() = false");
    process.exit(1);
  }

  console.log("📡 Gemini 호출 중...\n");

  const start = Date.now();
  const { content, inputTokens, outputTokens } = await generateText(
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
        "당신은 Axiom(액시엄) BIO 투자심사 AI입니다. 간결하고 전문적으로 작성하세요.",
      maxTokens: 512,
    }
  );

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log("--- AI 출력 ---");
  console.log(content);
  console.log("---------------");
  console.log(`\n✅ 성공 (${elapsed}s)`);
  console.log(`   토큰: input ${inputTokens} / output ${outputTokens}\n`);
}

main().catch((err) => {
  console.error("\n❌ 실패:", err instanceof Error ? err.message : err);
  process.exit(1);
});

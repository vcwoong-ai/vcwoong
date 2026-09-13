/**
 * Investment Quality Layer(Phase 1) 회귀 테스트 — 프롬프트 문자열 자체를
 * 고정한다. 코드가 아니라 자연어 지시라서 "빌드는 되는데 문구가 조용히
 * 사라지는" 회귀를 잡을 방법이 이것뿐이다.
 * Usage: npm run test:investment-quality-layer
 */
import { readFileSync } from "fs";
import { AgentType, DealSector } from "@prisma/client";
import { getSystemPrompt, BASE_SYSTEM_PROMPT } from "../src/prompts/system-prompts";
import { buildSectionPrompt } from "../src/prompts/section-prompts";
import { SectionKey } from "@prisma/client";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function main() {
  console.log("\n=== DealMind Investment Quality Layer(Phase 1) 테스트 ===\n");

  // 1. BASE_SYSTEM_PROMPT: 4단계 근거 등급
  assert(BASE_SYSTEM_PROMPT.includes("명시(explicit)"), "explicit 등급 누락");
  assert(BASE_SYSTEM_PROMPT.includes("계산(calculated)"), "calculated 등급 누락");
  assert(BASE_SYSTEM_PROMPT.includes("추정(estimated)"), "estimated 등급 누락");
  assert(BASE_SYSTEM_PROMPT.includes("불명(unknown)"), "unknown 등급 누락");
  console.log("✅ 4단계 근거 등급(explicit/calculated/estimated/unknown) 명시됨");

  // 2. 절대 임의로 채우지 않는 수치 목록 — 딥테크 사고(GPU 비용)의 핵심 항목 포함
  for (const term of ["GPU 수량·성능·가격", "ARR", "TAM/SAM/SOM", "밸류에이션"]) {
    assert(BASE_SYSTEM_PROMPT.includes(term), `금지 수치 목록에 "${term}" 누락`);
  }
  console.log("✅ 임의 생성 금지 수치 목록에 GPU 비용 관련 항목 포함(사고 재발 방지)");

  // 3. 모델명만으로 스펙 추정 금지 — H100 예시 그대로 고정
  assert(BASE_SYSTEM_PROMPT.includes("NVIDIA H100"), "모델명만으로 스펙 추정 금지 예시 누락");
  assert(BASE_SYSTEM_PROMPT.includes("tokens/sec"), "GPU 처리량 추정 금지 항목 누락");
  console.log("✅ 모델명만으로 GPU 세부 스펙(개수·전력·처리량) 추정 금지 지침 존재");

  // 4. Claim / Fact / Interpretation 3단 분리
  assert(BASE_SYSTEM_PROMPT.includes("회사 주장"), "회사 주장 분리 지침 누락");
  assert(BASE_SYSTEM_PROMPT.includes("확인된 사실"), "확인된 사실 분리 지침 누락");
  console.log("✅ 회사 주장 / 확인된 사실 / 투자 해석 분리 지침 존재");

  // 5. 6개 섹터 전부 + General/Climate/Consumer에 공통 suffix가 실제로 붙는지
  const combos: Array<[AgentType, DealSector | undefined]> = [
    [AgentType.BIO, DealSector.BIO],
    [AgentType.IT, DealSector.IT],
    [AgentType.FINTECH, DealSector.FINTECH],
    [AgentType.DEEPTECH, DealSector.DEEPTECH],
    [AgentType.MANUFACTURING, DealSector.MANUFACTURING],
    [AgentType.CONTENT, DealSector.CONTENT],
    [AgentType.GENERAL, undefined],
  ];
  for (const [agentType, sector] of combos) {
    const prompt = getSystemPrompt(agentType, sector);
    assert(
      prompt.includes("섹터 전문 분석 항목 적용 원칙"),
      `${agentType}/${sector} 프롬프트에 공통 suffix 누락`
    );
    assert(prompt.includes(BASE_SYSTEM_PROMPT), `${agentType}/${sector} 프롬프트에 BASE 원칙 누락`);
  }
  console.log("✅ 6개 섹터 + General 전부 BASE 원칙과 '억지로 채우지 말라' suffix 포함");

  // 6. section-prompts.ts 공통 지침: 근거 등급·claim 분리 문구가 실제 섹션 프롬프트에 반영됨
  const sectionPrompt = buildSectionPrompt(SectionKey.FINANCIAL_STATUS, {
    companyName: "테스트기업",
    sector: "DEEPTECH",
    documentContext: "제공된 자료 없음",
  });
  assert(sectionPrompt.includes("근거 등급"), "섹션 프롬프트에 근거 등급 지침 누락");
  assert(sectionPrompt.includes("회사는 ~라고 주장한다"), "섹션 프롬프트에 claim 분리 예시 누락");
  console.log("✅ 섹션 프롬프트에 근거 등급·claim 분리 지침 반영됨");

  // 7. 시장분석: TAM→SAM→SOM 순서 + 역산 금지
  const marketPrompt = buildSectionPrompt(SectionKey.MARKET_ANALYSIS, {
    companyName: "테스트기업",
    sector: "IT",
    documentContext: "제공된 자료 없음",
  });
  assert(marketPrompt.includes("TAM→SAM→SOM"), "TAM/SAM/SOM 산출 순서 지침 누락");
  assert(marketPrompt.includes("역산하지"), "SOM 역산 금지 지침 누락");
  console.log("✅ 시장분석 섹션에 TAM→SAM→SOM 순서·SOM 역산 금지 지침 반영됨");

  // 8. (Phase 2) 사업성("돈이 되는가") 진단 프레임 11문항이 공통 컨텍스트에 포함
  for (const term of ["Customer(누가 돈을 내는가)", "Moat(경쟁사가 따라오면", "Exit(IPO/M&A"]) {
    assert(sectionPrompt.includes(term), `사업성 진단 프레임에 "${term}" 누락`);
  }
  console.log("✅ 사업성 진단 프레임(Customer→Exit 11문항)이 공통 컨텍스트에 포함됨");

  // 9. (Phase 2) 의견종합: Investment Thesis 3개 압축
  const opinionPrompt = buildSectionPrompt(SectionKey.OPINION_SUMMARY, {
    companyName: "테스트기업",
    sector: "IT",
    documentContext: "제공된 자료 없음",
  });
  for (const term of ["Thesis 1 — Market", "Thesis 2 — Company", "Thesis 3 — Economics"]) {
    assert(opinionPrompt.includes(term), `Investment Thesis에 "${term}" 누락`);
  }
  console.log("✅ 의견종합 섹션에 Investment Thesis 3개(Market/Company/Economics) 반영됨");

  // 10. (Phase 2) Bull/Base/Bear — 긍정 시나리오만 쓰지 않도록 Bear 실패 요인 명시
  assert(opinionPrompt.includes("Bull:"), "Bull Case 누락");
  assert(opinionPrompt.includes("Base:"), "Base Case 누락");
  assert(opinionPrompt.includes("Bear:"), "Bear Case 누락");
  assert(opinionPrompt.includes("핵심인력 이탈"), "Bear Case 실패 요인 목록 누락");
  console.log("✅ Bull/Base/Bear Case(Bear의 구체적 실패 요인 포함) 반영됨");

  // 11. (Phase 2) Why Not Invest — IR 그대로 긍정 요약하는 것을 막는 핵심 장치
  assert(opinionPrompt.includes("Why Not Invest"), "Why Not Invest 항목 누락");
  assert(
    opinionPrompt.includes("투자하지 않을 수 있는 가장 강한 이유"),
    "Why Not Invest의 목적(투자 안 할 이유) 설명 누락"
  );
  console.log("✅ Why Not Invest(투자하지 않을 강한 이유 3개) 반영됨");

  // 12. (Phase 3) 섹터별 핵심 KPI 체크리스트가 실제 6개 섹터 프롬프트에 반영됨
  const kpiExpectations: Array<[AgentType, DealSector, string]> = [
    [AgentType.BIO, DealSector.BIO, "Reimbursement"],
    [AgentType.IT, DealSector.IT, "NRR"],
    [AgentType.DEEPTECH, DealSector.DEEPTECH, "Technology Readiness"],
    [AgentType.MANUFACTURING, DealSector.MANUFACTURING, "Yield(수율)"],
    [AgentType.CONTENT, DealSector.CONTENT, "MAU/DAU"],
    [AgentType.FINTECH, DealSector.FINTECH, "Take Rate"],
  ];
  for (const [agentType, sector, kpi] of kpiExpectations) {
    const prompt = getSystemPrompt(agentType, sector);
    assert(prompt.includes("핵심 KPI 체크리스트"), `${sector} 프롬프트에 KPI 체크리스트 섹션 누락`);
    assert(prompt.includes(kpi), `${sector} 프롬프트의 KPI 체크리스트에 "${kpi}" 누락`);
  }
  console.log("✅ 6개 섹터 전문 프롬프트에 핵심 KPI 체크리스트 반영됨");

  // 13. (Phase 3) IC Questions 다듬기 프롬프트: "판단이 바뀌는 질문" 원칙 + 나쁜/좋은 예시
  const icRefinePromptSource = readFileSync(
    new URL("../src/lib/ic-questions-ai.ts", import.meta.url),
    "utf-8"
  );
  assert(
    icRefinePromptSource.includes("답변에 따라 실제 투자 여부가 바뀌는 질문"),
    "IC 질문 다듬기 프롬프트에 '판단이 바뀌는 질문' 원칙 누락"
  );
  assert(icRefinePromptSource.includes("향후 성장전략은 무엇인가"), "나쁜 질문 예시 누락");
  console.log("✅ IC 질문 다듬기 프롬프트에 '판단이 바뀌는 질문' 원칙(나쁜/좋은 예시) 반영됨");

  console.log("\n✅ Investment Quality Layer(Phase 1+2+3) 테스트 통과\n");
}

main();

/**
 * 여러 AI 모델(OpenRouter 현재 프로덕션 모델 + NVIDIA NIM 모델 목록)에
 * 똑같은 DealMind 섹션 프롬프트를 보내 결과를 나란히 비교한다.
 *
 * 목적: "어떤 섹션에 어떤 모델이 필요한가"를 실제 출력을 보고 판단하기
 * 위한 수동 벤치마킹 도구다. 자동 채점은 하지 않는다 — 보고서 품질은
 * 결국 심사역이 읽고 판단해야 하는 영역이라, 이 스크립트는 "같은 조건
 * 으로 나란히 놓고 비교"까지만 하고 최종 판단은 사람에게 맡긴다.
 *
 * 프로덕션 코드(report-generation.ts 등)는 전혀 건드리지 않는다 — 순수
 * 조회/비교용 스크립트다.
 *
 * 사용법:
 *   .env.local에 NVIDIA_NIM_API_KEY와(선택) NIM_MODELS="모델1,모델2"를
 *   채운 뒤 `npm run compare-models`만 실행하면 된다 — 이 스크립트는
 *   `--env-file-if-exists=.env.local`로 실행되게 npm script에 등록돼
 *   있어서, 터미널에 셸 문법으로 환경변수를 직접 넘길 필요가 없다
 *   (윈도우 cmd/PowerShell도 `VAR=value command` 문법을 못 쓰므로 이
 *   방식이 아니면 플랫폼마다 다르게 써야 한다).
 *
 *   NIM_MODELS를 비워두면 NIM 계정에서 사용 가능한 모델 목록만 조회해서
 *   보여주고 끝난다 — 정확한 모델 ID는 NIM 카탈로그가 계속 바뀌므로
 *   직접 골라서 .env.local에 채운 뒤 다시 실행해야 한다.
 *
 *   OPENROUTER_API_KEY가 설정돼 있으면 현재 프로덕션 모델(claude.ts의
 *   MODEL)도 베이스라인으로 같이 돌린다. 둘 다 없어도 실행은 되고,
 *   prompt.txt만 생성해서 NIM 플레이그라운드에 직접 붙여넣을 수 있다.
 *
 * 섹션·회사 정보를 바꾸려면 아래 SAMPLE_* 상수를 수정하면 된다.
 */
import fs from "fs";
import path from "path";
import { SectionKey, AgentType, DealSector } from "@prisma/client";
import { buildSectionPrompt, type SectionPromptContext } from "../src/prompts/section-prompts";
import { getSystemPrompt } from "../src/prompts/system-prompts";
import { generateText, isAIConfigured, MODEL as PRODUCTION_MODEL } from "../src/lib/claude";
import {
  callNimModel,
  isNimConfigured,
  listNimModels,
  getNimModelOptions,
} from "../src/lib/nim";

// 판단력이 가장 많이 필요한 섹션 위주로 기본값을 잡았다(재무추정/밸류/
// 리스크/의견종합) — "단순 포맷팅 섹션은 지금 모델로 충분, 판단이
// 필요한 섹션만 강한 모델로 바꿀 가치가 있는가"를 보려는 목적이라.
const SAMPLE_SECTION: SectionKey =
  (process.env.COMPARE_SECTION as SectionKey) ?? SectionKey.OPINION_SUMMARY;

const SAMPLE_CONTEXT: SectionPromptContext = {
  companyName: "㈜테라젠셀",
  sector: "BIO",
  investRound: "Series B",
  // 주의: investAmount/valuation은 원 단위가 아니라 "억원" 단위다 —
  // section-prompts.ts가 toLocaleString() 뒤에 "억원"을 그대로 붙이는
  // 방식이고, 실제 딜 등록 폼(create-deal-dialog.tsx)도 "투자금액(억원)"
  // 으로 이 단위를 받는다. raw 원 단위를 넣으면(예: 8_000_000_000)
  // "8,000,000,000억원"처럼 잘못 나온다 — 이 스크립트 처음 만들 때 실제로
  // 이 실수를 했다.
  investAmount: 80,
  valuation: 600,
  documentContext: `### IR_요약.pdf
테라젠셀은 고형암 대상 CAR-T 세포치료제(TG-101)를 개발하는 임상단계
바이오텍이다. TG-101은 현재 Phase 1b 임상 중이며(국내 3개 기관, 환자
18명 등록 완료), 중간 데이터에서 객관적 반응률(ORR) 44%를 확인했다.
2025년 12월 미국 FDA로부터 희귀의약품 지정(ODD)을 받았다.

- 누적 투자 유치: Series A 30억원(2023.03), 총 누적 투자금 45억원
- 이번 라운드: Series B 80억원 유치 목표, pre-money valuation 520억원
- 특허: 국내 등록 3건(CAR 구조체, 배양 공정), 미국 출원 2건 진행 중
- 경쟁 파이프라인: Legend Biotech LB-2101(Phase 2), 국내 A사 유사 기전
  Phase 1 진행 중 — 임상 진입 시점은 테라젠셀이 약 8개월 빠름
- 재무: 2025년 매출 없음(임상단계), 월 소진액(burn rate) 약 4억원,
  이번 라운드로 약 20개월 추가 런웨이 확보 예상
- 파이프라인 2개 추가 보유(전임상 단계, TG-102/TG-103)
- 팀: 대표이사 前 A제약 연구소장, CTO 서울대 의대 겸임교수`,
  additionalContext:
    "## 공유 팩트 (전 섹션에서 반드시 일치)\n" +
    "- 투자금액: 80억원 / Pre-money: 520억원\n" +
    "- 임상단계: Phase 1b (ORR 44%, 환자 18명)\n" +
    "- 이전 섹션 요약: 재무추정 섹션에서 rNPV 약 410억원 산출(PoS 15% 적용), " +
    "밸류에이션 섹션에서 비교기업 대비 30% 할인된 진입가로 평가함",
};

interface CompareResult {
  label: string;
  ok: boolean;
  content?: string;
  elapsedMs?: number;
  tokens?: string;
  error?: string;
}

function slugify(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 60);
}

async function main() {
  const outDir = path.join(
    process.cwd(),
    "tools",
    "output",
    `model-compare-${new Date().toISOString().replace(/[:.]/g, "-")}`
  );
  fs.mkdirSync(outDir, { recursive: true });

  const systemPrompt = getSystemPrompt(AgentType.BIO, DealSector.BIO);
  const userPrompt = buildSectionPrompt(SAMPLE_SECTION, SAMPLE_CONTEXT);

  fs.writeFileSync(
    path.join(outDir, "prompt.txt"),
    `=== SYSTEM PROMPT ===\n${systemPrompt}\n\n=== USER PROMPT ===\n${userPrompt}\n`
  );
  console.log(`\n프롬프트 저장: ${outDir}/prompt.txt`);
  console.log("→ NIM 플레이그라운드(build.nvidia.com)에 직접 테스트하려면 이 파일 내용을 복사해서");
  console.log("  System / User 프롬프트 칸에 각각 붙여넣으면 된다.\n");

  const results: CompareResult[] = [];

  // 1) 현재 프로덕션 모델(OpenRouter) — 베이스라인
  if (isAIConfigured()) {
    console.log(`[1] 현재 프로덕션 모델(${PRODUCTION_MODEL}) 호출 중...`);
    const startedAt = Date.now();
    try {
      const r = await generateText([{ role: "user", content: userPrompt }], {
        systemPrompt,
        maxTokens: 4096,
        temperature: 0.35,
      });
      results.push({
        label: `[프로덕션] ${r.usedModel}`,
        ok: true,
        content: r.content,
        elapsedMs: Date.now() - startedAt,
        tokens: `in=${r.inputTokens} out=${r.outputTokens}`,
      });
    } catch (error) {
      results.push({
        label: `[프로덕션] ${PRODUCTION_MODEL}`,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    console.log("[건너뜀] OPENROUTER_API_KEY 미설정 — 프로덕션 모델 베이스라인 생략");
  }

  // 2) NIM 모델들
  if (!isNimConfigured()) {
    console.log("[건너뜀] NVIDIA_NIM_API_KEY 미설정 — NIM 모델 비교 생략");
  } else {
    const requested = (process.env.NIM_MODELS ?? "")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);

    if (requested.length === 0) {
      console.log("\nNIM_MODELS가 비어 있음 — 계정에서 호출 가능한 모델 목록을 조회한다...");
      try {
        const models = await listNimModels();
        console.log(`\n사용 가능한 NIM 모델 ${models.length}개:`);
        models.forEach((m) => console.log(`  - ${m}`));
        console.log(
          "\n위 목록에서 비교하고 싶은 모델을 골라 NIM_MODELS=\"모델1,모델2\" 형태로 다시 실행하세요."
        );
      } catch (error) {
        console.error(
          "NIM 모델 목록 조회 실패:",
          error instanceof Error ? error.message : error
        );
      }
    } else {
      for (const model of requested) {
        console.log(`[NIM] ${model} 호출 중...`);
        try {
          // 모델별로 필요한 파라미터(추론 모델의 chat_template_kwargs 등)가
          // 있으면 자동으로 섞어 넣는다 — src/lib/nim.ts의
          // NIM_MODEL_CONFIGS 참고. 새 모델을 테스트하다 실패하면 그
          // 모델의 NIM 코드 예시를 보고 거기에 추가하면 된다.
          const r = await callNimModel(
            model,
            systemPrompt,
            userPrompt,
            getNimModelOptions(model)
          );
          results.push({
            label: `[NIM] ${model}`,
            ok: true,
            content: r.content,
            elapsedMs: r.elapsedMs,
            tokens: `in=${r.inputTokens} out=${r.outputTokens}`,
          });
        } catch (error) {
          results.push({
            label: `[NIM] ${model}`,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  if (results.length === 0) {
    console.log("\n비교할 모델이 없습니다 — prompt.txt만 생성됐습니다.");
    return;
  }

  // 결과 파일 + 요약 테이블
  const summaryLines = [
    `# 모델 비교 — ${SAMPLE_SECTION} 섹션 (${SAMPLE_CONTEXT.companyName})`,
    "",
    "| 모델 | 상태 | 소요시간 | 토큰 | 글자수 |",
    "|---|---|---|---|---|",
  ];

  for (const r of results) {
    if (!r.ok) {
      summaryLines.push(`| ${r.label} | ❌ 실패: ${r.error} | - | - | - |`);
      continue;
    }
    const file = `${slugify(r.label)}.md`;
    fs.writeFileSync(
      path.join(outDir, file),
      `# ${r.label}\n\n소요시간: ${r.elapsedMs}ms | 토큰: ${r.tokens}\n\n---\n\n${r.content}\n`
    );
    summaryLines.push(
      `| ${r.label} | ✅ | ${r.elapsedMs}ms | ${r.tokens} | ${r.content?.length ?? 0}자 |`
    );
  }

  fs.writeFileSync(path.join(outDir, "summary.md"), summaryLines.join("\n") + "\n");
  console.log(`\n${summaryLines.join("\n")}\n`);
  console.log(`전체 결과: ${outDir}/`);
}

main().catch((error) => {
  console.error("비교 실행 실패:", error);
  process.exit(1);
});

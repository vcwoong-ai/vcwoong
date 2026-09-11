/**
 * 보고서 생성 마법창(report-wizard.tsx) 자동 재개(auto-resume) 판단 로직 검증.
 *
 * 배경: report-generation.ts는 함수 실행시간 상한(GENERATION_BUDGET_MS) 소진
 * 시 완성된 섹션까지 저장하고 스스로 멈춘다(status="PENDING") — 이건 실패가
 * 아니라 "다음 섹션부터 이어서 만들어야 한다"는 정상 checkpoint인데,
 * /api/reports/[id]/status가 이를 status="error"로 내려주고(진짜 오류와
 * 구분하는 필드가 따로 없음), 마법창은 이를 그대로 "생성 중 오류가
 * 발생했습니다"로 표시하며 폴링을 멈췄다 — 그래서 항상 1/10에서 멈췄다
 * (실제 Production 로그로 확인: primary 모델 deepseek는 17초 만에 정상
 * 성공, fallback도 호출되지 않았음 — AI 문제가 아니었다).
 *
 * decideResumeAction()은 이 checkpoint를 진짜 오류와 구분해 자동으로
 * /api/reports/[id]/run을 다시 호출하도록 판단하는 순수 함수라, 컴포넌트
 * 렌더링 없이 네트워크 호출 없이 검증할 수 있다.
 *
 * Usage: npm run test:report-wizard-resume
 */
import { decideResumeAction, MAX_AUTO_RESUMES } from "../src/components/reports/report-wizard";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

interface Prog {
  completed: number;
  total: number;
  currentSection: string;
  status: "generating" | "completed" | "error";
}

function prog(completed: number, total: number, status: Prog["status"]): Prog {
  return { completed, total, currentSection: "", status };
}

/** 1. 정상 부분 생성(checkpoint) → 자동 재개 대상 */
function testCheckpointTriggersAutoResume() {
  const action = decideResumeAction(prog(1, 10, "error"), {
    autoResumeCount: 0,
    lastResumedCompleted: -1,
  });
  assert(action === "auto-resume", `1/10 checkpoint가 auto-resume으로 판단되지 않음: ${action}`);
  console.log("✅ 1/10 checkpoint(completed>0, completed<total) → 자동 재개 대상");
}

/** 2. 반복 checkpoint → 매번 진행됐으면 계속 자동 재개 */
function testRepeatedCheckpointKeepsResuming() {
  let state = { autoResumeCount: 0, lastResumedCompleted: -1 };
  const sequence: Array<[Prog, ReturnType<typeof decideResumeAction>]> = [];

  for (const completed of [1, 2, 3]) {
    const action = decideResumeAction(prog(completed, 10, "error"), state);
    sequence.push([prog(completed, 10, "error"), action]);
    assert(action === "auto-resume", `${completed}/10 checkpoint가 auto-resume이 아님: ${action}`);
    state = { autoResumeCount: state.autoResumeCount + 1, lastResumedCompleted: completed };
  }
  assert(state.autoResumeCount === 3, "재개 횟수가 누적되지 않음");
  console.log("✅ 1/10 → 2/10 → 3/10 반복 checkpoint 전부 자동 재개");
}

/** 3. 최종 완료(9/10 → 10/10) → 마지막엔 completed 상태로 자동 재개 중단 */
function testFinalCompletionStopsAutoResume() {
  const state = { autoResumeCount: 8, lastResumedCompleted: 9 };
  // 9/10에서 재개한 뒤 다음 섹션까지 끝나면 status가 "completed"로 내려온다
  // (report-generation.ts가 마지막 섹션까지 만들면 generatedAt을 채움).
  const action = decideResumeAction(prog(10, 10, "completed"), state);
  assert(action === "completed", `10/10 완료인데 completed로 판단되지 않음: ${action}`);
  console.log("✅ 9/10 → 10/10 완료 → 자동 재개 중단, 완료 상태로 판정");
}

/** 4. 실제 오류(completed=0) → 자동 재개하지 않고 기존 오류 처리 */
function testRealErrorWithNoProgressIsNotResumed() {
  const action = decideResumeAction(prog(0, 10, "error"), {
    autoResumeCount: 0,
    lastResumedCompleted: -1,
  });
  assert(action === "error", `completed=0 실제 오류가 error로 판단되지 않음: ${action}`);
  console.log("✅ completed=0(섹션 하나도 못 만듦) → 자동 재개하지 않고 실제 오류로 처리");
}

/** 5. progress 정체(재개 후에도 completed가 그대로) → 무한 루프 방지, 실제 오류로 처리 */
function testStagnantProgressStopsAutoResume() {
  // 1/10에서 한 번 재개를 요청했는데(lastResumedCompleted=1) 다음 폴링도
  // 여전히 1/10이면(진행 없음) 더 이상 재개하지 않는다.
  const action = decideResumeAction(prog(1, 10, "error"), {
    autoResumeCount: 1,
    lastResumedCompleted: 1,
  });
  assert(action === "error", `progress가 늘지 않았는데 계속 auto-resume함: ${action}`);
  console.log("✅ 재개 후에도 completed가 늘지 않음(정체) → 무한 루프 방지, 실제 오류로 처리");
}

/** 6. 자동 재개 횟수 상한 초과 → 더 이상 재개하지 않음(2차 방어선) */
function testMaxAutoResumesLimitStopsResuming() {
  const action = decideResumeAction(prog(5, 10, "error"), {
    autoResumeCount: MAX_AUTO_RESUMES,
    lastResumedCompleted: 4, // progress는 계속 늘고 있어도
  });
  assert(action === "error", `재개 횟수 상한(${MAX_AUTO_RESUMES})을 넘었는데 계속 재개함: ${action}`);
  console.log(`✅ 자동 재개 횟수 상한(${MAX_AUTO_RESUMES}) 초과 → progress가 늘고 있어도 재개 중단`);
}

/** 7. 정상 생성 중(status="generating") → 재개 호출 없이 계속 폴링 */
function testGeneratingStatusJustContinuesPolling() {
  const action = decideResumeAction(prog(3, 10, "generating"), {
    autoResumeCount: 0,
    lastResumedCompleted: -1,
  });
  assert(action === "continue-generating", `생성 중인데 재개를 시도함: ${action}`);
  console.log("✅ status=generating(정상 생성 중) → 재개 호출 없이 폴링만 계속");
}

async function main() {
  console.log("\n=== DealMind 보고서 마법창 자동 재개(auto-resume) 판단 로직 테스트 ===\n");
  testCheckpointTriggersAutoResume();
  testRepeatedCheckpointKeepsResuming();
  testFinalCompletionStopsAutoResume();
  testRealErrorWithNoProgressIsNotResumed();
  testStagnantProgressStopsAutoResume();
  testMaxAutoResumesLimitStopsResuming();
  testGeneratingStatusJustContinuesPolling();
  console.log("\n✅ 보고서 마법창 자동 재개 판단 로직 테스트 통과\n");
}

main().catch((err) => {
  console.error("❌ 테스트 실패:", err);
  process.exit(1);
});

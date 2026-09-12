/**
 * 보고서 생성 마법창(report-wizard.tsx) 자동 재개(auto-resume) 판단 로직 검증.
 *
 * 배경: report-generation.ts는 예산 소진이든 AI 호출이 끝내 실패했든(완성
 * 섹션이 0개여도) 항상 완성된 섹션까지 저장하고 스스로 멈춘다(Report.status=
 * PENDING) — 이건 실패가 아니라 "다음 섹션부터 이어서 만들어야 한다"는
 * 정상 checkpoint인데, /api/reports/[id]/status가 이를 status="error"로
 * 내려주고(reportStatus 필드로만 구분 가능), 예전 decideResumeAction은
 * completed>0을 요구해 "첫 섹션에서 AI가 타임아웃"(completed=0)나면 실제
 * checkpoint인데도 곧장 실제 오류로 처리했다 — 그 사이 서버(cron)는 계속
 * 정상적으로 재시도해 결국 완료로 이어지고 있었는데도 브라우저 화면만
 * "생성 중 오류"로 멈췄다(2026-09-12 실측: report=cmtycq7ne... — 0/10에서
 * 3번의 cron tick 동안 실패하다 4번째 tick에서 1~3/10까지 정상 진행).
 *
 * 지금은 completed 수가 아니라 reportStatus==="PENDING"(서버가 실제로
 * checkpoint로 저장했다는 명시적 신호)으로 재개 가능 여부를 판단한다 —
 * completed가 0이든 아니든 동일하게 취급한다. 무한 루프 방지는 진행 여부가
 * 아니라 재개 횟수 상한(MAX_AUTO_RESUMES)만으로 건다.
 *
 * decideResumeAction()은 이 판단을 하는 순수 함수라, 컴포넌트 렌더링 없이
 * 네트워크 호출 없이 검증할 수 있다.
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
  reportStatus?: string;
}

function prog(
  completed: number,
  total: number,
  status: Prog["status"],
  reportStatus?: string
): Prog {
  return { completed, total, currentSection: "", status, reportStatus };
}

/** 1. completed=0, total=10, 서버가 PENDING(checkpoint)으로 저장 → 자동 재개 대상 */
function testZeroProgressCheckpointResumes() {
  const action = decideResumeAction(prog(0, 10, "error", "PENDING"), {
    autoResumeCount: 0,
  });
  assert(action === "auto-resume", `0/10 PENDING checkpoint가 auto-resume으로 판단되지 않음: ${action}`);
  console.log("✅ completed=0(첫 섹션부터 실패)이어도 reportStatus=PENDING이면 자동 재개 대상");
}

/** 2. completed=3, total=10, PENDING → 자동 재개 대상 (기존 부분 진행 checkpoint) */
function testPartialProgressCheckpointResumes() {
  const action = decideResumeAction(prog(3, 10, "error", "PENDING"), {
    autoResumeCount: 0,
  });
  assert(action === "auto-resume", `3/10 PENDING checkpoint가 auto-resume으로 판단되지 않음: ${action}`);
  console.log("✅ completed=3/10 PENDING checkpoint → 자동 재개 대상");
}

/** 3. completed===total, status="completed" → 완료 판정, 재개 없음 */
function testFullCompletionIsCompleted() {
  const action = decideResumeAction(prog(10, 10, "completed"), {
    autoResumeCount: 8,
  });
  assert(action === "completed", `10/10 완료인데 completed로 판단되지 않음: ${action}`);
  console.log("✅ 10/10 완료(status=completed) → 재개 없이 완료 판정");
}

/**
 * 4. 실제 fatal error — reportStatus가 PENDING이 아님(서버가 재개 가능하다고
 * 표시하지 않은 상태). report-generation.ts의 모든 실패 경로가 PENDING으로
 * 되돌리므로 정상 흐름에서는 나타나지 않지만, 알 수 없는/예상 밖 상태를
 * "재개 가능"으로 낙관하지 않고 안전하게 실제 오류로 처리하는지 확인한다.
 */
function testNonPendingReportStatusIsFatalError() {
  const action = decideResumeAction(prog(0, 10, "error", undefined), {
    autoResumeCount: 0,
  });
  assert(
    action === "error",
    `reportStatus가 PENDING이 아닌데 auto-resume으로 판단됨: ${action}`
  );
  console.log("✅ reportStatus가 PENDING이 아님(불명확한 상태) → 낙관적으로 재개하지 않고 실제 오류로 처리");
}

/**
 * 5. completed=0 첫 섹션 timeout이 "여러 번" 반복돼도(진행이 전혀 없어도)
 * cron이 뒤에서 재시도할 시간을 주기 위해 재개 횟수 상한(MAX_AUTO_RESUMES)
 * 안에서는 계속 auto-resume — 실제 오류로 잘못 종료되지 않는다.
 */
function testRepeatedZeroProgressKeepsResumingWithinCap() {
  let autoResumeCount = 0;
  for (let i = 0; i < 5; i++) {
    const action = decideResumeAction(prog(0, 10, "error", "PENDING"), {
      autoResumeCount,
    });
    assert(
      action === "auto-resume",
      `${i + 1}번째 재시도에서 진행이 없다고 조기에 error로 종료됨: ${action}`
    );
    autoResumeCount += 1;
  }
  console.log("✅ completed=0이 여러 번 반복돼도(진행 없음) 상한 안에서는 계속 auto-resume — 조기 종료 없음");
}

/** 6. 자동 재개 횟수 상한 초과 → 더 이상 재개하지 않음(무한 루프 방지) */
function testMaxAutoResumesLimitStopsResuming() {
  const action = decideResumeAction(prog(5, 10, "error", "PENDING"), {
    autoResumeCount: MAX_AUTO_RESUMES,
  });
  assert(action === "error", `재개 횟수 상한(${MAX_AUTO_RESUMES})을 넘었는데 계속 재개함: ${action}`);
  console.log(`✅ 자동 재개 횟수 상한(${MAX_AUTO_RESUMES}) 초과 → 재개 중단(무한 루프 방지)`);
}

/** 7. 상한 바로 아래(cap - 1) → 여전히 재개 대상 (off-by-one 없음) */
function testJustBelowCapStillResumable() {
  const action = decideResumeAction(prog(5, 10, "error", "PENDING"), {
    autoResumeCount: MAX_AUTO_RESUMES - 1,
  });
  assert(action === "auto-resume", "상한 바로 아래인데 재개하지 않음(off-by-one)");
  console.log("✅ 재개 횟수 상한 경계값(cap - 1) → 여전히 재개 대상");
}

/** 8. 정상 생성 중(status="generating") → 재개 호출 없이 계속 폴링 */
function testGeneratingStatusJustContinuesPolling() {
  const action = decideResumeAction(prog(3, 10, "generating"), {
    autoResumeCount: 0,
  });
  assert(action === "continue-generating", `생성 중인데 재개를 시도함: ${action}`);
  console.log("✅ status=generating(정상 생성 중) → 재개 호출 없이 폴링만 계속");
}

/** 9. total===0(방어적 케이스, 섹션 메타를 못 읽은 등) → 재개 대상 아님 */
function testZeroTotalIsNotResumable() {
  const action = decideResumeAction(prog(0, 0, "error", "PENDING"), {
    autoResumeCount: 0,
  });
  assert(action === "error", `total=0인데 재개를 시도함: ${action}`);
  console.log("✅ total=0(방어적 케이스) → 재개 대상 아님, 실제 오류로 처리");
}

async function main() {
  console.log("\n=== DealMind 보고서 마법창 자동 재개(auto-resume) 판단 로직 테스트 ===\n");
  testZeroProgressCheckpointResumes();
  testPartialProgressCheckpointResumes();
  testFullCompletionIsCompleted();
  testNonPendingReportStatusIsFatalError();
  testRepeatedZeroProgressKeepsResumingWithinCap();
  testMaxAutoResumesLimitStopsResuming();
  testJustBelowCapStillResumable();
  testGeneratingStatusJustContinuesPolling();
  testZeroTotalIsNotResumable();
  console.log("\n✅ 보고서 마법창 자동 재개 판단 로직 테스트 통과\n");
}

main().catch((err) => {
  console.error("❌ 테스트 실패:", err);
  process.exit(1);
});

/**
 * cron 기반 서버 측 자동 재개(브라우저 비의존) 후보 선정 로직 검증.
 *
 * 실제 DB/네트워크 호출 없이, "이 보고서를 지금 재개 대상으로 볼 것인가"
 * 판단만 순수 함수로 떼어낸 selectResumableCandidates를 검증한다.
 * (claimPendingGeneration은 prisma.report.updateMany를 직접 쓰는 얇은
 * 래퍼라 이 테스트 대상이 아니다 — /run 라우트와 cron 라우트가 동일 함수를
 * 호출하므로 그 자체로 동작이 일치함은 코드 리딩으로 보장된다.)
 *
 * Usage: npm run test:cron-resume
 */
import {
  selectResumableCandidates,
  MAX_AUTO_RESUME_ATTEMPTS,
  type ResumeCandidate,
} from "../src/lib/report-generation";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const TOTAL = 10;

function candidate(overrides: Partial<ResumeCandidate>): ResumeCandidate {
  return { id: "r1", completedSections: 3, autoResumeCount: 0, ...overrides };
}

function testPartialCheckpointIsResumable() {
  const result = selectResumableCandidates(
    [candidate({ completedSections: 4 })],
    { totalSections: TOTAL, maxAutoResumeAttempts: MAX_AUTO_RESUME_ATTEMPTS }
  );
  assert(result.length === 1, "4/10 완료된 checkpoint는 재개 대상이어야 함");
  console.log("✅ 부분 완료(checkpoint) 보고서는 재개 대상으로 선정됨");
}

function testZeroProgressStillResumable() {
  // 첫 섹션도 못 만들고 죽은 GENERATING(cron 후보 쿼리가 stale GENERATING도
  // 포함시킨다) — 진짜 실패일 수도 있지만, autoResumeCount 상한이 무한
  // 재시도를 막아주므로 여기서 미리 배제하지 않는다(사용자가 겪던 "첫
  // 섹션에서 죽으면 다시 시도 버튼 없이는 영영 안 됨" 문제를 이 경로도
  // 구제하기 위함).
  const result = selectResumableCandidates(
    [candidate({ completedSections: 0 })],
    { totalSections: TOTAL, maxAutoResumeAttempts: MAX_AUTO_RESUME_ATTEMPTS }
  );
  assert(result.length === 1, "0/10(첫 섹션부터 실패)도 재개 대상이어야 함");
  console.log("✅ 진행 0인 stale 보고서도 (상한 안에서는) 재개 대상으로 선정됨");
}

function testAlreadyCompleteIsExcluded() {
  // 정상 흐름에서는 완료 시 status가 DRAFT로 바뀌어 애초에 cron 쿼리에
  // 안 잡히지만, 방어적으로 completedSections >= total이면 제외한다.
  const result = selectResumableCandidates(
    [candidate({ completedSections: TOTAL })],
    { totalSections: TOTAL, maxAutoResumeAttempts: MAX_AUTO_RESUME_ATTEMPTS }
  );
  assert(result.length === 0, "이미 전부 완료된 보고서는 재개 대상이 아니어야 함");
  console.log("✅ 완료된(10/10) 보고서는 방어적으로 제외됨");
}

function testAttemptCapExcludesRunawayRetries() {
  const result = selectResumableCandidates(
    [candidate({ completedSections: 2, autoResumeCount: MAX_AUTO_RESUME_ATTEMPTS })],
    { totalSections: TOTAL, maxAutoResumeAttempts: MAX_AUTO_RESUME_ATTEMPTS }
  );
  assert(
    result.length === 0,
    "자동 재개 시도 상한에 도달한 보고서는 더 이상 자동 재시도하지 않아야 함"
  );
  console.log(
    `✅ autoResumeCount(${MAX_AUTO_RESUME_ATTEMPTS})가 상한에 도달하면 재개 대상에서 제외됨 — 무한 재시도 방지`
  );
}

function testJustBelowCapStillResumable() {
  const result = selectResumableCandidates(
    [
      candidate({
        completedSections: 5,
        autoResumeCount: MAX_AUTO_RESUME_ATTEMPTS - 1,
      }),
    ],
    { totalSections: TOTAL, maxAutoResumeAttempts: MAX_AUTO_RESUME_ATTEMPTS }
  );
  assert(result.length === 1, "상한 바로 아래는 여전히 재개 대상이어야 함");
  console.log("✅ 상한 경계값(cap - 1)은 여전히 재개 대상으로 선정됨(off-by-one 없음)");
}

function testMixedBatchFiltersIndependently() {
  const candidates: ResumeCandidate[] = [
    candidate({ id: "resumable-1", completedSections: 3, autoResumeCount: 0 }),
    candidate({ id: "capped", completedSections: 3, autoResumeCount: MAX_AUTO_RESUME_ATTEMPTS }),
    candidate({ id: "complete", completedSections: TOTAL, autoResumeCount: 1 }),
    candidate({ id: "resumable-2", completedSections: 9, autoResumeCount: 5 }),
  ];
  const result = selectResumableCandidates(candidates, {
    totalSections: TOTAL,
    maxAutoResumeAttempts: MAX_AUTO_RESUME_ATTEMPTS,
  });
  const ids = result.map((r) => r.id).sort();
  assert(
    ids.length === 2 && ids[0] === "resumable-1" && ids[1] === "resumable-2",
    `여러 후보 중 재개 대상만 정확히 골라내야 함 — 실제: ${JSON.stringify(ids)}`
  );
  console.log("✅ 여러 보고서가 섞여 있어도 각각 독립적으로 올바르게 필터링됨");
}

function main() {
  console.log("\n=== DealMind cron 기반 자동 재개 후보 선정 테스트 ===\n");
  testPartialCheckpointIsResumable();
  testZeroProgressStillResumable();
  testAlreadyCompleteIsExcluded();
  testAttemptCapExcludesRunawayRetries();
  testJustBelowCapStillResumable();
  testMixedBatchFiltersIndependently();
  console.log("\n✅ cron 기반 자동 재개 후보 선정 테스트 통과\n");
}

main();

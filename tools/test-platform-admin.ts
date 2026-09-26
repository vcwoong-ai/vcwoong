/**
 * 플랫폼 운영자 이메일 게이트(src/lib/platform-admin.ts) 테스트.
 *
 * 전체 고객사 비용을 보는 /admin/usage-cost 같은 운영자 전용 기능이
 * "설정을 깜빡했을 때" 조용히 아무나 통과시키는 사고를 막는 게 이 게이트의
 * 유일한 목적이다 — 그래서 fail-safe(미설정=전부 거부) 쪽을 집중적으로
 * 검증한다.
 *
 * Usage: npm run test:platform-admin
 */
import { isPlatformAdminEmail, resolvePlatformAdminEmails } from "../src/lib/platform-admin";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testEnvUnsetDeniesEveryone() {
  assert(
    resolvePlatformAdminEmails(undefined).length === 0,
    "PLATFORM_ADMIN_EMAILS 미설정인데 빈 목록이 아님"
  );
  assert(
    !isPlatformAdminEmail("founder@dealmind.kr", undefined),
    "PLATFORM_ADMIN_EMAILS 미설정인데도 통과됨 — fail-safe deny 위반"
  );
  console.log("✅ A. PLATFORM_ADMIN_EMAILS 미설정 → 아무 이메일도 통과 못 함(fail-safe deny)");
}

function testEmptyStringDeniesEveryone() {
  assert(!isPlatformAdminEmail("someone@example.com", ""), "빈 문자열 env인데 통과됨");
  assert(!isPlatformAdminEmail("someone@example.com", "   "), "공백만 있는 env인데 통과됨");
  console.log("✅ B. 빈 문자열/공백 env도 미설정과 동일하게 전부 거부");
}

function testExactMatchPasses() {
  const env = "founder@dealmind.kr,ops@dealmind.kr";
  assert(isPlatformAdminEmail("founder@dealmind.kr", env), "등록된 이메일이 통과 못 함");
  assert(isPlatformAdminEmail("ops@dealmind.kr", env), "등록된 두 번째 이메일이 통과 못 함");
  assert(!isPlatformAdminEmail("someone-else@dealmind.kr", env), "등록 안 된 이메일이 통과됨");
  console.log("✅ C. 콤마로 구분된 등록 이메일만 정확히 통과");
}

function testCaseInsensitiveAndTrimmed() {
  const env = " Founder@DealMind.kr , ops@dealmind.kr ";
  assert(isPlatformAdminEmail("founder@dealmind.kr", env), "대소문자 다르면 거부됨(대소문자 무시해야 함)");
  assert(isPlatformAdminEmail("FOUNDER@DEALMIND.KR", env), "입력 쪽 대소문자도 무시돼야 함");
  assert(isPlatformAdminEmail("ops@dealmind.kr", env), "env 쪽 앞뒤 공백이 안 잘림");
  console.log("✅ D. 이메일 비교는 대소문자 무시 + 앞뒤 공백 trim");
}

function testNullishOrEmptyInputEmailDenied() {
  const env = "founder@dealmind.kr";
  assert(!isPlatformAdminEmail(null, env), "null 이메일이 통과됨");
  assert(!isPlatformAdminEmail(undefined, env), "undefined 이메일이 통과됨");
  assert(!isPlatformAdminEmail("", env), "빈 문자열 이메일이 통과됨");
  assert(!isPlatformAdminEmail("   ", env), "공백만 있는 이메일이 통과됨");
  console.log("✅ E. null/undefined/빈 문자열 이메일은 항상 거부(세션 누락 시 안전)");
}

function testMalformedEntriesAreDroppedNotCrashed() {
  const env = "founder@dealmind.kr,,   ,ops@dealmind.kr,";
  const emails = resolvePlatformAdminEmails(env);
  assert(emails.length === 2, `빈 항목이 걸러지지 않음: ${JSON.stringify(emails)}`);
  assert(isPlatformAdminEmail("ops@dealmind.kr", env), "빈 항목 섞여도 정상 항목은 통과해야 함");
  console.log("✅ F. 콤마 목록에 빈 항목(연속 콤마, 트레일링 콤마)이 섞여도 예외 없이 걸러짐");
}

async function main() {
  console.log("\n=== DealMind 플랫폼 운영자 이메일 게이트 테스트 ===\n");
  testEnvUnsetDeniesEveryone();
  testEmptyStringDeniesEveryone();
  testExactMatchPasses();
  testCaseInsensitiveAndTrimmed();
  testNullishOrEmptyInputEmailDenied();
  testMalformedEntriesAreDroppedNotCrashed();
  console.log("\n✅ 플랫폼 운영자 이메일 게이트 테스트 통과\n");
}

main().catch((err) => {
  console.error("❌ 테스트 실패:", err);
  process.exit(1);
});

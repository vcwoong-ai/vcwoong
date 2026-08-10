/**
 * 보안 관련 순수 로직 검증 (DB 불필요)
 *
 * - Toss 웹훅 시크릿 검증: 인증 없이 열린 엔드포인트라, 검증이 느슨하면
 *   아무나 남의 구독을 해지시킬 수 있다.
 * - clientIp 파싱: 레이트리밋이 IP 기준이라, 파싱이 틀리면 제한이
 *   무의미해지거나(모두 "unknown") 엉뚱한 사용자가 막힌다.
 *
 * Usage: npm run test:security
 */
import { verifyTossWebhookSecret } from "../src/lib/payments/toss";
import { clientIp } from "../src/lib/rate-limit";
import { brandCustomerKey, parseCustomerKeyUserId } from "../src/lib/brand";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

/** Headers 유사 객체 (테스트에서 fetch Headers 대신 사용) */
function headers(map: Record<string, string>) {
  return {
    get: (name: string) => map[name.toLowerCase()] ?? null,
  };
}

function testWebhookSecret() {
  // 시크릿 미설정 → 무조건 거부 (fail-closed)
  assert(
    !verifyTossWebhookSecret(headers({}), undefined),
    "시크릿 미설정인데 통과됨"
  );
  assert(
    !verifyTossWebhookSecret(headers({ "x-webhook-secret": "무엇이든" }), ""),
    "빈 시크릿인데 통과됨"
  );
  assert(
    !verifyTossWebhookSecret(headers({ "x-webhook-secret": "abc" }), "   "),
    "공백 시크릿인데 통과됨"
  );

  // 시크릿 설정됨 → 정확히 일치할 때만 통과
  assert(
    verifyTossWebhookSecret(headers({ "x-webhook-secret": "s3cret" }), "s3cret"),
    "일치하는 시크릿이 거부됨"
  );
  assert(
    verifyTossWebhookSecret(
      headers({ "x-toss-webhook-secret": "s3cret" }),
      "s3cret"
    ),
    "toss 전용 헤더가 거부됨"
  );
  assert(
    !verifyTossWebhookSecret(headers({ "x-webhook-secret": "wrong" }), "s3cret"),
    "틀린 시크릿이 통과됨"
  );
  assert(
    !verifyTossWebhookSecret(headers({}), "s3cret"),
    "헤더 없는 요청이 통과됨"
  );

  console.log("✅ Toss 웹훅 시크릿 검증 (미설정 시 fail-closed)");
}

function testClientIp() {
  assert(
    clientIp(new Request("https://x.test", { headers: { "x-forwarded-for": "1.2.3.4" } })) ===
      "1.2.3.4",
    "단일 x-forwarded-for 파싱 실패"
  );
  // 프록시 체인에서는 맨 앞이 원 클라이언트
  assert(
    clientIp(
      new Request("https://x.test", {
        headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1, 10.0.0.2" },
      })
    ) === "1.2.3.4",
    "프록시 체인에서 원 클라이언트 추출 실패"
  );
  assert(
    clientIp(new Request("https://x.test", { headers: { "x-real-ip": "5.6.7.8" } })) ===
      "5.6.7.8",
    "x-real-ip 폴백 실패"
  );
  assert(
    clientIp(new Request("https://x.test")) === "unknown",
    "IP 헤더 없을 때 기본값 실패"
  );

  console.log("✅ clientIp 파싱 (프록시 체인·폴백 포함)");
}

function testCustomerKey() {
  // 웹훅에서 customerKey → userId 로 되돌리는 경로. 추측이 쉬운 형태라
  // 웹훅 검증이 반드시 선행돼야 한다는 걸 문서화하는 의미도 있다.
  const key = brandCustomerKey("user_abc123");
  assert(parseCustomerKeyUserId(key) === "user_abc123", "customerKey 왕복 실패");
  assert(
    parseCustomerKeyUserId("남의-접두사-user_abc123") === null,
    "다른 접두사 키가 파싱됨"
  );

  console.log("✅ customerKey 왕복 + 잘못된 접두사 거부");
}

function main() {
  console.log("\n=== Axiom 보안 로직 테스트 ===\n");
  testWebhookSecret();
  testClientIp();
  testCustomerKey();
  console.log("\n✅ 보안 로직 테스트 통과\n");
}

main();

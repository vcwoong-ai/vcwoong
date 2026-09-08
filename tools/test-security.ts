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
import { isAllowedBlobUrl } from "../src/lib/storage";

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

  // 리브랜딩(Axiom → DealMind) 이전에 Toss에 등록된 빌링키는 옛 접두사를
  // 그대로 달고 웹훅으로 들어온다. 이걸 못 읽으면 옛 구독자의 해지가
  // 조용히 무시되므로 반드시 계속 인식돼야 한다.
  assert(
    parseCustomerKeyUserId("axiom-user_abc123") === "user_abc123",
    "리브랜딩 이전 접두사(axiom-)가 파싱되지 않음"
  );

  console.log("✅ customerKey 왕복 + 옛 접두사 호환 + 잘못된 접두사 거부");
}

/**
 * 클라이언트가 보낸 Blob URL 검증.
 *
 * 큰 파일은 브라우저가 Blob으로 직접 올리고 그 URL만 서버로 보내는데,
 * 서버는 이 URL을 그대로 fetch해서 본문을 파싱·저장한다. 검증이 없으면
 * 로그인한 사용자가 서버에게 아무 주소나 대신 요청시킬 수 있고(SSRF),
 * 응답 본문이 parsedText로 저장돼 그대로 열람까지 된다.
 */
function testBlobUrlValidation() {
  const ok =
    "https://abc123.public.blob.vercel-storage.com/deals/deal_1/uuid.pdf";
  assert(isAllowedBlobUrl(ok, "deals/deal_1/"), "정상 Blob URL이 거부됨");
  assert(
    isAllowedBlobUrl(
      "https://x.public.blob.vercel-storage.com/templates/uuid.docx",
      "templates/"
    ),
    "정상 템플릿 Blob URL이 거부됨"
  );

  // 외부 주소 — SSRF의 핵심 차단 대상
  assert(
    !isAllowedBlobUrl("http://169.254.169.254/latest/meta-data/", "deals/d1/"),
    "클라우드 메타데이터 주소가 통과됨"
  );
  assert(
    !isAllowedBlobUrl("http://localhost:3000/api/internal", "deals/d1/"),
    "내부 주소가 통과됨"
  );
  assert(
    !isAllowedBlobUrl("https://evil.example.com/deals/d1/x.pdf", "deals/d1/"),
    "임의 호스트가 경로만 맞으면 통과됨"
  );
  // 호스트 접미사를 흉내낸 도메인
  assert(
    !isAllowedBlobUrl(
      "https://blob.vercel-storage.com.evil.example.com/deals/d1/x.pdf",
      "deals/d1/"
    ),
    "접미사를 흉내낸 호스트가 통과됨"
  );
  // https가 아닌 스킴
  assert(
    !isAllowedBlobUrl("file:///etc/passwd", "deals/d1/"),
    "file 스킴이 통과됨"
  );

  // 남의 딜 경로 — 권한 검사를 통과한 딜의 자리만 허용해야 한다
  assert(
    !isAllowedBlobUrl(
      "https://x.public.blob.vercel-storage.com/deals/other_deal/x.pdf",
      "deals/deal_1/"
    ),
    "다른 딜의 경로가 통과됨"
  );
  // 인코딩된 상위 경로 우회
  assert(
    !isAllowedBlobUrl(
      "https://x.public.blob.vercel-storage.com/deals/deal_1/%2e%2e/other/x.pdf",
      "deals/deal_1/"
    ),
    "인코딩된 상위 경로(..)가 통과됨"
  );
  assert(!isAllowedBlobUrl("not a url", "deals/d1/"), "URL이 아닌 값이 통과됨");

  console.log("✅ 업로드 Blob URL 검증 (SSRF·타 딜 경로·스킴 우회 차단)");
}

function main() {
  console.log("\n=== DealMind 보안 로직 테스트 ===\n");
  testWebhookSecret();
  testClientIp();
  testCustomerKey();
  testBlobUrlValidation();
  console.log("\n✅ 보안 로직 테스트 통과\n");
}

main();

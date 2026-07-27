/**
 * 딜소싱 이메일 인입 파서 테스트 (API 키 불필요)
 * Usage: npm run test:email
 */
import { parseEmailIntake, parseEmailLead } from "../src/lib/email-intake";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function main() {
  console.log("\n=== Axiom 이메일 인입 파서 테스트 ===\n");

  // 1) 표준 한국어 IR 메일
  const basic = parseEmailLead(`From: 홍길동 <hong@greenloop.kr>
To: 심사역 <analyst@axiom.kr>
Subject: [그린루프] 시리즈A IR 자료 송부
Date: 2026-07-20

안녕하세요, 그린루프 대표 홍길동입니다.
저희는 산업 폐열을 회수해 재생에너지로 전환하는 설비를 만듭니다.
탄소배출권 매출이 지난해 대비 3배 성장했습니다.

--
홍길동 | 대표이사
`);
  assert(basic.companyName === "그린루프", `기업명 기대 "그린루프", got "${basic.companyName}"`);
  assert(basic.companyNameConfident, "제목에서 기업명 추출 시 확신 플래그 필요");
  assert(basic.contactEmail === "hong@greenloop.kr", `연락처 기대, got ${basic.contactEmail}`);
  assert(basic.contactName === "홍길동", `담당자 기대 "홍길동", got "${basic.contactName}"`);
  assert(basic.sector === "CLIMATE", `섹터 기대 CLIMATE, got ${basic.sector}`);
  assert(!/^From:/m.test(basic.summary), "요약에서 헤더가 제거되어야 함");
  assert(!basic.summary.includes("대표이사"), "서명 이후는 잘려야 함");

  // 2) 말머리가 회사명이 아닌 경우 → 도메인에서 추출
  const bracketIr = parseEmailLead(`보낸사람: 김철수 <ceo@nexlab.io>
제목: [IR] 투자 제안드립니다

저희는 SaaS 구독 매출 ARR 40억을 달성했습니다.`);
  assert(
    bracketIr.companyName === "Nexlab",
    `도메인 기반 기업명 기대 "Nexlab", got "${bracketIr.companyName}"`
  );
  assert(!bracketIr.companyNameConfident, "도메인 추정은 확신 플래그가 false여야 함");
  assert(bracketIr.sector === "IT", `섹터 기대 IT, got ${bracketIr.sector}`);

  // 3) 일반 메일 도메인은 회사명으로 쓰지 않는다
  const generic = parseEmailLead(`From: 이영희 <younghee@gmail.com>
Subject: 문의드립니다

바이오 신약 임상 2상 진행 중입니다.`);
  assert(
    generic.companyName === "확인 필요",
    `일반 도메인은 기업명 미상이어야 함, got "${generic.companyName}"`
  );
  assert(generic.sector === "BIO", `섹터 기대 BIO, got ${generic.sector}`);

  // 4) 유입 경로 추론
  const demoDay = parseEmailLead(`From: pr@startup.kr
Subject: 데모데이 발표사 소개

지난 데모데이에서 발표한 기업입니다.`);
  assert(demoDay.source === "DEMO_DAY", `유입경로 기대 DEMO_DAY, got ${demoDay.source}`);

  // 5) 전달 메일 여러 통 분리
  const multi = parseEmailIntake(`---------- Forwarded message ---------
From: a@alpha.kr
Subject: [알파랩스] 프리A 검토 요청

로봇 자동화 양산 라인을 공급합니다.

---------- Forwarded message ---------
From: b@betapay.kr
Subject: [베타페이] 시드 IR

간편결제 TPV가 월 300억입니다.`);
  assert(multi.length === 2, `메일 2통 기대, got ${multi.length}`);
  assert(multi[0].companyName === "알파랩스", `첫 메일 기업명, got ${multi[0].companyName}`);
  assert(multi[1].companyName === "베타페이", `둘째 메일 기업명, got ${multi[1].companyName}`);
  assert(multi[1].sector === "FINTECH", `둘째 섹터 기대 FINTECH, got ${multi[1].sector}`);

  // 6) 헤더 없는 순수 본문도 처리
  const plain = parseEmailLead(
    "저희 회사는 웹툰 IP를 기반으로 콘텐츠를 제작합니다. 연락처는 contact@toonhouse.co.kr 입니다."
  );
  assert(plain.contactEmail === "contact@toonhouse.co.kr", "본문 내 이메일 추출 필요");
  assert(plain.sector === "CONTENT", `섹터 기대 CONTENT, got ${plain.sector}`);

  // 7) 인용 답장 구간 제거
  const quoted = parseEmailLead(`From: c@gamma.kr
Subject: [감마] Re: 회신드립니다

추가 자료 첨부합니다.

> 이전 메일 내용입니다
> 두 번째 인용 줄`);
  assert(!quoted.summary.includes("이전 메일"), "인용 구간은 요약에서 제외되어야 함");

  console.log("✅ 표준 IR 메일:", basic.companyName, basic.sector, basic.source);
  console.log("✅ 도메인 추정:", bracketIr.companyName);
  console.log("✅ 일반 도메인 제외:", generic.companyName);
  console.log("✅ 유입경로 추론:", demoDay.source);
  console.log("✅ 전달 메일 분리:", multi.map((m) => m.companyName).join(", "));
  console.log("\n✅ 모든 이메일 인입 테스트 통과\n");
}

main();

import { parseInboundEmail } from "../src/lib/email-parser";

const sample = `From: 김대표 <founder@greenloop.kr>
To: investment@dealmind.kr
Subject: [그린루프] Series A IR 자료 송부

안녕하세요,
기후테크 스타트업 그린루프입니다.
2024년 탄소배출권 거래 GMV 120억, EBITDA 흑자 전환했습니다.
미팅 요청드립니다.

감사합니다.
김대표`;

const parsed = parseInboundEmail(sample);

if (!parsed.contactEmail?.includes("greenloop")) {
  throw new Error("contactEmail parse failed");
}
if (!parsed.contactName?.includes("김")) {
  throw new Error("contactName parse failed");
}
if (!parsed.companyName?.includes("그린루프")) {
  throw new Error(`companyName parse failed: ${parsed.companyName}`);
}
if (!parsed.summary || parsed.summary.length < 20) {
  throw new Error("summary too short");
}

console.log("✓ email-parser tests passed");
console.log("  company:", parsed.companyName);
console.log("  email:", parsed.contactEmail);

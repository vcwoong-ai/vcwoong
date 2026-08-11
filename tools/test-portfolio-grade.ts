/**
 * 관리등급(A~F) 산출 로직 검증.
 * 상태 태그(WATCH/RISK 등)가 MOIC 숫자보다 우선해야 한다는 게 핵심 규칙.
 *
 * Usage: npm run test:portfolio-grade
 */
import { PortfolioStatus } from "@prisma/client";
import { companyGrade } from "../src/lib/portfolio";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testWrittenOffIsAlwaysF() {
  assert(companyGrade(PortfolioStatus.WRITTEN_OFF, 5) === "F", "WRITTEN_OFF인데 MOIC 5여도 F가 아님");
  console.log("✅ WRITTEN_OFF는 MOIC과 무관하게 항상 F");
}

function testStatusOverridesGoodMoic() {
  // MOIC 3배(원래는 A급)라도 RISK로 태그돼 있으면 D여야 한다
  assert(
    companyGrade(PortfolioStatus.RISK, 3) === "D",
    "MOIC이 좋아도 RISK 태그가 등급에 반영되지 않음"
  );
  assert(
    companyGrade(PortfolioStatus.WATCH, 5) === "C",
    "MOIC이 좋아도 WATCH 태그가 등급에 반영되지 않음"
  );
  console.log("✅ 상태 태그(RISK/WATCH)가 MOIC 숫자보다 우선");
}

function testMoicThresholds() {
  assert(companyGrade(PortfolioStatus.ACTIVE, 3) === "A", "MOIC 3.0인데 A가 아님");
  assert(companyGrade(PortfolioStatus.ACTIVE, 2.9) === "B", "MOIC 2.9인데 B가 아님");
  assert(companyGrade(PortfolioStatus.ACTIVE, 1.5) === "B", "MOIC 1.5인데 B가 아님");
  assert(companyGrade(PortfolioStatus.ACTIVE, 1.4) === "C", "MOIC 1.4인데 C가 아님");
  assert(companyGrade(PortfolioStatus.ACTIVE, 1.0) === "C", "MOIC 1.0(손익분기)인데 C가 아님");
  assert(companyGrade(PortfolioStatus.ACTIVE, 0.9) === "D", "MOIC 0.9(원금 손실)인데 D가 아님");
  assert(companyGrade(PortfolioStatus.ACTIVE, 0) === "D", "MOIC 0인데 D가 아님");
  console.log("✅ ACTIVE 상태의 MOIC 구간별 등급 경계값 (A≥3, B≥1.5, C≥1, D<1)");
}

function testExitedUsesMoicToo() {
  assert(companyGrade(PortfolioStatus.EXITED, 4) === "A", "EXITED인데 좋은 MOIC이 A로 안 잡힘");
  assert(companyGrade(PortfolioStatus.EXITED, 0.5) === "D", "EXITED인데 손실 MOIC이 D로 안 잡힘");
  console.log("✅ EXITED 상태도 회수 성과(MOIC)로 등급 산출");
}

function main() {
  console.log("\n=== DealMind 포트폴리오 관리등급 테스트 ===\n");
  testWrittenOffIsAlwaysF();
  testStatusOverridesGoodMoic();
  testMoicThresholds();
  testExitedUsesMoicToo();
  console.log("\n✅ 포트폴리오 관리등급 테스트 통과\n");
}

main();

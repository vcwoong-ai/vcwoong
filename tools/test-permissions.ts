/**
 * 팀 권한 + 연간 요금 + 구조 QA 단위 테스트
 */
import { SectionKey } from "@prisma/client";
import {
  canEditShared,
  canEditResource,
  dealWriteWhere,
  dealReadWhere,
  dealOwnerWhere,
  reportWriteWhere,
  fundReadWhere,
  fundWriteWhere,
  inboundWriteWhere,
  inboundReadWhere,
  inboundOwnerWhere,
  portfolioReadWhere,
  portfolioWriteWhere,
  portfolioOwnerWhere,
  lpReportReadWhere,
} from "../src/lib/team-access";
import { markdownToPptxSections } from "../src/lib/pptx-export";
import {
  yearlyPriceFromMonthly,
  monthlyEquivalent,
  PUBLIC_PLANS,
} from "../src/lib/plans";
import { planAmount } from "../src/lib/payments/toss";
import { reconstructDOCX } from "../src/lib/template/template-reconstructor";
import { compareTemplateStructure } from "../src/lib/template/structure-qa";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Header,
} from "docx";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("\n=== Axiom 권한·요금·QA 테스트 ===\n");

  // 권한
  assert(canEditShared("ADMIN"), "ADMIN edit");
  assert(canEditShared("PARTNER"), "PARTNER edit");
  assert(!canEditShared("ANALYST"), "ANALYST no edit");

  const analystWrite = dealWriteWhere("u1", "t1", "ANALYST");
  assert(
    JSON.stringify(analystWrite) === JSON.stringify({ userId: "u1" }),
    "ANALYST write = own only"
  );
  const partnerWrite = dealWriteWhere("u1", "t1", "PARTNER");
  assert(
    Array.isArray((partnerWrite as { OR?: unknown }).OR),
    "PARTNER write includes team"
  );
  assert(
    JSON.stringify(dealOwnerWhere("u1")) === JSON.stringify({ userId: "u1" }),
    "owner where"
  );
  assert(
    Array.isArray((dealReadWhere("u1", "t1") as { OR?: unknown }).OR),
    "read includes team"
  );
  assert(
    canEditResource({
      ownerUserId: "u1",
      resourceTeamId: "t1",
      currentUserId: "u1",
      currentTeamId: "t1",
      role: "ANALYST",
    }),
    "owner can edit"
  );
  assert(
    !canEditResource({
      ownerUserId: "u1",
      resourceTeamId: "t1",
      currentUserId: "u2",
      currentTeamId: "t1",
      role: "ANALYST",
    }),
    "analyst cannot edit shared"
  );
  assert(
    canEditResource({
      ownerUserId: "u1",
      resourceTeamId: "t1",
      currentUserId: "u2",
      currentTeamId: "t1",
      role: "PARTNER",
    }),
    "partner can edit shared"
  );
  const analystReportWrite = reportWriteWhere("u2", "t1", "ANALYST");
  assert(
    JSON.stringify(analystReportWrite) ===
      JSON.stringify({ deal: { userId: "u2" } }),
    "analyst report write = own deals only"
  );
  assert(
    Array.isArray(
      (fundReadWhere("u1", "t1") as { OR?: unknown }).OR
    ),
    "fund read includes team"
  );
  assert(
    JSON.stringify(inboundWriteWhere("u2", "t1", "ANALYST")) ===
      JSON.stringify({ userId: "u2" }),
    "analyst inbound write = own only"
  );
  assert(
    Array.isArray((portfolioReadWhere("u1", "t1") as { OR?: unknown }).OR),
    "portfolio read includes team"
  );
  assert(
    JSON.stringify(portfolioWriteWhere("u2", "t1", "ANALYST")) ===
      JSON.stringify({ userId: "u2" }),
    "analyst portfolio write = own only"
  );
  assert(
    JSON.stringify(portfolioOwnerWhere("u1")) ===
      JSON.stringify({ userId: "u1" }),
    "portfolio owner"
  );
  assert(
    Array.isArray((fundWriteWhere("u1", "t1", "PARTNER") as { OR?: unknown }).OR),
    "partner fund write includes team"
  );
  assert(
    Array.isArray((inboundReadWhere("u1", "t1") as { OR?: unknown }).OR),
    "inbound read includes team"
  );
  assert(
    JSON.stringify(inboundOwnerWhere("u1")) === JSON.stringify({ userId: "u1" }),
    "inbound owner"
  );
  assert(
    JSON.stringify(lpReportReadWhere("u1", "t1")) ===
      JSON.stringify({ fund: fundReadWhere("u1", "t1") }),
    "lp report follows fund read"
  );
  console.log("✅ 팀 역할별 권한");

  // LP PPTX 섹션 분할
  const pptxSections = markdownToPptxSections(
    "## 펀드 개요\n- TVPI 1.4x\n\n## 하이라이트\n- 메디랩스 성장\n"
  );
  assert(pptxSections.length >= 2, "markdown splits to slides");
  assert(pptxSections[0].title.includes("펀드"), "first heading title");
  console.log("✅ LP PPTX 마크다운 분할");

  // 연간 요금
  assert(yearlyPriceFromMonthly(99000) === 990000, "solo yearly");
  assert(planAmount("solo", "monthly") === 99000, "solo monthly amount");
  assert(planAmount("solo", "yearly") === 990000, "solo yearly amount");
  const solo = PUBLIC_PLANS.find((p) => p.key === "solo")!;
  assert(monthlyEquivalent(solo, "yearly") === Math.round(990000 / 12), "equiv");
  console.log("✅ 연간 요금 (2개월 무료)");

  // 구조 QA
  const doc = new Document({
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [new TextRun({ text: "Firm Header", size: 16 })],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: "1. 투자개요", bold: true })],
          }),
          new Paragraph({ children: [new TextRun({ text: "(안내)" })] }),
        ],
      },
    ],
  });
  const original = await Packer.toBuffer(doc);
  const result = await reconstructDOCX({
    originalBuffer: original,
    sectionMap: {
      mappings: [
        {
          templateSection: "1. 투자개요",
          sectionKey: SectionKey.INVESTMENT_OVERVIEW,
          confidence: 1,
        },
      ],
      unmappedSections: [],
      coverageRate: 0.1,
    },
    reportSections: [
      {
        sectionKey: SectionKey.INVESTMENT_OVERVIEW,
        title: "투자개요",
        content: "새 본문입니다.",
      },
    ],
  });
  const qa = await compareTemplateStructure(original, result.buffer, "DOCX");
  assert(qa.score >= 60, `QA score too low: ${qa.score}`);
  assert(qa.checks.some((c) => c.name.includes("styles")), "styles check");
  assert(qa.checks.some((c) => c.name.includes("본문")), "body check");
  console.log(`✅ 구조 QA 점수 ${qa.score}`);

  console.log("\n✅ 권한·요금·QA 테스트 통과\n");
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});

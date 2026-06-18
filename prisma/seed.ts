import { PrismaClient, UserRole, DealSector, DealStage } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create demo user
  const passwordHash = await bcrypt.hash("Demo1234!", 12);
  const user = await prisma.user.upsert({
    where: { email: "demo@dealsync.kr" },
    update: {},
    create: {
      email: "demo@dealsync.kr",
      name: "김심사",
      passwordHash,
      role: UserRole.ANALYST,
    },
  });

  console.log(`Created demo user: ${user.email}`);

  // Create sample deals
  const bioDeal = await prisma.deal.upsert({
    where: { id: "seed-bio-deal-001" },
    update: {},
    create: {
      id: "seed-bio-deal-001",
      name: "헬스케어AI Inc. Series B 투자 검토",
      companyName: "헬스케어AI Inc.",
      sector: DealSector.BIO,
      stage: DealStage.IC_PREP,
      investRound: "Series B",
      investAmount: 100,
      valuation: 800,
      description:
        "AI 기반 신약 개발 플랫폼 스타트업. Phase II 임상 진행 중인 항암 파이프라인 보유.",
      userId: user.id,
    },
  });

  const itDeal = await prisma.deal.upsert({
    where: { id: "seed-it-deal-001" },
    update: {},
    create: {
      id: "seed-it-deal-001",
      name: "DataFlow SaaS Series A 투자 검토",
      companyName: "DataFlow SaaS",
      sector: DealSector.IT,
      stage: DealStage.DEEP_DIVE,
      investRound: "Series A",
      investAmount: 50,
      valuation: 300,
      description:
        "B2B 데이터 파이프라인 자동화 SaaS. ARR $2M, NRR 130%, 월 15% 성장.",
      userId: user.id,
    },
  });

  console.log(`Created sample deals: ${bioDeal.companyName}, ${itDeal.companyName}`);

  // Create sample documents (with parsed text) so the report pipeline can run
  const sampleDocs = [
    {
      id: "seed-doc-bio-ir",
      dealId: bioDeal.id,
      name: "헬스케어AI_IR_Deck.pdf",
      type: "IR_DECK" as const,
      parsedText:
        "헬스케어AI Inc.는 AI 기반 신약 개발 플랫폼 기업으로, 자체 AI 신약 발굴 엔진을 통해 항암 신약 파이프라인을 개발 중임. " +
        "리드 파이프라인 HC-101은 고형암 대상 Phase II 임상 진행 중이며, 2건의 추가 전임상 파이프라인을 보유함. " +
        "보유 특허 12건(물질특허 포함), 글로벌 제약사와 공동연구 MOU 체결. Series B 100억원 조달로 Phase II 완료 및 Phase III 준비 예정.",
    },
    {
      id: "seed-doc-bio-fin",
      dealId: bioDeal.id,
      name: "헬스케어AI_재무자료.xlsx",
      type: "FINANCIAL" as const,
      parsedText:
        "FY24 매출 8억원(기술이전 수익), 영업손실 -45억원, 현금보유 60억원. 월 번 레이트 약 4억원, 런웨이 약 15개월. " +
        "누적 투자유치 220억원(Seed 20억, Series A 100억, 브릿지 100억).",
    },
    {
      id: "seed-doc-it-ir",
      dealId: itDeal.id,
      name: "DataFlow_IR_2025.pdf",
      type: "IR_DECK" as const,
      parsedText:
        "DataFlow SaaS는 B2B 데이터 파이프라인 자동화 솔루션을 제공하는 SaaS 기업. " +
        "ARR $2M, NRR 130%, 월 15% 성장, Churn 1.5%/월. 주요 고객 80개사(엔터프라이즈 12개사 포함). " +
        "CAC 회수기간 11개월, LTV/CAC 4.2배. Series A 50억원으로 영업조직 확대 및 미국 진출 추진.",
    },
    {
      id: "seed-doc-it-fin",
      dealId: itDeal.id,
      name: "DataFlow_재무_Unit_Economics.xlsx",
      type: "FINANCIAL" as const,
      parsedText:
        "FY24 매출 26억원(YoY +180%), 매출총이익률 82%, 영업손실 -12억원. 현금보유 35억원, 월 번 레이트 1.5억원, 런웨이 약 23개월.",
    },
  ];

  for (const doc of sampleDocs) {
    await prisma.document.upsert({
      where: { id: doc.id },
      update: {},
      create: {
        id: doc.id,
        dealId: doc.dealId,
        name: doc.name,
        type: doc.type,
        url: `/uploads/seed/${doc.id}`,
        size: 1024 * 512,
        mimeType: "application/octet-stream",
        parsedText: doc.parsedText,
      },
    });
  }

  console.log(`Created ${sampleDocs.length} sample documents`);
  console.log("\nSeed completed successfully!");
  console.log("\nDemo credentials:");
  console.log("  Email: demo@dealsync.kr");
  console.log("  Password: Demo1234!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

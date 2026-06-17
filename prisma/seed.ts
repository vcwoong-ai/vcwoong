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

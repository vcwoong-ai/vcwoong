import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";
import path from "path";

const adapter = new PrismaBetterSqlite3({
  url: `file:${path.resolve(process.cwd(), "dev.db")}`,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  // Create demo user
  const hashedPassword = await bcrypt.hash("demo1234", 12);

  const user = await prisma.user.upsert({
    where: { email: "demo@dealsync.ai" },
    update: {},
    create: {
      name: "김민준",
      email: "demo@dealsync.ai",
      password: hashedPassword,
      company: "DealSync 파트너스",
      role: "analyst",
    },
  });

  console.log("✓ Demo user created:", user.email);

  // Create sample deals
  const deals = [
    {
      companyName: "AIFlow Technologies",
      companyNameKo: "에이아이플로우",
      sector: "AI/ML",
      subSector: "생성형 AI",
      stage: "Series A",
      founded: "2022",
      location: "서울특별시 강남구",
      website: "https://aiflow.io",
      employeeCount: 35,
      investmentAmount: 5000000000,
      equityStake: 10,
      preMoneyValuation: 45000000000,
      totalRoundSize: 8000000000,
      roundType: "상환전환우선주(RCPS)",
      leadInvestor: "K벤처스",
      businessDescription:
        "기업용 AI 문서 분석 및 자동화 플랫폼. 기업 내 비정형 데이터를 AI로 분석하여 인사이트를 추출하고 업무 자동화를 지원합니다.",
      productService:
        "SaaS 기반 AI 문서 분석 플랫폼. OCR, NLP, GPT-4 기술을 결합하여 계약서, 보고서 등 다양한 문서를 자동 분석합니다.",
      revenueModel: "월정액 구독 (기업별 $500-$5,000/월) + 엔터프라이즈 커스텀 계약",
      targetMarket: "국내 중견-대기업 법무/재무/인사 부서. 500명 이상 기업 약 4,200개사.",
      marketSize: "국내 기업용 AI 시장 3조원, 연 25% 성장. 글로벌 $50B 규모.",
      competitiveAdvantage:
        "한국어 특화 NLP 모델, 자체 개발 OCR 엔진, 업계 최초 한국 법규 AI 검토 기능",
      ceoName: "이준혁",
      ceoBackground:
        "KAIST 전산학 박사, 전 삼성SDS AI연구소 수석연구원 (8년), NLP 특허 12건 보유",
      teamDescription:
        "CTO 박민수 (Google AI 출신), CPO 김지원 (McKinsey 3년, 스타트업 COO 경력), 개발팀 15명 (평균 경력 7년)",
      revenueLastYear: 800000000,
      revenueThisYear: 2400000000,
      revenueProjection: 7200000000,
      burnRate: 300000000,
      runway: 18,
      customers:
        "유료 고객 47개사, 주요 고객: 현대차, 롯데케미칼, 하나금융그룹. MoM 성장률 22%",
      keyMetrics: "ARR ₩28억, NPS 72, 고객 유지율 94%, CAC ₩800만, LTV ₩9,600만",
      useOfFunds:
        "제품 개발 40%, 세일즈/마케팅 35%, 인력 채용 20%, 기타 운영비 5%",
      keyRisks:
        "대형 플랫폼(MS, Google) 직접 경쟁 가능성, 데이터 보안 규제 강화, 한국 시장 한계로 인한 글로벌 확장 필요성",
      exitStrategy:
        "3~4년 내 코스닥 상장 목표. 또는 국내외 대형 SW 기업 M&A 가능성 (SI, 전자, 금융 분야)",
      analystNotes:
        "1월 16일 미팅. 대표이사 기술 이해도 탁월. 영업력이 다소 약함. Gartner Magic Quadrant 등재 목표 확인. 레퍼런스 콜 필요.",
      status: "report_generated",
    },
    {
      companyName: "MediPulse",
      companyNameKo: "메디펄스",
      sector: "헬스케어",
      subSector: "디지털 헬스",
      stage: "Seed",
      founded: "2023",
      location: "서울특별시 서초구",
      employeeCount: 18,
      investmentAmount: 2000000000,
      equityStake: 15,
      preMoneyValuation: 11300000000,
      roundType: "전환사채(CB)",
      businessDescription:
        "AI 기반 만성질환 관리 앱. 당뇨, 고혈압 등 만성질환자를 위한 개인화 건강 관리 및 원격 모니터링 서비스.",
      productService: "B2C 앱 + B2B (보험사, 제약사 데이터 API)",
      revenueModel: "보험사/제약사 파트너십 수익 + 프리미엄 구독 ₩29,000/월",
      targetMarket: "국내 만성질환자 1,100만명 (당뇨 600만, 고혈압 1,300만)",
      ceoName: "박서연",
      ceoBackground: "서울대 의대 졸업, 서울아산병원 내과 전문의, 의료 스타트업 CMO 경력",
      revenueLastYear: 0,
      revenueThisYear: 150000000,
      burnRate: 180000000,
      runway: 11,
      customers: "MAU 12,000명, 유료전환율 8%, 주요 파트너: 한화생명, 동아제약",
      keyMetrics: "DAU 4,200, 30일 리텐션 67%, 앱스토어 평점 4.8",
      status: "reviewing",
    },
    {
      companyName: "FinEdge",
      companyNameKo: "핀에지",
      sector: "핀테크",
      stage: "Series B",
      founded: "2020",
      location: "서울특별시 영등포구",
      employeeCount: 92,
      investmentAmount: 15000000000,
      equityStake: 8,
      preMoneyValuation: 172000000000,
      totalRoundSize: 25000000000,
      roundType: "상환전환우선주(RCPS)",
      leadInvestor: "소프트뱅크벤처스",
      businessDescription:
        "중소기업 전용 임베디드 금융 플랫폼. ERP/POS 시스템과 연동하여 대출, 결제, 보험을 원스탑 제공.",
      revenueLastYear: 8500000000,
      revenueThisYear: 19000000000,
      revenueProjection: 42000000000,
      burnRate: 800000000,
      runway: 24,
      customers: "제휴 중소기업 3,200개사, 거래액 월 ₩800억",
      status: "approved",
    },
    {
      companyName: "EduPath",
      companyNameKo: "에듀패스",
      sector: "에듀테크",
      stage: "Pre-Seed",
      founded: "2024",
      location: "경기도 성남시",
      employeeCount: 8,
      investmentAmount: 500000000,
      equityStake: 12,
      preMoneyValuation: 3700000000,
      businessDescription:
        "AI 튜터 기반 초중등 수학 학습 플랫폼. 개인별 학습 수준을 실시간 분석하여 맞춤형 문제를 제공.",
      ceoName: "최동훈",
      revenueThisYear: 30000000,
      burnRate: 60000000,
      runway: 8,
      customers: "베타 유저 850명, 학원 파트너 12개",
      status: "draft",
    },
    {
      companyName: "GreenLoop",
      companyNameKo: "그린루프",
      sector: "에너지/클린테크",
      stage: "Series A",
      founded: "2021",
      location: "인천광역시",
      employeeCount: 47,
      investmentAmount: 8000000000,
      equityStake: 12,
      preMoneyValuation: 58700000000,
      businessDescription:
        "기업 탄소 배출 모니터링 및 탄소 크레딧 거래 플랫폼. ESG 규제 대응 솔루션 제공.",
      revenueLastYear: 1200000000,
      revenueThisYear: 3800000000,
      burnRate: 450000000,
      runway: 16,
      customers: "제조기업 고객 38개사, 코스피 상장사 비율 60%",
      status: "rejected",
    },
  ];

  for (const dealData of deals) {
    const { status, ...data } = dealData;
    const deal = await prisma.deal.upsert({
      where: { id: `seed-${dealData.companyName.toLowerCase().replace(/\s/g, "-")}` },
      update: {},
      create: {
        id: `seed-${dealData.companyName.toLowerCase().replace(/\s/g, "-")}`,
        ...data,
        userId: user.id,
        status,
      },
    });

    // Add sample report for AIFlow
    if (deal.companyName === "AIFlow Technologies") {
      await prisma.report.upsert({
        where: { dealId: deal.id },
        update: {},
        create: {
          dealId: deal.id,
          content: `# 투자심사보고서\n\n**기업명:** AIFlow Technologies (에이아이플로우)  \n**작성일:** 2024년 1월 16일  \n**보고서 등급:** A  \n**투자 의견:** 적극 추천\n\n---\n\n## 1. 회사 개요\n\nAIFlow Technologies는 2022년 설립된 기업용 AI 문서 분석 자동화 플랫폼으로, KAIST 출신 AI 전문가가 창업한 딥테크 스타트업입니다. 국내 기업 환경에 최적화된 한국어 특화 AI 모델을 보유하고 있으며, 빠른 성장세와 탄탄한 고객 기반을 확보하고 있습니다.\n\n## 2. 비즈니스 모델 및 제품 분석\n\n### 2.1 제품/서비스\n\nSaaS 기반 AI 문서 분석 플랫폼으로 OCR, NLP, GPT-4 기술을 결합하여 계약서, 보고서 등 비정형 문서를 자동 처리합니다.\n\n### 2.2 수익 모델\n\n월정액 SaaS 구독 ($500~$5,000/월) 및 엔터프라이즈 계약으로 구성된 예측 가능한 반복 매출 구조입니다.\n\n### 2.3 경쟁 우위\n\n한국어 특화 NLP, 자체 개발 OCR 엔진, 한국 법규 AI 검토 기능이 핵심 차별점입니다.\n\n## 3. 시장 분석\n\n국내 기업용 AI 소프트웨어 시장은 연 25% 이상 성장 중이며, 글로벌 시장 규모는 $50B 이상으로 추정됩니다. AIFlow의 한국어 특화 접근법은 글로벌 플레이어 대비 명확한 로컬 우위를 형성합니다.\n\n## 4. 팀 평가\n\n대표이사 이준혁(KAIST 박사, 삼성SDS 출신)의 기술 전문성이 매우 탁월하며, CTO(Google AI)와 CPO(McKinsey) 등 각 분야 최고 인재로 구성되어 있습니다. 팀 역량 A+ 등급.\n\n## 5. 재무 분석\n\nARR ₩28억(YoY 200% 성장), 고객 유지율 94%, NPS 72점으로 업계 최고 수준입니다. MoM 22% 성장률은 매우 우수합니다.\n\n## 6. 투자 조건 분석\n\nPre-Money ₩450억(ARR 16x)은 동종 업계 17-22x 대비 합리적이며, 향후 성장성 감안 시 투자 매력도가 높습니다.\n\n## 7. 리스크 요인\n\n### 7.1 사업 리스크\n- MS Copilot, Google Workspace AI 직접 경쟁 가능성\n\n### 7.2 팀/실행 리스크\n- 영업/마케팅 조직 보강 필요\n\n## 8. Exit 전략\n\n3-4년 내 코스닥 상장 또는 SI 대기업 M&A 가능성. 예상 IRR 30-40%.\n\n## 9. 투자 의견 및 종합 평가\n\n### 핵심 강점\n- 검증된 기술력과 PMF 달성\n- 탁월한 팀 역량과 도메인 전문성\n- 빠른 매출 성장과 높은 고객 충성도\n\n### 핵심 우려사항\n- 글로벌 대기업 경쟁 위험\n- 영업 조직 강화 필요\n\n### 최종 의견\n\n**투자등급: A / 투자의견: 적극 추천**\n\nAIFlow는 한국 AI SaaS 시장의 선도 기업으로 성장할 잠재력이 있습니다. 즉시 투자심사위원회 상정을 권고합니다.\n\n---\n*본 보고서는 DealSync AI에 의해 생성되었습니다.*`,
          summary: "AIFlow Technologies는 AI/ML 분야의 Series A 단계 스타트업으로, 강력한 기술력과 빠른 성장세를 보이고 있습니다.",
          rating: "A",
          recommendation: "적극 추천",
          keyStrengths: "한국어 특화 AI 기술, 탁월한 팀 구성, 높은 ARR 성장률",
          keyRisks: "대형 IT 기업 경쟁, 영업 조직 보강 필요",
        },
      });
    }

    console.log(`✓ Deal created: ${deal.companyName} [${deal.status}]`);
  }

  console.log("\n🎉 Seed complete!");
  console.log("Demo login: demo@dealsync.ai / demo1234");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

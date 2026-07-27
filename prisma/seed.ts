import {
  PrismaClient,
  UserRole,
  DealSector,
  DealStage,
  ReportStatus,
  AgentType,
  SectionStatus,
  SectionKey,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create demo user
  const passwordHash = await bcrypt.hash("Demo1234!", 12);
  const user = await prisma.user.upsert({
    where: { email: "demo@vcwoong.kr" },
    // 데모 계정은 모든 기능을 체험할 수 있도록 최상위 플랜으로 둔다
    update: { subscriptionPlan: "FULL", subscriptionStatus: "ACTIVE" },
    create: {
      email: "demo@vcwoong.kr",
      name: "김심사",
      passwordHash,
      role: UserRole.ANALYST,
      subscriptionPlan: "FULL",
      subscriptionStatus: "ACTIVE",
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

  const climateDeal = await prisma.deal.upsert({
    where: { id: "seed-climate-deal-001" },
    update: {},
    create: {
      id: "seed-climate-deal-001",
      name: "GreenLoop Series A 투자 검토",
      companyName: "GreenLoop",
      sector: DealSector.CLIMATE,
      stage: DealStage.DEEP_DIVE,
      investRound: "Series A",
      investAmount: 60,
      valuation: 280,
      description:
        "산업 폐열 회수 + 탄소 크레딧 MRV 플랫폼. 파일럿 3곳, 연간 감축 42,000 tCO2e.",
      userId: user.id,
    },
  });

  const consumerDeal = await prisma.deal.upsert({
    where: { id: "seed-consumer-deal-001" },
    update: {},
    create: {
      id: "seed-consumer-deal-001",
      name: "BloomLab Series A 투자 검토",
      companyName: "BloomLab",
      sector: DealSector.CONSUMER,
      stage: DealStage.SCREENING,
      investRound: "Series A",
      investAmount: 45,
      valuation: 200,
      description:
        "클린뷰티 D2C. GMV 210억, 재구매율 38%, ROAS 3.4x.",
      userId: user.id,
    },
  });

  const fintechDeal = await prisma.deal.upsert({
    where: { id: "seed-fintech-deal-001" },
    update: {},
    create: {
      id: "seed-fintech-deal-001",
      name: "VaultPay Series B 투자 검토",
      companyName: "VaultPay",
      sector: DealSector.FINTECH,
      stage: DealStage.IC_PREP,
      investRound: "Series B",
      investAmount: 120,
      valuation: 900,
      description:
        "B2B 결제·정산 인프라. TPV 2.8조, Take Rate 0.28%.",
      userId: user.id,
    },
  });

  console.log(
    `Created sample deals: ${bioDeal.companyName}, ${itDeal.companyName}, ${climateDeal.companyName}, ${consumerDeal.companyName}, ${fintechDeal.companyName}`
  );

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
    {
      id: "seed-doc-climate-ir",
      dealId: climateDeal.id,
      name: "GreenLoop_IR.md",
      type: "IR_DECK" as const,
      parsedText:
        "GreenLoop는 산업 폐열 회수 하드웨어와 탄소 크레딧 MRV SaaS를 제공. TRL 7, 파일럿 화학 플랜트 3곳, 연간 감축 42,000 tCO2e. " +
        "Series A 60억원, Post-money 280억원. FY24 매출 38억원(+95% YoY), 매출총이익률 48%, 보조금 비중 18%, 런웨이 16개월. ISO 14064, Verra VCS 준비.",
    },
    {
      id: "seed-doc-consumer-ir",
      dealId: consumerDeal.id,
      name: "BloomLab_IR.md",
      type: "IR_DECK" as const,
      parsedText:
        "BloomLab은 클린뷰티 D2C 브랜드. GMV FY24 210억원(+72% YoY), Net Revenue 168억원, AOV 48,000원, 재구매율 38%. " +
        "CAC 22,000원, LTV 95,000원, ROAS 3.4x. 채널: D2C 55% / 마켓플레이스 35% / 해외 10%. Series A 45억원, Post-money 200억원.",
    },
    {
      id: "seed-doc-fintech-ir",
      dealId: fintechDeal.id,
      name: "VaultPay_IR.md",
      type: "IR_DECK" as const,
      parsedText:
        "VaultPay는 B2B 결제·정산 인프라. TPV FY24 2.8조원(+65% YoY), Take Rate 0.28%, 가맹점 18,000. " +
        "전자금융업 등록 완료. Series B 120억원, Post-money 900억원. 매출 780억원, 영업이익률 8%, 런웨이 22개월.",
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

  // Create a fully completed (FINAL) sample report for the BIO deal so a
  // finished IC report is immediately available to view and export.
  const REPORT_ID = "seed-report-bio-001";

  const finalSections: Array<{
    key: SectionKey;
    title: string;
    order: number;
    content: string;
  }> = [
    {
      key: SectionKey.INVESTMENT_OVERVIEW,
      title: "투자개요",
      order: 1,
      content:
        "### 1. 투자 핵심 요약\n헬스케어AI Inc.는 자체 AI 신약 발굴 엔진을 기반으로 항암 신약 파이프라인을 개발하는 기업으로, 리드 파이프라인 HC-101이 고형암 대상 Phase II 임상에 진입하며 임상적·상업적 가치 변곡점에 도달함.\n\n### 2. 투자 조건 요약\n- 라운드: Series B\n- 투자 금액: 100억원\n- Post-money 밸류에이션: 800억원\n- 투자 형태: 상환전환우선주(RCPS)\n\n### 3. 핵심 투자 포인트\n- AI 신약 발굴 플랫폼의 확장성(파이프라인 다각화 가능)\n- HC-101 Phase II 진입에 따른 가치 상승 모멘텀\n- 글로벌 제약사와의 공동연구 MOU 보유\n- 물질특허 포함 12건의 IP 포트폴리오\n\n### 4. 주요 우려 사항\n- 임상 실패 리스크(Phase II→III 전환 확률 약 40%)\n- 추가 자금 조달 필요성(Phase III 대규모 자금)\n\n### 5. 투자 의견\n임상 리스크는 바이오 투자의 본질적 요소로, 분할 투자 및 마일스톤 연동을 전제로 **조건부 투자 권고**.",
    },
    {
      key: SectionKey.COMPANY_OVERVIEW,
      title: "회사개요",
      order: 2,
      content:
        "### 1. 기업 기본 정보\n- 기업명: 헬스케어AI Inc.\n- 사업 영역: AI 기반 신약 개발(항암)\n- 임직원: 연구개발 중심 조직(상세 확인 필요)\n\n### 2. 설립 배경 및 비전\n신약 개발의 높은 실패율과 장기간 소요 문제를 AI로 해결하고자 설립됨. '데이터 기반 신약 발굴의 표준화'를 비전으로 함.\n\n### 3. 경영진\n- 대표이사: 제약·바이오 R&D 및 사업개발 경력 보유\n- CTO: AI/ML 및 신약 발굴 도메인 전문성\n\n### 4. 주요 연혁\n설립 → AI 플랫폼 구축 → HC-101 IND 승인 → Phase I 완료 → Phase II 진입\n\n### 5. 주주 구조\n창업팀 및 기존 재무적 투자자 중심(누적 220억원 유치).",
    },
    {
      key: SectionKey.PRODUCT_TECHNOLOGY,
      title: "제품/기술",
      order: 3,
      content:
        "### 1. 핵심 파이프라인 현황\n- HC-101: 고형암 대상, Phase II 진행 중, 신규 기전(MoA) 기반 First-in-class 지향\n- 전임상 단계 추가 파이프라인 2건 보유\n\n### 2. 핵심 기술 플랫폼\n자체 AI 신약 발굴 엔진을 통해 후보물질 발굴 기간과 비용을 단축. 플랫폼 기반으로 적응증 확장이 용이함.\n\n### 3. IP 포트폴리오\n- 보유 특허 12건(물질특허 포함)\n- 핵심 물질특허 만료 시점 및 FTO 검토 필요\n\n### 4. 규제 전략\n국내 MFDS 및 미국 FDA 동시 전략. 희귀의약품 지정 및 패스트트랙 활용 검토.\n\n### 5. 글로벌 BD 전략\n글로벌 제약사와 공동연구 MOU 체결, 향후 기술이전(L/O) 시 Upfront·마일스톤·로열티 구조 협상 예정.",
    },
    {
      key: SectionKey.MARKET_ANALYSIS,
      title: "시장분석",
      order: 4,
      content:
        "### 1. 시장 규모(TAM/SAM/SOM)\n- TAM: 글로벌 항암제 시장(수천억 달러 규모, 출처 확인 필요)\n- SAM: 표적 적응증 세그먼트\n- SOM: 기술이전·상업화 기준 현실적 목표\n\n### 2. 시장 성장률\n항암제 시장은 연 10% 내외 성장 지속, 정밀의료·면역항암 트렌드가 성장 견인.\n\n### 3. 경쟁 구도\n| 구분 | 강점 | 약점 |\n|------|------|------|\n| 헬스케어AI | AI 플랫폼·신규 기전 | 임상 후기 데이터 부족 |\n| 글로벌 빅파마 | 자본·임상 역량 | 혁신 속도 |\n| 경쟁 바이오텍 | 특정 기전 집중 | 플랫폼 확장성 한계 |\n\n### 4. 고객/파트너\n핵심 고객은 기술이전 대상 글로벌 제약사.\n\n### 5. 진입장벽\nAI 플랫폼·데이터·특허에 기반한 구조적 진입장벽 보유.",
    },
    {
      key: SectionKey.FINANCIAL_STATUS,
      title: "재무현황",
      order: 5,
      content:
        "### 1. 손익 요약\n- FY24 매출 8억원(기술이전 수익), 영업손실 -45억원\n- R&D 집약적 비용 구조(임상 비용 비중 높음)\n\n### 2. 현금흐름 및 런웨이\n- 현금 보유 60억원, 월 번 레이트 약 4억원 → 런웨이 약 15개월\n- 본 라운드 100억원 조달 시 Phase II 완료 및 Phase III 준비 자금 확보\n\n### 3. 펀딩 히스토리\n- 누적 220억원(Seed 20억, Series A 100억, 브릿지 100억)\n\n### 4. 재무 리스크\n수익화 이전 단계로 추가 자금 조달 필요성 상존. 기술이전 성사 시 조기 현금화 가능.",
    },
    {
      key: SectionKey.VALUATION,
      title: "밸류에이션",
      order: 6,
      content:
        "### 1. 이번 라운드 요약\n- Pre 700억 / Post 800억원, 투자금 100억원(지분 약 12.5%)\n\n### 2. rNPV 분석\n- HC-101: 피크매출 추정 × 임상 성공확률(Phase II 약 15~25%) × 할인율(12%) 적용\n- 파이프라인별 rNPV 합산 기준 가치 산정\n\n### 3. 비교 밸류에이션(Comps)\n- 유사 임상 단계(Phase II) 항암 바이오텍 M&A·상장 사례 대비 검토\n\n### 4. 적정성 검토\n총 rNPV 대비 요청 밸류에이션은 수용 가능 범위로 판단되나 임상 진척에 민감.\n\n### 5. 예상 수익률\n- 기술이전 시나리오 기준 목표 MoM 3~5배, IRR 30%+ 목표.",
    },
    {
      key: SectionKey.RISK_ANALYSIS,
      title: "리스크",
      order: 7,
      content:
        "### 1. 임상/기술 리스크\n- Phase II 결과 불확실성(영향도 H / 발생가능성 M) — 핵심 리스크\n\n### 2. 재무 리스크\n- Phase III 대규모 자금 조달 필요(영향도 H / 발생가능성 M)\n\n### 3. 사업/경쟁 리스크\n- 경쟁 약물 대비 차별성 입증 필요(영향도 M / 발생가능성 M)\n\n### 4. 규제 리스크\n- FDA/MFDS 허가 경로 불확실성(영향도 M / 발생가능성 M)\n\n### 5. 완화 방안\n- 마일스톤 연동 분할 투자(Tranche), 이사회 참여, 기술이전 병행 추진으로 리스크 분산.",
    },
    {
      key: SectionKey.INVESTMENT_TERMS,
      title: "투자조건",
      order: 8,
      content:
        "### 1. 투자 구조\n- 수단: 상환전환우선주(RCPS), 금액 100억원, 지분 약 12.5%\n- 공동투자: Lead 참여 전제\n\n### 2. 우선주 조건\n- 청산우선권 1x Non-participating\n- 희석방지(Broad-based weighted average)\n\n### 3. 주요 계약 조건\n- 이사회 1석, 정보열람권, 우선매수권, 동반매도권\n- 핵심 연구인력 Lock-up 및 경업금지\n\n### 4. Exit 전략\n- 1순위 기술이전(L/O), 2순위 IPO, 3순위 M&A. 목표 Exit 3~5년.",
    },
    {
      key: SectionKey.OPINION_SUMMARY,
      title: "의견종합",
      order: 9,
      content:
        "### 1. 투자 의견\n**조건부 투자 권고** — 마일스톤 연동 분할 투자를 전제로 집행 권고.\n\n### 2. 핵심 투자 포인트(Top 3)\n1. 확장성 높은 AI 신약 발굴 플랫폼\n2. HC-101 Phase II 진입에 따른 가치 변곡점\n3. 글로벌 제약사 협력 및 IP 경쟁력\n\n### 3. 핵심 우려 사항(Top 3)\n1. 임상 실패 리스크 — Phase II 중간결과 모니터링\n2. 추가 자금 조달 — 후속 라운드 계획 점검\n3. 차별성 입증 — 경쟁 약물 대비 데이터 확보\n\n### 4. 투자 전제 조건\n- 실사(DD) 클리어, 핵심 인력 잔류 약정\n\n### 5. 심사역 의견\n리스크 대비 기대 수익이 매력적이며 포트폴리오 전략에 부합함.",
    },
    {
      key: SectionKey.APPENDIX,
      title: "별첨",
      order: 10,
      content:
        "### 1. 재무 상세\nFY24 손익 및 현금 포지션 요약(IR/재무자료 기준)\n\n### 2. 임상 데이터\nHC-101 Phase I 결과 요약 및 Phase II 디자인\n\n### 3. IP 목록\n물질특허 포함 12건 특허 리스트\n\n### 4. 리스크 매트릭스\n영향도/발생가능성 상세 표\n\n### 5. 참고 자료\n분석에 활용된 IR·재무·시장 자료 목록",
    },
  ];

  await prisma.report.upsert({
    where: { id: REPORT_ID },
    update: { status: ReportStatus.FINAL },
    create: {
      id: REPORT_ID,
      dealId: bioDeal.id,
      title: `${bioDeal.companyName} 투자심의보고서`,
      agentType: AgentType.BIO,
      status: ReportStatus.FINAL,
      generatedAt: new Date(),
    },
  });

  await prisma.reportSection.deleteMany({ where: { reportId: REPORT_ID } });
  await prisma.reportSection.createMany({
    data: finalSections.map((s) => ({
      reportId: REPORT_ID,
      sectionKey: s.key,
      title: s.title,
      content: s.content,
      order: s.order,
      status: SectionStatus.APPROVED,
    })),
  });

  console.log(
    `Created 1 completed (FINAL) sample report with ${finalSections.length} approved sections`
  );

  // ── 풀사이클: 펀드 + 포트폴리오 사후관리 ──
  const fund = await prisma.fund.upsert({
    where: { id: "seed-fund-001" },
    update: {},
    create: {
      id: "seed-fund-001",
      name: "Vcwoong 1호 벤처투자조합",
      vintageYear: 2023,
      fundSize: 500,
      paidIn: 320,
      managementFee: 2.5,
      userId: user.id,
    },
  });

  const portfolioSeed = [
    {
      id: "seed-pf-001",
      companyName: "메디랩스",
      sector: DealSector.BIO,
      investedAt: new Date("2023-06-15"),
      investAmount: 40,
      ownershipPercent: 8,
      entryValuation: 500,
      currentValuation: 900,
      status: "ACTIVE" as const,
      kpis: [
        { period: "2025Q2", metric: "런웨이", value: 18, unit: "개월" },
        { period: "2025Q3", metric: "런웨이", value: 15, unit: "개월" },
        { period: "2025Q4", metric: "런웨이", value: 11, unit: "개월" },
        { period: "2026Q1", metric: "런웨이", value: 8, unit: "개월" },
        { period: "2025Q4", metric: "매출", value: 12, unit: "억원" },
        { period: "2026Q1", metric: "매출", value: 18, unit: "억원" },
      ],
      milestones: [
        { title: "Phase I 톱라인 발표", dueDate: new Date("2026-03-31"), status: "DONE" as const },
        { title: "기술이전 LOI 체결", dueDate: new Date("2026-09-30"), status: "IN_PROGRESS" as const },
      ],
    },
    {
      id: "seed-pf-002",
      companyName: "커머스플로우",
      sector: DealSector.CONSUMER,
      investedAt: new Date("2024-02-20"),
      investAmount: 25,
      ownershipPercent: 12,
      entryValuation: 200,
      currentValuation: 180,
      status: "WATCH" as const,
      kpis: [
        { period: "2025Q3", metric: "ARR", value: 22, unit: "억원" },
        { period: "2025Q4", metric: "ARR", value: 24, unit: "억원" },
        { period: "2026Q1", metric: "ARR", value: 23, unit: "억원" },
        { period: "2026Q1", metric: "런웨이", value: 5, unit: "개월" },
      ],
      milestones: [
        { title: "월 BEP 달성", dueDate: new Date("2026-01-31"), status: "DELAYED" as const },
      ],
    },
    {
      id: "seed-pf-003",
      companyName: "노드시스템",
      sector: DealSector.IT,
      investedAt: new Date("2022-11-10"),
      investAmount: 30,
      ownershipPercent: 15,
      entryValuation: 200,
      currentValuation: 200,
      realizedAmount: 96,
      status: "EXITED" as const,
      kpis: [{ period: "2025Q4", metric: "ARR", value: 60, unit: "억원" }],
      milestones: [
        { title: "전략적 M&A 클로징", dueDate: new Date("2026-01-15"), status: "DONE" as const },
      ],
    },
  ];

  for (const p of portfolioSeed) {
    const { kpis, milestones, ...company } = p;
    await prisma.portfolioCompany.upsert({
      where: { id: p.id },
      update: {},
      create: {
        ...company,
        realizedAmount: company.realizedAmount ?? 0,
        fundId: fund.id,
        userId: user.id,
      },
    });
    for (const k of kpis) {
      await prisma.companyKPI.upsert({
        where: {
          companyId_period_metric: {
            companyId: p.id,
            period: k.period,
            metric: k.metric,
          },
        },
        update: { value: k.value, unit: k.unit },
        create: { companyId: p.id, ...k },
      });
    }
    const existingMs = await prisma.milestone.count({ where: { companyId: p.id } });
    if (existingMs === 0) {
      await prisma.milestone.createMany({
        data: milestones.map((m) => ({ companyId: p.id, ...m })),
      });
    }
  }

  await prisma.portfolioUpdate.upsert({
    where: { companyId_period: { companyId: "seed-pf-001", period: "2026Q1" } },
    update: {},
    create: {
      companyId: "seed-pf-001",
      period: "2026Q1",
      summary:
        "메디랩스는 2026Q1 매출 18억원으로 직전 분기 대비 50% 성장했으나, 런웨이는 8개월로 축소됨. Phase I 톱라인 발표를 완료해 기술이전 협상 레버리지를 확보한 상태임.",
      highlights: "- 매출 12억 → 18억 (+50% QoQ)\n- Phase I 톱라인 발표 완료",
      concerns:
        "- 런웨이 8개월 — 후속 라운드 착수 시점 점검 (모니터링: 월 번레이트)\n- 기술이전 LOI 지연 시 자금 계획 재수립 필요 (모니터링: LOI 체결 여부)",
    },
  });

  console.log(
    `Created fund + ${portfolioSeed.length} portfolio companies with KPIs/milestones`
  );
  console.log("\nSeed completed successfully!");
  console.log("\nDemo credentials:");
  console.log("  Email: demo@vcwoong.kr");
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

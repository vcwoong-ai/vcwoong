import { PortfolioStatus } from "@prisma/client";
import { generateText } from "@/lib/claude";
import {
  calculatePortfolioMetrics,
  comparePeriod,
  holdingValue,
  type PortfolioMetrics,
} from "@/lib/portfolio";

export interface LpCompanyInput {
  companyName: string;
  sector: string;
  status: PortfolioStatus;
  investedAt: Date | string;
  investAmount: number;
  ownershipPercent: number;
  entryValuation: number;
  currentValuation: number | null;
  realizedAmount: number;
  kpis: Array<{ period: string; metric: string; value: number; unit: string }>;
  milestones: Array<{ title: string; dueDate: Date | string; status: string }>;
  updates: Array<{ period: string; summary: string; concerns: string | null }>;
}

export interface LpFundInput {
  name: string;
  vintageYear: number;
  fundSize: number;
  paidIn: number;
  managementFee: number;
}

export interface SectorAllocationRow {
  sector: string;
  count: number;
  invested: number;
  currentValue: number;
  sharePercent: number;
}

export interface LpReportComputed {
  metrics: PortfolioMetrics;
  /// 납입 자본 대비 지표 (LP 관점)
  navToPaidIn: number;
  deployedPercent: number;
  sectorAllocation: SectorAllocationRow[];
  watchList: string[];
  topPerformers: Array<{ name: string; moic: number }>;
}

function companyMoic(c: LpCompanyInput): number {
  if (!c.investAmount) return 0;
  return (holdingValue(c) + c.realizedAmount) / c.investAmount;
}

export function computeLpFigures(
  fund: LpFundInput,
  companies: LpCompanyInput[]
): LpReportComputed {
  const metrics = calculatePortfolioMetrics(companies);

  const bySector: Record<string, SectorAllocationRow> = {};
  for (const c of companies) {
    const row = (bySector[c.sector] ??= {
      sector: c.sector,
      count: 0,
      invested: 0,
      currentValue: 0,
      sharePercent: 0,
    });
    row.count += 1;
    row.invested += c.investAmount;
    row.currentValue += holdingValue(c);
  }
  const sectorAllocation = Object.values(bySector)
    .map((r) => ({
      ...r,
      invested: round(r.invested),
      currentValue: round(r.currentValue),
      sharePercent: metrics.totalInvested
        ? round((r.invested / metrics.totalInvested) * 100)
        : 0,
    }))
    .sort((a, b) => b.invested - a.invested);

  const watchList = companies
    .filter(
      (c) =>
        c.status === PortfolioStatus.WATCH || c.status === PortfolioStatus.RISK
    )
    .map((c) => c.companyName);

  const topPerformers = [...companies]
    .map((c) => ({ name: c.companyName, moic: round(companyMoic(c), 2) }))
    .sort((a, b) => b.moic - a.moic)
    .slice(0, 3);

  const paidIn = fund.paidIn || metrics.totalInvested;

  return {
    metrics,
    navToPaidIn: paidIn ? round(metrics.unrealizedValue / paidIn, 2) : 0,
    deployedPercent: fund.fundSize
      ? round((metrics.totalInvested / fund.fundSize) * 100)
      : 0,
    sectorAllocation,
    watchList,
    topPerformers,
  };
}

function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** 프롬프트에 넣을 포트폴리오 요약 (실데이터만) */
function portfolioBlock(companies: LpCompanyInput[]): string {
  return companies
    .map((c) => {
      const latestKpis = [...c.kpis]
        .sort((a, b) => comparePeriod(a.period, b.period))
        .slice(-4)
        .map((k) => `${k.period} ${k.metric} ${k.value}${k.unit}`)
        .join(", ");
      const latestUpdate = c.updates[0];
      const openMilestones = c.milestones
        .filter((m) => m.status !== "DONE")
        .map(
          (m) =>
            `${m.title}(${new Date(m.dueDate).toISOString().slice(0, 10)}, ${m.status})`
        )
        .join(", ");
      return [
        `### ${c.companyName} (${c.sector}, ${c.status})`,
        `- 투자 ${c.investAmount}억 / 지분 ${c.ownershipPercent}% / Entry ${c.entryValuation}억 → 현재 ${c.currentValuation ?? "확인 필요"}억`,
        `- 회수액 ${c.realizedAmount}억 · MOIC ${round(companyMoic(c), 2)}x`,
        latestKpis ? `- KPI: ${latestKpis}` : "- KPI: 미등록",
        openMilestones ? `- 미완료 마일스톤: ${openMilestones}` : "",
        latestUpdate
          ? `- 최근 노트(${latestUpdate.period}): ${latestUpdate.summary.slice(0, 240)}`
          : "",
        latestUpdate?.concerns
          ? `- 우려: ${latestUpdate.concerns.replace(/\s+/g, " ").slice(0, 200)}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

export interface LpReportSections {
  executiveSummary: string;
  portfolioSummary: string;
  quarterlyHighlights: string;
  watchListCommentary: string;
  nextQuarterFocus: string;
}

const SECTION_LABELS: Array<{ key: keyof LpReportSections; label: string }> = [
  { key: "executiveSummary", label: "총평" },
  { key: "portfolioSummary", label: "포트폴리오 현황" },
  { key: "quarterlyHighlights", label: "분기 하이라이트" },
  { key: "watchListCommentary", label: "관찰 대상" },
  { key: "nextQuarterFocus", label: "다음 분기 계획" },
];

/**
 * 실제 포트폴리오 데이터로 LP 분기 보고서 본문을 생성한다.
 * 수치는 코드로 계산하고, AI는 서술만 담당한다.
 */
export async function generateLpNarrative(params: {
  fund: LpFundInput;
  companies: LpCompanyInput[];
  period: string;
  computed: LpReportComputed;
}): Promise<{ sections: LpReportSections; modelUsed: string }> {
  const { fund, companies, period, computed } = params;
  const m = computed.metrics;

  const factBlock = [
    "## 확정 수치 (그대로 인용, 변형 금지)",
    `- 펀드: ${fund.name} (${fund.vintageYear} vintage), 결성 ${fund.fundSize}억, 납입 ${fund.paidIn}억`,
    `- 투자 원금 ${m.totalInvested}억 · 소진율 ${computed.deployedPercent}%`,
    `- 미실현 ${m.unrealizedValue}억 · 실현 ${m.realizedValue}억 · 총 가치 ${m.totalValue}억`,
    `- MOIC ${m.moic}x · TVPI ${m.tvpi}x · DPI ${m.dpi}x · RVPI ${m.rvpi}x`,
    `- 보유사 ${m.companyCount}개 (정상 ${m.activeCount} / 관찰·위험 ${m.riskCount} / 회수 ${m.exitedCount})`,
    `- 섹터 배분: ${computed.sectorAllocation
      .map((s) => `${s.sector} ${s.count}개 ${s.invested}억(${s.sharePercent}%)`)
      .join(", ")}`,
    computed.watchList.length
      ? `- 관찰 대상: ${computed.watchList.join(", ")}`
      : "- 관찰 대상: 없음",
  ].join("\n");

  const prompt = `## ${period} LP 분기 보고서 본문 작성

${factBlock}

## 포트폴리오 상세
${portfolioBlock(companies) || "등록된 포트폴리오사 없음"}

## 작성 요청
아래 5개 섹션을 정확히 이 형식으로 출력하세요. 각 라벨은 대괄호로 감쌉니다.

[총평]
(분기 핵심 성과·펀드 현황·주요 이슈. 300~450자)

[포트폴리오 현황]
(보유사별 성과 요약. 위 수치를 그대로 인용. 400~600자)

[분기 하이라이트]
(성장·마일스톤·회수 등 긍정 이벤트. 250~400자)

[관찰 대상]
(관찰·위험 등급 기업의 현황과 대응 계획. 각 항목에 모니터링 지표 1개. 250~400자)

[다음 분기 계획]
(후속 투자·신규 딜·사후관리 우선순위. 200~350자)

규칙:
- 위 "확정 수치"에 없는 숫자를 만들지 말 것. 없으면 "확인 필요"
- LP 신뢰를 위해 리스크도 솔직히 서술
- 문어체(~임, ~함), 과도한 확신 표현 금지`;

  const result = await generateText([{ role: "user", content: prompt }], {
    systemPrompt: `당신은 한국 벤처캐피탈의 IR 담당자입니다. LP에게 발송하는 분기 보고서를 전문적이고 투명하게 작성합니다.
MOIC/TVPI/DPI/RVPI 등 업계 표준 용어를 정확히 사용하고, 제공된 수치만 인용합니다.`,
    maxTokens: 4096,
    temperature: 0.3,
  });

  return {
    sections: parseLpSections(result.content),
    modelUsed: result.usedModel,
  };
}

export function parseLpSections(text: string): LpReportSections {
  const grab = (label: string) => {
    const re = new RegExp(`\\[${label}\\]\\s*([\\s\\S]*?)(?=\\n\\s*\\[|$)`);
    return re.exec(text)?.[1]?.trim() ?? "";
  };
  const out = {} as LpReportSections;
  for (const { key, label } of SECTION_LABELS) {
    out[key] = grab(label);
  }
  // 형식이 깨진 경우 전체 본문을 총평에 넣어 내용 손실을 막는다
  if (!out.executiveSummary && text.trim()) {
    out.executiveSummary = text.trim();
  }
  return out;
}

/** 저장·내보내기용 마크다운 본문 */
export function renderLpMarkdown(params: {
  fund: LpFundInput;
  period: string;
  computed: LpReportComputed;
  sections: LpReportSections;
}): string {
  const { fund, period, computed, sections } = params;
  const m = computed.metrics;

  const metricTable = [
    "| 지표 | 값 |",
    "|------|-----|",
    `| 결성 총액 | ${fund.fundSize.toLocaleString()}억원 |`,
    `| 납입 자본 | ${fund.paidIn.toLocaleString()}억원 |`,
    `| 투자 원금 | ${m.totalInvested.toLocaleString()}억원 (소진율 ${computed.deployedPercent}%) |`,
    `| 미실현 가치 | ${m.unrealizedValue.toLocaleString()}억원 |`,
    `| 실현 회수 | ${m.realizedValue.toLocaleString()}억원 |`,
    `| 총 가치 | ${m.totalValue.toLocaleString()}억원 |`,
    `| MOIC | ${m.moic.toFixed(2)}x |`,
    `| TVPI | ${m.tvpi.toFixed(2)}x |`,
    `| DPI | ${m.dpi.toFixed(2)}x |`,
    `| RVPI | ${m.rvpi.toFixed(2)}x |`,
  ].join("\n");

  const sectorTable = [
    "| 섹터 | 보유사 | 투자원금 | 현재가치 | 비중 |",
    "|------|--------|----------|----------|------|",
    ...computed.sectorAllocation.map(
      (s) =>
        `| ${s.sector} | ${s.count} | ${s.invested.toLocaleString()}억 | ${s.currentValue.toLocaleString()}억 | ${s.sharePercent}% |`
    ),
  ].join("\n");

  return [
    `# ${fund.name} — ${period} LP 리포트`,
    "",
    "## 1. 총평",
    sections.executiveSummary || "확인 필요",
    "",
    "## 2. 펀드 성과 지표",
    metricTable,
    "",
    "## 3. 섹터 배분",
    computed.sectorAllocation.length ? sectorTable : "등록된 포트폴리오사 없음",
    "",
    "## 4. 포트폴리오 현황",
    sections.portfolioSummary || "확인 필요",
    "",
    "## 5. 분기 하이라이트",
    sections.quarterlyHighlights || "확인 필요",
    "",
    "## 6. 관찰 대상",
    sections.watchListCommentary || "해당 없음",
    "",
    "## 7. 다음 분기 계획",
    sections.nextQuarterFocus || "확인 필요",
  ].join("\n");
}

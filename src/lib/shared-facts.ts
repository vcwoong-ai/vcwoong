/**
 * IR/딜 문서에서 공유 팩트를 추출해 섹션 간 일관성을 높인다.
 */

export interface SharedDealFacts {
  companyName: string;
  sector: string;
  investRound?: string;
  investAmount?: number;
  valuation?: number;
  metrics: Record<string, string>;
  clinicalPhase?: string;
  summaryLines: string[];
}

const METRIC_PATTERNS: Array<{ key: string; re: RegExp }> = [
  { key: "ARR", re: /ARR[:\s]*[₩$]?\s*([\d,.]+)\s*(억|백만|만|M|K|원)?/i },
  { key: "NRR", re: /NRR[:\s]*([\d.]+)\s*%?/i },
  { key: "MRR", re: /MRR[:\s]*[₩$]?\s*([\d,.]+)/i },
  { key: "LTV/CAC", re: /LTV\s*[/／]\s*CAC[:\s]*([\d.]+)/i },
  { key: "Churn", re: /(?:Churn|이탈률)[:\s]*([\d.]+)\s*%?/i },
  { key: "TPV", re: /TPV[:\s]*[₩$]?\s*([\d,.]+)/i },
  { key: "Take Rate", re: /Take\s*Rate[:\s]*([\d.]+)\s*%?/i },
  { key: "직원수", re: /(?:임직원|직원)\s*([\d,]+)\s*명/ },
];

const PHASE_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "Phase III", re: /phase\s*3|phase\s*III|임상\s*3상/i },
  { label: "Phase II", re: /phase\s*2|phase\s*II|임상\s*2상/i },
  { label: "Phase I", re: /phase\s*1|phase\s*I|임상\s*1상/i },
  { label: "전임상", re: /전임상|preclinical/i },
  { label: "NDA/BLA", re: /NDA|BLA|허가\s*신청/i },
];

export function extractSharedFacts(input: {
  companyName: string;
  sector: string;
  investRound?: string;
  investAmount?: number;
  valuation?: number;
  documents: Array<{ name: string; parsedText: string | null }>;
}): SharedDealFacts {
  const text = input.documents
    .map((d) => d.parsedText ?? "")
    .join("\n")
    .slice(0, 20000);

  const metrics: Record<string, string> = {};
  for (const { key, re } of METRIC_PATTERNS) {
    const m = re.exec(text);
    if (m) metrics[key] = m[0].trim();
  }

  let clinicalPhase: string | undefined;
  for (const { label, re } of PHASE_PATTERNS) {
    if (re.test(text)) {
      clinicalPhase = label;
      break;
    }
  }

  const summaryLines: string[] = [
    `기업: ${input.companyName}`,
    `섹터: ${input.sector}`,
  ];
  if (input.investRound) summaryLines.push(`라운드: ${input.investRound}`);
  if (input.investAmount != null)
    summaryLines.push(`투자금액: ${input.investAmount}억원`);
  if (input.valuation != null)
    summaryLines.push(`Post-money: ${input.valuation}억원`);
  if (clinicalPhase) summaryLines.push(`임상단계: ${clinicalPhase}`);
  for (const [k, v] of Object.entries(metrics)) {
    summaryLines.push(`${k}: ${v}`);
  }

  return {
    companyName: input.companyName,
    sector: input.sector,
    investRound: input.investRound,
    investAmount: input.investAmount,
    valuation: input.valuation,
    metrics,
    clinicalPhase,
    summaryLines,
  };
}

export function formatSharedFactsForPrompt(facts: SharedDealFacts): string {
  return [
    "## 공유 팩트 (섹션 간 반드시 일치시킬 것)",
    ...facts.summaryLines.map((l) => `- ${l}`),
    "",
    "규칙:",
    "- 위 수치가 없으면 '확인 필요'로 쓰고 임의 숫자를 만들지 말 것",
    "- 이전 섹션과 라운드/밸류/ARR/임상단계가 달라지면 안 됨",
  ].join("\n");
}

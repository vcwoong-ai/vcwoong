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
  /** 투자 수단·지분 등 텀시트성 팩트 */
  terms: Record<string, string>;
  summaryLines: string[];
}

/**
 * 지표 패턴. 금액성 지표는 단위(조/억)를 요구하고,
 * 값 앞 구간에서 FY24 같은 회계연도 토큰은 건너뛴다.
 */
const METRIC_PATTERNS: Array<{ key: string; re: RegExp }> = [
  { key: "ARR", re: /ARR[^\n]{0,24}?([\d,.]+)\s*(억|백만|만|M|K)/i },
  { key: "NRR", re: /NRR[^\d\n]{0,8}?([\d.]+)\s*%?/i },
  { key: "MRR", re: /MRR[^\n]{0,24}?([\d,.]+)\s*(억|백만|만|M|K)/i },
  { key: "LTV/CAC", re: /LTV\s*[/／]\s*CAC[^\d\n]{0,8}?([\d.]+)/i },
  { key: "Churn", re: /(?:Churn|이탈률)[^\d\n]{0,8}?([\d.]+)\s*%?/i },
  { key: "TPV", re: /TPV[^\n]{0,28}?([\d,.]+)\s*(조|억)/i },
  { key: "Take Rate", re: /Take\s*Rate[^\d\n]{0,8}?([\d.]+)\s*%?/i },
  { key: "GMV", re: /GMV[^\n]{0,28}?([\d,.]+)\s*(조|억)/i },
  { key: "AOV", re: /AOV[^\d\n]{0,8}?([\d,.]+)\s*(원)?/i },
  { key: "CAC", re: /(?:^|[^/\w])CAC[^\d\n]{0,8}?([\d,.]+)/im },
  {
    key: "LTV",
    re: /(?:^|[^/\w])LTV(?!\s*[/／]\s*CAC)[^\d\n]{0,8}?([\d,.]+)/im,
  },
  { key: "ROAS", re: /ROAS[^\d\n]{0,8}?([\d.]+)\s*x?/i },
  { key: "재구매율", re: /재구매율[^\d\n]{0,8}?([\d.]+)\s*%?/i },
  {
    key: "감축량",
    re: /(?:감축|tCO2e|tCO₂e)[^\d\n]{0,20}?([\d,.]+)\s*(tCO2e|tCO₂e|톤)?/i,
  },
  { key: "EBITDA", re: /EBITDA[^\d\n]{0,12}?([\d,.]+)\s*%/i },
  {
    key: "Gross Margin",
    re: /(?:Gross\s*Margin|매출총이익률)[^\d\n]{0,8}?([\d.]+)\s*%?/i,
  },
  { key: "CAPA", re: /CAPA[^\d\n]{0,20}?([\d,.]{2,})\s*(?:만|억|대|개|톤|\/)/i },
  { key: "직원수", re: /(?:임직원|직원)\s*([\d,]+)\s*명/ },
];

const PHASE_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "Phase III", re: /phase\s*3|phase\s*III|임상\s*3상/i },
  { label: "Phase II", re: /phase\s*2|phase\s*II|임상\s*2상/i },
  { label: "Phase I", re: /phase\s*1|phase\s*I|임상\s*1상/i },
  { label: "전임상", re: /전임상|preclinical/i },
  {
    // 비밀유지계약(NDA)과 구분하기 위해 허가 맥락을 요구한다
    label: "NDA/BLA",
    re: /\bBLA\b|(?:NDA|BLA)\s*(?:submission|submitted|filing|신청|제출|승인)|신약\s*허가\s*신청|품목\s*허가\s*신청/i,
  },
];

/** FY24, 2024 같은 회계연도 토큰인지 */
function isYearToken(raw: string): boolean {
  return /^(19|20)\d{2}$/.test(raw.replace(/,/g, ""));
}

const TERM_PATTERNS: Array<{ key: string; re: RegExp }> = [
  { key: "투자수단", re: /\b(RCPS|SAFE|CB|보통주|우선주|전환사채)\b/i },
  {
    key: "지분율",
    re: /지분(?:율)?[^\d\n]{0,8}?([\d.]+)\s*%/,
  },
  {
    key: "청산우선",
    re: /청산우선[^\n]{0,40}?(1x|2x|Non-participating|Participating)/i,
  },
  {
    key: "희석방지",
    re: /(Broad-based|Weighted\s*Average|Full\s*Ratchet|Anti-?dilution)/i,
  },
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
    if (!m) continue;
    if (m[1] && isYearToken(m[1])) continue;
    const value = [m[1], m[2]].filter(Boolean).join("").trim();
    if (!value) continue;
    metrics[key] = value;
  }

  let clinicalPhase: string | undefined;
  for (const { label, re } of PHASE_PATTERNS) {
    if (re.test(text)) {
      clinicalPhase = label;
      break;
    }
  }

  const terms: Record<string, string> = {};
  for (const { key, re } of TERM_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    terms[key] = (m[1] ?? m[0]).trim();
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
  for (const [k, v] of Object.entries(terms)) {
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
    terms,
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
    "- 이전 섹션과 라운드/밸류/ARR/GMV/감축량/임상단계/텀시트 핵심이 달라지면 안 됨",
  ].join("\n");
}

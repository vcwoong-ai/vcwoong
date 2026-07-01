/**
 * IR 문서 텍스트에서 SaaS 핵심 지표 추출 + Bessemer 벤치마크 분석
 */

import {
  analyzeSaaSMetrics,
  computeDerivedMetrics,
  type SaaSMetrics,
} from "@/agents/sectors/it-saas/saas-metrics";

function parseNumber(raw: string, unit?: "million_usd" | "억원" | "percent"): number | undefined {
  const n = parseFloat(raw.replace(/,/g, ""));
  if (Number.isNaN(n)) return undefined;
  if (unit === "million_usd") return Math.round(n * 13.5 / 10) / 10; // USD M → 억원 근사
  return n;
}

export function extractSaaSMetricsFromText(text: string): SaaSMetrics {
  const metrics: SaaSMetrics = {};

  const arrUsd = text.match(/ARR\s*\$?\s*([\d,.]+)\s*M/i);
  if (arrUsd) metrics.arr = parseNumber(arrUsd[1], "million_usd");

  const arrKrw = text.match(/ARR\s*([\d,.]+)\s*억/i);
  if (arrKrw) metrics.arr = parseNumber(arrKrw[1]);

  const nrr = text.match(/NRR\s*(\d{2,3})\s*%/i) ?? text.match(/NDR\s*(\d{2,3})\s*%/i);
  if (nrr) metrics.nrr = parseNumber(nrr[1]);

  const churn = text.match(/[Cc]hurn\s*([\d.]+)\s*%/i);
  if (churn) metrics.grossChurn = parseNumber(churn[1]);

  const ltvCac = text.match(/LTV\s*\/\s*CAC\s*([\d.]+)/i);
  if (ltvCac) metrics.ltvCacRatio = parseNumber(ltvCac[1]);

  const magic = text.match(/[Mm]agic\s*[Nn]umber\s*([\d.]+)/i);
  if (magic) metrics.magicNumber = parseNumber(magic[1]);

  const margin = text.match(/매출총이익률\s*(\d{2,3})\s*%/i) ?? text.match(/[Gg]ross\s*[Mm]argin\s*(\d{2,3})\s*%/i);
  if (margin) metrics.grossMargin = parseNumber(margin[1]);

  const growth = text.match(/(?:YoY|성장률)\s*(\d{2,3})\s*%/i) ?? text.match(/(\d{2,3})\s*%\s*(?:YoY|성장)/i);
  if (growth) metrics.arrGrowthYoY = parseNumber(growth[1]);

  const payback = text.match(/(?:Payback|회수)\s*(?:기간|Period)?\s*(\d{1,2})\s*개?월/i);
  if (payback) metrics.paybackPeriod = parseNumber(payback[1]);

  return computeDerivedMetrics(metrics);
}

export function formatSaaSAnalysisForPrompt(text: string): string {
  const metrics = extractSaaSMetricsFromText(text);
  const hasData = Object.values(metrics).some((v) => v !== undefined && v !== null);
  if (!hasData) return "";

  const analysis = analyzeSaaSMetrics(metrics);

  const lines = [
    "## 📊 Code 에이전트 — SaaS 지표 자동 분석 (Bessemer 벤치마크)",
    `- 스테이지: **${analysis.stage.replace("_", " ")}**`,
    `- 종합 평가: ${analysis.summary}`,
  ];

  if (metrics.arr) lines.push(`- ARR: ${metrics.arr}억원`);
  if (metrics.nrr) lines.push(`- NRR: ${metrics.nrr}% (${analysis.ratings.nrr ?? "N/A"})`);
  if (metrics.ltvCacRatio) lines.push(`- LTV/CAC: ${metrics.ltvCacRatio}x`);
  if (metrics.ruleOf40) lines.push(`- Rule of 40: ${metrics.ruleOf40}`);

  lines.push(
    `- 임플라이드 밸류 (ARR 배수): ${analysis.impliedValuation.low}~${analysis.impliedValuation.high}억원 (중간 ${analysis.impliedValuation.mid}억원)`
  );

  if (analysis.strengths.length) {
    lines.push("\n**강점:**\n" + analysis.strengths.map((s) => `- ${s}`).join("\n"));
  }
  if (analysis.concerns.length) {
    lines.push("\n**우려:**\n" + analysis.concerns.map((c) => `- ${c}`).join("\n"));
  }

  return "\n\n" + lines.join("\n") + "\n";
}
